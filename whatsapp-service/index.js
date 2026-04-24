/**
 * ZapFlow - Baileys microservice
 * Exposes HTTP endpoints for session management and sends real-time
 * events (QR, status, message updates) to FastAPI via webhook.
 *
 * Runs on PORT 3003 (internal only).
 */
const express = require("express");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const pino = require("pino");
const QRCode = require("qrcode");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = require("@whiskeysockets/baileys");

const PORT = process.env.WA_PORT || 3003;
const SESSIONS_DIR = process.env.WA_SESSIONS_DIR || "/app/whatsapp-sessions";
const WEBHOOK_URL = process.env.WA_WEBHOOK_URL || "http://0.0.0.0:8000/api/whatsapp/webhook";
const WEBHOOK_SECRET = process.env.WA_WEBHOOK_SECRET || "zapflow-webhook-secret";

fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const logger = pino({ level: "warn" }).child({ stream: "baileys" });
const sessions = new Map(); // sessionId -> { sock, qrBase64, status, phone, lidMap }

// ---------- LID <-> phone persistent mapping ----------
// WhatsApp delivers inbound messages keyed by an opaque LID
// (e.g. "12345@lid") instead of the real phone JID. Before the user replies
// we resolve their phone via sock.onWhatsApp() (on send) — that response
// includes the lid, so we persist a {lid_digits -> phone_digits} map per
// session and use it on incoming messages.
function lidMapPath(sessionId) {
  return path.join(SESSIONS_DIR, sessionId, "lid-map.json");
}

function loadLidMap(sessionId) {
  try {
    const raw = fs.readFileSync(lidMapPath(sessionId), "utf8");
    return new Map(Object.entries(JSON.parse(raw) || {}));
  } catch (_) {
    return new Map();
  }
}

function saveLidMap(sessionId, map) {
  try {
    const obj = Object.fromEntries(map);
    fs.writeFileSync(lidMapPath(sessionId), JSON.stringify(obj));
  } catch (err) {
    console.warn("[lidmap] save failed:", err?.message);
  }
}

function digitsOf(jid) {
  return String(jid || "").split("@")[0].replace(/\D/g, "");
}

function recordLidMapping(sessionId, lidJid, phoneJid) {
  if (!lidJid || !phoneJid) return;
  const lidD = digitsOf(lidJid);
  const phoneD = digitsOf(phoneJid);
  if (!lidD || !phoneD) return;
  const s = sessions.get(sessionId);
  if (!s) return;
  if (!s.lidMap) s.lidMap = loadLidMap(sessionId);
  if (s.lidMap.get(lidD) !== phoneD) {
    s.lidMap.set(lidD, phoneD);
    saveLidMap(sessionId, s.lidMap);
    console.log(`[lidmap] ${sessionId}: ${lidD} -> ${phoneD}`);
    // Notify backend so any orphan conversation under the LID gets merged
    // into the real phone thread retroactively.
    sendWebhook({
      event: "lid_mapping",
      session_id: sessionId,
      user_id: s.userId,
      lid: lidD,
      phone: phoneD,
    }).catch(() => {});
  }
}

function resolvePhoneFromJid(sessionId, jid) {
  if (!jid) return jid;
  if (jid.endsWith("@s.whatsapp.net")) return jid;
  if (jid.endsWith("@lid")) {
    const s = sessions.get(sessionId);
    if (s?.lidMap) {
      const phoneD = s.lidMap.get(digitsOf(jid));
      if (phoneD) return `${phoneD}@s.whatsapp.net`;
    }
  }
  return jid;
}

async function sendWebhook(payload) {
  try {
    await axios.post(WEBHOOK_URL, payload, {
      headers: { "X-Webhook-Secret": WEBHOOK_SECRET },
      timeout: 10000,
    });
  } catch (err) {
    console.error("[webhook] failed:", err?.message || err);
  }
}

async function startSession(sessionId, userId, displayName) {
  if (sessions.has(sessionId)) {
    const existing = sessions.get(sessionId);
    if (existing.status === "conectado") return existing;
    try { existing.sock?.end?.(); } catch (_) {}
  }

  const authDir = path.join(SESSIONS_DIR, sessionId);
  fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: Browsers.macOS("ZapFlow"),
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  const entry = {
    sock,
    qrBase64: null,
    status: "conectando",
    phone: null,
    userId,
    displayName,
    lidMap: loadLidMap(sessionId),
  };
  sessions.set(sessionId, entry);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrBase64 = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
        entry.qrBase64 = qrBase64;
        entry.status = "aguardando_qr";
        await sendWebhook({
          event: "qr",
          session_id: sessionId,
          user_id: userId,
          qr: qrBase64,
          status: "aguardando_qr",
        });
      } catch (err) {
        console.error("[qr] encode failed:", err?.message);
      }
    }

    if (connection === "open") {
      entry.status = "conectado";
      entry.qrBase64 = null;
      entry.phone = sock.user?.id?.split(":")[0] || null;
      await sendWebhook({
        event: "connected",
        session_id: sessionId,
        user_id: userId,
        phone_number: entry.phone,
        status: "conectado",
      });
      console.log(`[session ${sessionId}] CONNECTED as ${entry.phone}`);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      entry.status = loggedOut ? "desconectado" : "conectando";
      entry.qrBase64 = null;

      await sendWebhook({
        event: loggedOut ? "logged_out" : "disconnected",
        session_id: sessionId,
        user_id: userId,
        status: entry.status,
      });

      console.log(`[session ${sessionId}] closed. loggedOut=${loggedOut}`);

      if (loggedOut) {
        // wipe auth and remove from map
        try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (_) {}
        sessions.delete(sessionId);
      } else {
        // auto-reconnect after 3s
        setTimeout(() => {
          startSession(sessionId, userId, displayName).catch((e) =>
            console.error("[reconnect] failed:", e?.message)
          );
        }, 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    for (const msg of m.messages) {
      if (msg.key.fromMe) continue;
      const rawJid = msg.key.remoteJid || "";
      // Try, in order: Baileys-populated senderPn, our recorded LID->phone
      // mapping, and finally fall back to the raw JID.
      const senderPn = msg.key.senderPn || "";
      let from = rawJid;
      if (rawJid.endsWith("@lid")) {
        if (senderPn) {
          from = senderPn;
          recordLidMapping(sessionId, rawJid, senderPn);
        } else {
          from = resolvePhoneFromJid(sessionId, rawJid);
        }
      }
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";
      await sendWebhook({
        event: "incoming_message",
        session_id: sessionId,
        user_id: userId,
        from,
        from_raw: rawJid,
        push_name: msg.pushName || null,
        text,
      }).catch(() => {});
    }
  });

  return entry;
}

async function stopSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return false;
  try {
    await s.sock?.logout?.();
  } catch (_) {}
  try {
    s.sock?.end?.();
  } catch (_) {}
  // Keep auth unless logout succeeded — remove auth dir to be safe? We remove on explicit delete.
  sessions.delete(sessionId);
  return true;
}

async function deleteSession(sessionId) {
  await stopSession(sessionId);
  const authDir = path.join(SESSIONS_DIR, sessionId);
  try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (_) {}
  return true;
}

function jidFromPhone(number) {
  const digits = String(number).replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

/**
 * Resolve and validate a phone number against WhatsApp servers.
 * Returns the authoritative JID (WhatsApp may use a different digit
 * sequence, e.g. Brazilian numbers without the extra '9').
 */
async function resolveJid(sock, number, sessionId) {
  const raw = jidFromPhone(number);
  try {
    const [result] = await sock.onWhatsApp(raw);
    if (result?.exists && result.jid) {
      // Record LID<->phone mapping if Baileys returned it (newer versions do).
      if (result.lid && sessionId) recordLidMapping(sessionId, result.lid, result.jid);
      return result.jid;
    }
  } catch (err) {
    console.warn("[onWhatsApp] failed for", raw, err?.message);
  }
  // Brazilian number trick: try removing the 9 after DDD (5511 9XXXXYYYY -> 5511 XXXXYYYY)
  const digits = String(number).replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    const alt = digits.slice(0, 4) + digits.slice(5); // drop the first digit after DDD
    try {
      const [result2] = await sock.onWhatsApp(`${alt}@s.whatsapp.net`);
      if (result2?.exists && result2.jid) {
        if (result2.lid && sessionId) recordLidMapping(sessionId, result2.lid, result2.jid);
        return result2.jid;
      }
    } catch (_) {}
  }
  return null;
}

async function sendText(sessionId, number, text) {
  const s = sessions.get(sessionId);
  if (!s || !s.sock) throw new Error("Session not active");
  if (s.status !== "conectado") throw new Error("Session not connected");
  const jid = await resolveJid(s.sock, number, sessionId);
  if (!jid) throw new Error(`Número ${number} não possui WhatsApp`);
  // Force-establish the Signal end-to-end session before sending. Without
  // this, recipients often see the "Waiting for this message" placeholder
  // because their device can't decrypt the first message.
  try {
    if (typeof s.sock.assertSessions === "function") {
      await s.sock.assertSessions([jid], true);
    }
  } catch (err) {
    console.warn("[assertSessions] warn:", err?.message);
  }
  const sent = await s.sock.sendMessage(jid, { text });
  console.log(`[send-text] sess=${sessionId} to=${jid} id=${sent?.key?.id}`);
  return { ok: true, jid, message_id: sent?.key?.id };
}

async function sendAudio(sessionId, number, audioBase64, mime = "audio/mp4") {
  const s = sessions.get(sessionId);
  if (!s || !s.sock) throw new Error("Session not active");
  if (s.status !== "conectado") throw new Error("Session not connected");
  const jid = await resolveJid(s.sock, number, sessionId);
  if (!jid) throw new Error(`Número ${number} não possui WhatsApp`);
  try {
    if (typeof s.sock.assertSessions === "function") {
      await s.sock.assertSessions([jid], true);
    }
  } catch (err) {
    console.warn("[assertSessions] warn:", err?.message);
  }
  const buffer = Buffer.from(audioBase64, "base64");
  const sent = await s.sock.sendMessage(jid, {
    audio: buffer,
    mimetype: mime,
    ptt: true,
  });
  console.log(`[send-audio] sess=${sessionId} to=${jid} id=${sent?.key?.id}`);
  return { ok: true, jid, message_id: sent?.key?.id };
}

// ------ HTTP API ------
const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_, res) => res.json({ ok: true, sessions: sessions.size }));

app.post("/session/start", async (req, res) => {
  const { session_id, user_id, display_name } = req.body || {};
  if (!session_id || !user_id)
    return res.status(400).json({ error: "session_id and user_id required" });
  try {
    const entry = await startSession(session_id, user_id, display_name);
    res.json({
      status: entry.status,
      qr: entry.qrBase64,
      phone_number: entry.phone,
    });
  } catch (err) {
    console.error("[/session/start] error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to start session" });
  }
});

app.get("/session/:id/status", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.json({ status: "desconectado" });
  res.json({ status: s.status, qr: s.qrBase64, phone_number: s.phone });
});

app.post("/session/:id/stop", async (req, res) => {
  await stopSession(req.params.id);
  res.json({ ok: true });
});

app.post("/session/:id/delete", async (req, res) => {
  await deleteSession(req.params.id);
  res.json({ ok: true });
});

app.post("/session/:id/send-text", async (req, res) => {
  const { number, text } = req.body || {};
  if (!number || !text) return res.status(400).json({ error: "number and text required" });
  try {
    const r = await sendText(req.params.id, number, text);
    res.json(r);
  } catch (err) {
    console.error("[send-text] error:", err?.message);
    res.status(400).json({ error: err?.message });
  }
});

app.post("/session/:id/send-audio", async (req, res) => {
  const { number, audio_base64, mime } = req.body || {};
  if (!number || !audio_base64) return res.status(400).json({ error: "number and audio_base64 required" });
  try {
    const r = await sendAudio(req.params.id, number, audio_base64, mime);
    res.json(r);
  } catch (err) {
    console.error("[send-audio] error:", err?.message);
    res.status(400).json({ error: err?.message });
  }
});

// Auto-restore sessions on boot (reconnect). Asks backend which sessions
// belong to which users, so orphan auth dirs (DB deleted but folder left)
// are wiped instead of reconnected as ghosts. Retries with backoff if
// backend isn't ready yet.
async function restoreSessions(attempt = 1) {
  let dirs = [];
  try {
    dirs = fs.readdirSync(SESSIONS_DIR).filter((d) => {
      const full = path.join(SESSIONS_DIR, d);
      return fs.statSync(full).isDirectory() &&
        fs.existsSync(path.join(full, "creds.json"));
    });
  } catch (err) {
    console.error("[restore] dir read failed:", err?.message);
    return;
  }

  if (dirs.length === 0) {
    console.log("[restore] no sessions to restore");
    return;
  }

  // Call backend to resolve which dirs map to live DB sessions
  let mapping = {};
  try {
    const resp = await axios.post(
      `${WEBHOOK_URL.replace(/\/webhook$/, "")}/resolve-sessions`,
      { session_ids: dirs },
      { headers: { "X-Webhook-Secret": WEBHOOK_SECRET }, timeout: 8000 }
    );
    mapping = resp.data?.mapping || {};
  } catch (err) {
    // Retry with backoff (backend may still be starting)
    if (attempt < 10) {
      const delay = Math.min(2000 * attempt, 10000);
      console.log(`[restore] backend not ready (attempt ${attempt}), retrying in ${delay}ms: ${err?.message}`);
      setTimeout(() => restoreSessions(attempt + 1), delay);
    } else {
      console.error("[restore] gave up after 10 attempts:", err?.message);
    }
    return;
  }

  for (const sid of dirs) {
    const userId = mapping[sid];
    if (!userId) {
      try {
        fs.rmSync(path.join(SESSIONS_DIR, sid), { recursive: true, force: true });
        console.log(`[restore] wiped orphan dir ${sid}`);
      } catch (_) {}
      continue;
    }
    console.log(`[restore] starting session ${sid} for user ${userId}`);
    startSession(sid, userId, sid).catch((e) =>
      console.error("[restore] failed:", sid, e?.message)
    );
  }
}

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[zapflow-wa] listening on 0.0.0.0:${PORT}`);
  console.log(`[zapflow-wa] sessions dir: ${SESSIONS_DIR}`);
  console.log(`[zapflow-wa] webhook: ${WEBHOOK_URL}`);
  await restoreSessions();
});
