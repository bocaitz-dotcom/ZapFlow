import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { apiClient } from "../lib/api";
import { useWebSocket } from "../lib/ws";
import {
  Send, Search, Loader2, Plus, X, Check, CheckCheck, AlertCircle,
  Download, Play, Pause, Volume2, GripVertical, Palette, Bell,
} from "lucide-react";
import { toast } from "sonner";

// ─── Notification sound ──────────────────────────────────────────────────────

let _audioCtx = null;

function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_audioCtx || _audioCtx.state === "closed") _audioCtx = new AC();
  return _audioCtx;
}

// Warm up AudioContext on first user gesture so it's never suspended when needed
if (typeof document !== "undefined") {
  document.addEventListener("click", () => getAudioCtx(), { once: true });
}

function playNotificationSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;

    const play = () => {
      const now = ctx.currentTime;
      // Two rising notes — C6 (1047 Hz) then E6 (1319 Hz)
      [[1047, 0, 0.13], [1319, 0.16, 0.16]].forEach(([freq, t, dur]) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.connect(env);
        env.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        env.gain.setValueAtTime(0, now + t);
        env.gain.linearRampToValueAtTime(0.42, now + t + 0.012);
        env.gain.exponentialRampToValueAtTime(0.001, now + t + dur);
        osc.start(now + t);
        osc.stop(now + t + dur + 0.05);
      });
    };

    ctx.state === "suspended" ? ctx.resume().then(play) : play();
  } catch {}
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const diff = (now - d) / 86400000;
    if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
  } catch { return ""; }
}

function fmtPhone(p) {
  const s = String(p || "");
  if (s.startsWith("55") && s.length >= 12) {
    const ddd = s.slice(2, 4);
    const rest = s.slice(4);
    const mid = rest.length === 9
      ? `${rest.slice(0, 5)}-${rest.slice(5)}`
      : `${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `+55 (${ddd}) ${mid}`;
  }
  return `+${s}`;
}

// Canonical phone key — strips non-digits, ensures 55 prefix, promotes
// 8-digit BR mobile (12 total) to 9-digit (13 total) for stable comparison.
function normPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (!d) return d;
  const n = d.startsWith("55") ? d : "55" + d;
  return n.length === 12 && n[4] === "9" ? n.slice(0, 4) + "9" + n.slice(4) : n;
}

// ─── Color palettes ──────────────────────────────────────────────────────────

const COL_COLORS = {
  blue:    { bg: "rgba(59,130,246,0.18)",   dot: "#3b82f6" },
  purple:  { bg: "rgba(139,92,246,0.18)",   dot: "#8b5cf6" },
  rose:    { bg: "rgba(244,63,94,0.18)",    dot: "#f43f5e" },
  amber:   { bg: "rgba(245,158,11,0.18)",   dot: "#f59e0b" },
  emerald: { bg: "rgba(16,185,129,0.18)",   dot: "#10b981" },
  sky:     { bg: "rgba(14,165,233,0.18)",   dot: "#0ea5e9" },
  orange:  { bg: "rgba(249,115,22,0.18)",   dot: "#f97316" },
  teal:    { bg: "rgba(20,184,166,0.18)",   dot: "#14b8a6" },
};

const CONTACT_COLORS = {
  gray:   "#6b7280",
  green:  "#25D366",
  yellow: "#eab308",
  red:    "#ef4444",
  blue:   "#3b82f6",
  purple: "#8b5cf6",
  orange: "#f97316",
};

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ name, phone, size = 28 }) {
  const str = name || phone || "?";
  const initials = str.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const palette = ["#25D366", "#128C7E", "#34B7F1", "#8b5cf6", "#f59e0b", "#f43f5e", "#0ea5e9"];
  const color = palette[str.charCodeAt(0) % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${color}22`, border: `1px solid ${color}44`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.37, fontWeight: 600, color, flexShrink: 0,
    }}>
      {initials[0]}
    </div>
  );
}

// ─── StatusIcon (para o modal de chat) ───────────────────────────────────────

function StatusIcon({ status }) {
  const s = (status || "").toLowerCase();
  if (s === "falha") return <AlertCircle size={11} style={{ color: "#f87171" }} />;
  if (s === "lido" || s === "read" || s === "played" || s === "respondido")
    return <CheckCheck size={11} style={{ color: "#38bdf8" }} />;
  if (s === "entregue") return <CheckCheck size={11} style={{ color: "#737373" }} />;
  return <Check size={11} style={{ color: "#737373" }} />;
}

// ─── AudioPlayer ─────────────────────────────────────────────────────────────

function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onMeta = () => setDuration(a.duration);
    const onTime = () => setCurrent(a.currentTime);
    const onEnd = () => setPlaying(false);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setPlaying(!playing);
  };

  const fmt = (t) => {
    if (!t || isNaN(t)) return "0:00";
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  };

  const seek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (audioRef.current) audioRef.current.currentTime = pct * duration;
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "rgba(37,211,102,0.1)", borderRadius: 20,
      padding: "6px 10px", border: "0.5px solid rgba(37,211,102,0.2)",
      maxWidth: 220,
    }}>
      <audio ref={audioRef} src={src} />
      <button
        onClick={toggle}
        style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "#25D366", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        {playing
          ? <Pause size={13} style={{ color: "#000", fill: "#000" }} />
          : <Play size={13} style={{ color: "#000", fill: "#000", marginLeft: 1 }} />}
      </button>
      <div style={{ flex: 1 }}>
        <div
          onClick={seek}
          style={{
            height: 3, background: "var(--zf-gr)", borderRadius: 99,
            cursor: "pointer", overflow: "hidden",
          }}
        >
          <div style={{
            height: "100%", background: "#25D366", borderRadius: 99,
            width: `${(current / duration) * 100 || 0}%`,
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--zf-t4)", marginTop: 2 }}>
          <span>{fmt(current)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
      <Volume2 size={12} style={{ color: "var(--zf-t4)", flexShrink: 0 }} />
    </div>
  );
}

// ─── ChatModal ────────────────────────────────────────────────────────────────

function ChatModal({ contact, onClose }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const phone = contact.phone;

  const loadMessages = useCallback(async () => {
    try {
      const r = await apiClient.get("/chat/messages", { params: { phone } });
      setMessages(r.data.messages || []);
      apiClient.post("/chat/read", null, { params: { phone } }).catch(() => {});
    } catch { toast.error("Erro ao carregar mensagens"); }
    finally { setLoading(false); }
  }, [phone]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  useWebSocket(useCallback((event) => {
    if (event?.type === "chat_console") {
      // Status update (enviado → entregue → lido)
      const upd = event.message;
      if (upd?.status && upd?.message_id) {
        const norm = (s) => {
          switch ((s || "").toUpperCase()) {
            case "RECEBIDO": case "ENTREGUE": return "entregue";
            case "LIDO": case "READ": case "PLAYED": return "lido";
            case "FALHA": return "falha";
            case "RESPONDIDO": return "respondido";
            default: return "enviado";
          }
        };
        setMessages(prev => prev.map(m =>
          (m.message_id === upd.message_id || m.id === upd.message_id)
            ? { ...m, status: norm(upd.status) }
            : m
        ));
      }
    } else if (
      (event?.type === "chat_incoming" || event?.type === "chat_outgoing") &&
      normPhone(event.message?.phone) === normPhone(phone)
    ) {
      const m = event.message;
      setMessages(prev => {
        if (m.message_id && m.message_id !== "0" && prev.some(x => x.message_id === m.message_id)) return prev;
        return [...prev, {
          id: m.id, message_id: m.message_id, direction: m.direction,
          content: m.media || m.content, media: m.media, media_type: m.media_type,
          created_at: m.created_at, status: m.status || "enviado",
        }];
      });
      if (m.direction === "in") {
        apiClient.post("/chat/read", null, { params: { phone } }).catch(() => {});
      }
    }
  }, [phone]));

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const r = await apiClient.post("/chat/send", {
        phone: contact.phone,
        text,
        session_id: contact.session_id || null,
      });
      setDraft("");
      const m = r.data.message;
      if (m) {
        // Guard against WS chat_outgoing arriving before HTTP response
        setMessages(prev => {
          if (m.message_id && m.message_id !== "0" && prev.some(x => x.message_id === m.message_id)) return prev;
          return [...prev, {
            id: m.id, message_id: m.message_id, direction: "out",
            content: m.content, media: m.media, media_type: m.media_type,
            created_at: m.created_at, status: m.status,
          }];
        });
      }
      if (!r.data.ok) toast.error(r.data.error || "Falha ao enviar");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Falha no envio");
    } finally { setSending(false); }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(860px, 95vw)", height: "min(680px, 92vh)",
          background: "var(--zf-s1)", border: "0.5px solid var(--zf-b5)",
          borderRadius: 16, display: "flex", flexDirection: "column",
          overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "12px 16px", borderBottom: "0.5px solid var(--zf-b1)",
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          background: "var(--zf-hd)",
        }}>
          <Avatar name={contact.name} phone={contact.phone} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--zf-t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {contact.name || fmtPhone(contact.phone)}
            </div>
            <div style={{ fontSize: 11, color: "var(--zf-t4)" }}>{fmtPhone(contact.phone)}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--zf-in)", border: "none", borderRadius: 8,
              cursor: "pointer", color: "var(--zf-t4)",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "14px 16px",
          background: "radial-gradient(800px 400px at 70% 10%, rgba(37,211,102,0.03), transparent 55%)",
        }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--zf-t4)", gap: 8 }}>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 12 }}>Carregando…</span>
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--zf-t5)", paddingTop: 60 }}>
              Nenhuma mensagem ainda.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {messages.map((m, i) => {
                const isOut = m.direction === "out";
                return (
                  <div key={m.message_id || m.id || i} style={{ display: "flex", justifyContent: isOut ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "72%",
                      background: isOut ? "#073037" : "var(--zf-mg)",
                      color: isOut ? "#e9edef" : "var(--zf-t1)",
                      borderRadius: isOut ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                      padding: "8px 12px",
                      border: isOut ? "none" : `0.5px solid var(--zf-mt)`,
                    }}>
                      {/* Media */}
                      {m.media && m.media_type === "audio" && (
                        <div style={{ marginBottom: m.content ? 6 : 0 }}>
                          <AudioPlayer src={m.media} />
                        </div>
                      )}
                      {m.media && m.media_type === "image" && (
                        <img src={m.media} alt="img" style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, objectFit: "cover", display: "block", marginBottom: 4 }} />
                      )}
                      {m.media && m.media_type === "video" && (
                        <video controls style={{ maxWidth: 220, borderRadius: 8, display: "block", marginBottom: 4 }}>
                          <source src={m.media} type="video/mp4" />
                        </video>
                      )}
                      {m.media && (m.media_type === "document" || m.media_type === "file") && (
                        <a href={m.media} download style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                          background: "var(--zf-bd)", borderRadius: 8, textDecoration: "none",
                          color: isOut ? "#e9edef" : "var(--zf-t1)", marginBottom: 4,
                        }}>
                          <Download size={14} />
                          <span style={{ fontSize: 12 }}>Baixar arquivo</span>
                        </a>
                      )}
                      {/* Text */}
                      {m.content && !m.content.startsWith("http") && (
                        <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {m.content}
                        </div>
                      )}
                      {/* Meta */}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end",
                        fontSize: 10, color: isOut ? "rgba(233,237,239,0.6)" : "var(--zf-t4)", marginTop: 4,
                      }}>
                        <span>{fmtTime(m.created_at)}</span>
                        {isOut && <StatusIcon status={m.status} />}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{
          padding: "10px 12px", borderTop: "0.5px solid var(--zf-b1)",
          display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0,
          background: "var(--zf-hd)",
        }}>
          <textarea
            rows={1}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Digite uma mensagem…"
            style={{
              flex: 1, resize: "none",
              background: "var(--zf-in)",
              border: `0.5px solid var(--zf-b3)`,
              borderRadius: 10, padding: "9px 13px",
              fontSize: 13, color: "var(--zf-t1)",
              outline: "none", maxHeight: 96,
              fontFamily: "Satoshi, system-ui, sans-serif",
            }}
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            style={{
              width: 38, height: 38, borderRadius: 10,
              background: draft.trim() && !sending ? "#25D366" : "rgba(37,211,102,0.25)",
              border: "none",
              cursor: draft.trim() && !sending ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#000", transition: "all 0.15s",
            }}
          >
            {sending
              ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite", color: "#000" }} />
              : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ContactCard ─────────────────────────────────────────────────────────────

function ContactCard({ contact, columnId, isDragging, onDragStart, onNameEdit, onColorChange, onFlagToggle, onOpenChat, onReminderSave }) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(contact.custom_name || contact.name || "");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [reminderPos, setReminderPos] = useState({ top: 0, left: 0 });
  const [hoverBell, setHoverBell] = useState(false);
  const [reminderText, setReminderText] = useState(contact.reminder_text || "");
  const [reminderAt, setReminderAt] = useState(contact.reminder_at ? contact.reminder_at.slice(0, 16) : "");
  const nameRef = useRef(null);
  const bellRef = useRef(null);

  useEffect(() => { if (editingName) nameRef.current?.focus(); }, [editingName]);
  useEffect(() => { setNameVal(contact.custom_name || contact.name || ""); }, [contact.custom_name, contact.name]);
  useEffect(() => {
    setReminderText(contact.reminder_text || "");
    setReminderAt(contact.reminder_at ? contact.reminder_at.slice(0, 16) : "");
  }, [contact.reminder_text, contact.reminder_at]);
  useEffect(() => {
    if (!showReminder) return;
    const close = () => setShowReminder(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showReminder]);

  const hasReminder = !!(contact.reminder_text || contact.reminder_at);

  const saveReminder = (e) => {
    e.stopPropagation();
    onReminderSave(contact.phone, reminderText.trim(), reminderAt || null);
    setShowReminder(false);
  };

  const clearReminder = (e) => {
    e.stopPropagation();
    setReminderText(""); setReminderAt("");
    onReminderSave(contact.phone, null, null, true);
    setShowReminder(false);
  };

  const saveName = () => {
    setEditingName(false);
    const val = nameVal.trim();
    if (val) onNameEdit(contact.phone, val);
    else setNameVal(contact.custom_name || contact.name || "");
  };

  const dotColor = CONTACT_COLORS[contact.color] || CONTACT_COLORS.gray;

  return (
    <div
      draggable={!editingName}
      onDragStart={e => { if (!editingName) onDragStart(e, contact.phone, columnId); }}
      onClick={() => { if (!editingName) onOpenChat(contact); }}
      style={{
        background: "var(--zf-card)",
        border: "0.5px solid var(--zf-b1)",
        borderLeft: contact.color && contact.color !== "gray"
          ? `3px solid ${dotColor}`
          : "0.5px solid var(--zf-b1)",
        borderRadius: 8,
        padding: "7px 9px",
        cursor: isDragging ? "grabbing" : "pointer",
        opacity: isDragging ? 0.45 : 1,
        userSelect: "none",
        transition: "border-color 0.15s, background 0.15s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = "var(--zf-bh)";
        if (contact.color && contact.color !== "gray")
          e.currentTarget.style.borderLeftColor = dotColor;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--zf-b1)";
        if (contact.color && contact.color !== "gray")
          e.currentTarget.style.borderLeftColor = dotColor;
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Avatar */}
        <Avatar name={contact.name} phone={contact.phone} size={28} />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Row 1: name + time */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
            {editingName ? (
              <input
                ref={nameRef}
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") { setEditingName(false); setNameVal(contact.custom_name || contact.name || ""); }
                }}
                onClick={e => e.stopPropagation()}
                style={{
                  flex: 1, fontSize: 12, fontWeight: 500,
                  background: "rgba(37,211,102,0.08)",
                  border: "0.5px solid rgba(37,211,102,0.4)",
                  borderRadius: 4, padding: "1px 5px",
                  color: "var(--zf-t1)", outline: "none",
                }}
              />
            ) : (
              <span
                onClick={e => e.stopPropagation()}
                onDoubleClick={e => { e.stopPropagation(); setEditingName(true); }}
                title="Duplo clique para editar nome"
                style={{
                  fontSize: 12, fontWeight: 500, color: "var(--zf-t2)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  maxWidth: 130, cursor: "text",
                }}
              >
                {contact.name || fmtPhone(contact.phone)}
              </span>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: "var(--zf-t4)" }}>{fmtTime(contact.last_at)}</span>
            </div>
          </div>

          {/* Row 2: last msg + unread + color + flag */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2, gap: 4 }}>
            <span style={{
              fontSize: 11, color: "var(--zf-t4)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
            }}>
              {contact.last_message || "Sem mensagens"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              {/* Unread */}
              {contact.unread > 0 && (
                <span style={{
                  background: "#25D366", color: "#000",
                  borderRadius: 99, fontSize: 9, fontWeight: 700,
                  minWidth: 14, height: 14, display: "flex",
                  alignItems: "center", justifyContent: "center", padding: "0 3px",
                  animation: "zf-pulse 1.4s ease-in-out infinite",
                  boxShadow: "0 0 0 0 rgba(37,211,102,0.6)",
                }}>
                  {contact.unread > 9 ? "9+" : contact.unread}
                </span>
              )}
              {/* Color icon */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={e => { e.stopPropagation(); setShowColorPicker(p => !p); }}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    display: "flex", alignItems: "center", lineHeight: 1,
                    color: contact.color && contact.color !== "gray" ? dotColor : "var(--zf-t5)",
                  }}
                  title="Definir cor"
                >
                  <Palette size={12} />
                </button>
                {showColorPicker && (
                  <div
                    style={{
                      position: "absolute", right: 0, bottom: 14, zIndex: 200,
                      background: "var(--zf-s2)", border: `0.5px solid var(--zf-b3)`,
                      borderRadius: 8, padding: "6px 7px",
                      display: "flex", gap: 5, boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {Object.entries(CONTACT_COLORS).map(([key, val]) => (
                      <button
                        key={key}
                        onClick={e => { e.stopPropagation(); onColorChange(contact.phone, key); setShowColorPicker(false); }}
                        style={{
                          width: 14, height: 14, borderRadius: "50%", background: val,
                          border: contact.color === key ? `2px solid var(--zf-sel)` : `1px solid var(--zf-b3)`,
                          cursor: "pointer", padding: 0,
                        }}
                        title={key}
                      />
                    ))}
                  </div>
                )}
              </div>
              {/* Reminder bell */}
              <div style={{ position: "relative" }}>
                <button
                  ref={bellRef}
                  onClick={e => {
                    e.stopPropagation();
                    setShowColorPicker(false);
                    if (!showReminder) {
                      const r = bellRef.current?.getBoundingClientRect();
                      if (r) {
                        const popW = 218;
                        setReminderPos({
                          top: r.bottom + 6,
                          left: Math.min(r.left, window.innerWidth - popW - 8),
                        });
                      }
                    }
                    setShowReminder(p => !p);
                  }}
                  onMouseEnter={() => setHoverBell(true)}
                  onMouseLeave={() => setHoverBell(false)}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    display: "flex", alignItems: "center", lineHeight: 1,
                    color: hasReminder ? "#f59e0b" : "var(--zf-t5)",
                    opacity: hasReminder ? 1 : 0.3,
                    position: "relative",
                  }}
                >
                  <Bell size={12} fill={hasReminder ? "#f59e0b" : "none"} />
                  {contact.reminder_fired && (
                    <span style={{
                      position: "absolute", top: -3, right: -3,
                      width: 5, height: 5, borderRadius: "50%",
                      background: "#f59e0b",
                      boxShadow: "0 0 0 1.5px var(--zf-card)",
                      animation: "zf-pulse 1.8s ease-in-out infinite",
                    }} />
                  )}
                </button>

                {/* Hover preview tooltip — sibling of button, not child */}
                {hoverBell && hasReminder && !showReminder && (
                  <div style={{
                    position: "fixed",
                    top: (bellRef.current?.getBoundingClientRect().bottom ?? 0) + 6,
                    left: Math.min(bellRef.current?.getBoundingClientRect().left ?? 0, window.innerWidth - 208),
                    zIndex: 9999,
                    background: "var(--zf-s1)", border: "0.5px solid var(--zf-b3)",
                    borderRadius: 8, padding: "7px 10px",
                    boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
                    maxWidth: 200, pointerEvents: "none",
                  }}>
                    {contact.reminder_text && (
                      <div style={{ fontSize: 12, color: "var(--zf-t1)", marginBottom: contact.reminder_at ? 4 : 0 }}>
                        {contact.reminder_text}
                      </div>
                    )}
                    {contact.reminder_at && (
                      <div style={{ fontSize: 10, color: "#f59e0b", fontFamily: "JetBrains Mono, monospace" }}>
                        {new Date(contact.reminder_at).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" })}
                      </div>
                    )}
                  </div>
                )}

                {showReminder && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: "fixed",
                      top: reminderPos.top,
                      left: reminderPos.left,
                      zIndex: 9999,
                      background: "var(--zf-s1)", border: "0.5px solid var(--zf-b3)",
                      borderRadius: 10, padding: 10, width: 210,
                      boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
                      display: "flex", flexDirection: "column", gap: 7,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--zf-t3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      Lembrete
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Mensagem do lembrete…"
                      value={reminderText}
                      onChange={e => setReminderText(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: "100%", resize: "none", fontSize: 12,
                        background: "var(--zf-in)", border: "0.5px solid var(--zf-b3)",
                        borderRadius: 6, padding: "5px 8px", color: "var(--zf-t1)",
                        outline: "none", boxSizing: "border-box",
                        fontFamily: "Satoshi, system-ui, sans-serif",
                      }}
                    />
                    <input
                      type="datetime-local"
                      value={reminderAt}
                      onChange={e => setReminderAt(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{
                        fontSize: 11, background: "var(--zf-in)",
                        border: "0.5px solid var(--zf-b3)", borderRadius: 6,
                        padding: "4px 8px", color: "var(--zf-t1)", outline: "none",
                        width: "100%", boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", gap: 5 }}>
                      <button
                        onClick={saveReminder}
                        style={{
                          flex: 1, fontSize: 11, fontWeight: 700,
                          background: "#f59e0b", color: "#000",
                          border: "none", borderRadius: 6, padding: "5px 0",
                          cursor: "pointer",
                        }}
                      >
                        Salvar
                      </button>
                      {hasReminder && (
                        <button
                          onClick={clearReminder}
                          style={{
                            fontSize: 11, fontWeight: 600,
                            background: "var(--zf-in)", color: "var(--zf-t3)",
                            border: "0.5px solid var(--zf-b3)", borderRadius: 6,
                            padding: "5px 8px", cursor: "pointer",
                          }}
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Flag */}
              <button
                onClick={e => { e.stopPropagation(); onFlagToggle(contact.phone, !contact.flagged); }}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  fontSize: 11, lineHeight: 1,
                  opacity: contact.flagged ? 1 : 0.25,
                  filter: contact.flagged ? "none" : "grayscale(0.8)",
                }}
                title={contact.flagged ? "Remover destaque" : "Destacar (vai para o topo)"}
              >
                🚩
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

function KanbanColumn({ col, contacts, draggingId, draggingColId, onDragStart, onDrop, onDragOver, onRename, onDelete, onCardNameEdit, onCardColorChange, onCardFlagToggle, onOpenChat, onCardReminderSave, isMobile, isInbox, onColDragStart, inboxSearch, setInboxSearch, inboxColorFilter, setInboxColorFilter }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(col.name);
  const [showColColors, setShowColColors] = useState(false);
  const [colorFilter, setColorFilter] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setLabel(col.name); }, [col.name]);

  const colUsedColors = useMemo(() => {
    const set = new Set();
    contacts.forEach(c => { if (c.color && c.color !== "gray") set.add(c.color); });
    return Array.from(set);
  }, [contacts]);

  const activeColorFilter = isInbox ? inboxColorFilter : colorFilter;
  const setActiveColorFilter = isInbox ? setInboxColorFilter : setColorFilter;

  useEffect(() => {
    if (colorFilter && !colUsedColors.includes(colorFilter)) setColorFilter(null);
  }, [colUsedColors, colorFilter]);

  useEffect(() => {
    if (isInbox && inboxColorFilter && !colUsedColors.includes(inboxColorFilter)) setInboxColorFilter?.(null);
  }, [colUsedColors, isInbox, inboxColorFilter, setInboxColorFilter]);

  const baseContacts = useMemo(() => {
    if (!isInbox || !inboxSearch?.trim()) return contacts;
    const q = inboxSearch.trim().toLowerCase();
    return contacts.filter(c =>
      (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q)
    );
  }, [contacts, isInbox, inboxSearch]);

  const visibleContacts = activeColorFilter
    ? baseContacts.filter(c => c.color === activeColorFilter)
    : baseContacts;

  const save = () => {
    setEditing(false);
    const n = label.trim();
    if (n) onRename(col.id, n, col.color);
    else setLabel(col.name);
  };

  const colStyle = isInbox
    ? { bg: "rgba(37,211,102,0.18)", dot: "#25D366" }
    : (COL_COLORS[col.color] || COL_COLORS.blue);

  const firedCount = useMemo(
    () => contacts.filter(c => c.reminder_fired).length,
    [contacts]
  );

  const [hoverHeader, setHoverHeader] = useState(false);
  const isDraggingThis = draggingColId === col.id;

  return (
    <div
      onDragOver={onDragOver}
      onDrop={e => onDrop(e, col.id)}
      style={{
        width: isMobile ? "100%" : 272,
        maxHeight: isMobile ? 600 : undefined,
        flexShrink: 0,
        display: "flex", flexDirection: "column",
        background: "var(--zf-col)",
        border: isDraggingThis ? `0.5px solid var(--zf-b4)` : `0.5px solid var(--zf-b1)`,
        borderRadius: 10, overflow: "hidden",
        opacity: isDraggingThis ? 0.38 : 1,
        transform: isDraggingThis ? "rotate(1.8deg) scale(1.03)" : "none",
        boxShadow: isDraggingThis ? "0 20px 48px rgba(0,0,0,0.45)" : "none",
        transition: "opacity 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s",
      }}
    >
      {/* Column header — draggable for reordering */}
      <div
        draggable={!editing}
        onDragStart={e => { e.stopPropagation(); onColDragStart(e, col.id); }}
        onMouseEnter={() => setHoverHeader(true)}
        onMouseLeave={() => setHoverHeader(false)}
        style={{
          padding: "9px 11px",
          borderBottom: `0.5px solid var(--zf-b2)`,
          display: "flex", alignItems: "center", gap: 6,
          background: colStyle.bg,
          flexShrink: 0,
          cursor: editing ? "default" : "grab",
          userSelect: "none",
        }}
      >
        {/* Grip icon — only visible on hover */}
        <GripVertical size={11} style={{
          color: "var(--zf-gr)", flexShrink: 0,
          opacity: hoverHeader ? 1 : 0,
          transition: "opacity 0.15s",
        }} />

        {isInbox ? (
          /* ── Inbox header ── */
          <>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#25D366", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "var(--zf-t1)", flex: 1 }}>
              Inbox
            </span>
            <span style={{ fontSize: 10, color: "var(--zf-t3)", background: "var(--zf-bd)", borderRadius: 99, padding: "1px 6px" }}>
              {visibleContacts.length}{activeColorFilter ? `/${contacts.length}` : ""}
            </span>
            {firedCount > 0 && (
              <span title={`${firedCount} lembrete${firedCount > 1 ? "s" : ""} aguardando`} style={{
                display: "flex", alignItems: "center", gap: 2,
                background: "#f59e0b", color: "#000",
                borderRadius: 99, padding: "1px 5px",
                fontSize: 9, fontWeight: 700,
                animation: "zf-pulse 1.8s ease-in-out infinite",
              }}>
                <Bell size={8} fill="#000" />{firedCount}
              </span>
            )}
          </>
        ) : (
          /* ── Regular column header ── */
          <>
            <div style={{ position: "relative" }}>
              <button
                onClick={e => { e.stopPropagation(); setShowColColors(p => !p); }}
                onMouseDown={e => e.stopPropagation()}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: colStyle.dot, display: "flex", alignItems: "center", lineHeight: 1 }}
                title="Cor da coluna"
              >
                <Palette size={13} />
              </button>
              {showColColors && (
                <div style={{ position: "absolute", top: 12, left: 0, zIndex: 200, background: "var(--zf-s2)", border: `0.5px solid var(--zf-b3)`, borderRadius: 8, padding: "6px 7px", display: "flex", gap: 5, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>
                  {Object.entries(COL_COLORS).map(([key, val]) => (
                    <button key={key} onClick={() => { onRename(col.id, col.name, key); setShowColColors(false); }}
                      style={{ width: 14, height: 14, borderRadius: "50%", background: val.dot, border: col.color === key ? `2px solid var(--zf-sel)` : `1px solid var(--zf-b3)`, cursor: "pointer", padding: 0 }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }} onMouseDown={e => e.stopPropagation()}>
              {editing ? (
                <input ref={inputRef} value={label} onChange={e => setLabel(e.target.value)}
                  onBlur={save}
                  onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setLabel(col.name); } }}
                  style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", background: "transparent", border: "none", outline: "none", color: "var(--zf-t1)", width: "100%" }}
                />
              ) : (
                <span onDoubleClick={() => setEditing(true)} title="Duplo clique para renomear"
                  style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "var(--zf-t3)", cursor: "text", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {col.name}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              {firedCount > 0 && (
                <span title={`${firedCount} lembrete${firedCount > 1 ? "s" : ""} aguardando`} style={{
                  display: "flex", alignItems: "center", gap: 2,
                  background: "#f59e0b", color: "#000",
                  borderRadius: 99, padding: "1px 5px",
                  fontSize: 9, fontWeight: 700,
                  animation: "zf-pulse 1.8s ease-in-out infinite",
                }}>
                  <Bell size={8} fill="#000" />{firedCount}
                </span>
              )}
              <span style={{ fontSize: 10, color: "var(--zf-t4)", background: "var(--zf-bd)", borderRadius: 99, padding: "1px 6px" }}>
                {visibleContacts.length}{activeColorFilter ? `/${contacts.length}` : ""}
              </span>
              <button onClick={e => { e.stopPropagation(); onDelete(col.id); }} onMouseDown={e => e.stopPropagation()}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--zf-t5)", lineHeight: 1 }} title="Excluir coluna">
                <X size={12} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Search bar — inbox only */}
      {isInbox && (
        <div style={{ padding: "7px 9px", borderBottom: `0.5px solid var(--zf-bd)`, flexShrink: 0 }}>
          <div style={{ position: "relative" }}>
            <Search size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--zf-t5)" }} />
            <input value={inboxSearch || ""} onChange={e => setInboxSearch(e.target.value)} placeholder="Buscar…"
              style={{ width: "100%", fontSize: 11, background: "var(--zf-in2)", border: `0.5px solid var(--zf-b2)`, borderRadius: 6, padding: "5px 7px 5px 22px", color: "var(--zf-t3)", outline: "none", boxSizing: "border-box" }}
            />
          </div>
        </div>
      )}

      {/* Color filter strip */}
      {colUsedColors.length > 0 && (
        <div style={{ padding: "5px 11px", borderBottom: `0.5px solid var(--zf-bd)`, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          {colUsedColors.map(key => {
            const active = activeColorFilter === key;
            return (
              <button key={key} onClick={() => setActiveColorFilter(active ? null : key)} title={key}
                style={{ width: 12, height: 12, borderRadius: "50%", background: CONTACT_COLORS[key], border: active ? `2px solid var(--zf-sel)` : `1px solid var(--zf-b3)`, cursor: "pointer", padding: 0, transform: active ? "scale(1.3)" : "scale(1)", transition: "transform 0.12s", boxShadow: active ? `0 0 5px ${CONTACT_COLORS[key]}80` : "none" }}
              />
            );
          })}
          {activeColorFilter && (
            <button onClick={() => setActiveColorFilter(null)} style={{ fontSize: 9, padding: "1px 5px", background: "none", border: "none", cursor: "pointer", color: "var(--zf-t4)", lineHeight: 1 }}>×</button>
          )}
        </div>
      )}

      {/* Cards */}
      <div style={{ flex: 1, padding: "8px 8px", display: "flex", flexDirection: "column", gap: 5, overflowY: "auto" }}>
        {visibleContacts.length === 0 && (
          <div style={{ color: "var(--zf-t5)", fontSize: 11, textAlign: "center", padding: "28px 8px", lineHeight: 1.5 }}>
            {contacts.length === 0 ? "Arraste um contato aqui" : "Sem resultados"}
          </div>
        )}
        {visibleContacts.map(c => (
          <ContactCard key={c.phone} contact={c} columnId={col.id} isDragging={draggingId === c.phone}
            onDragStart={onDragStart} onNameEdit={onCardNameEdit} onColorChange={onCardColorChange}
            onFlagToggle={onCardFlagToggle} onOpenChat={onOpenChat}
            onReminderSave={onCardReminderSave}
          />
        ))}
      </div>
    </div>
  );
}

// ─── KanbanPage ───────────────────────────────────────────────────────────────

export default function KanbanPage() {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState(null);
  const [draggingFromCol, setDraggingFromCol] = useState(null);
  const [chatContact, setChatContact] = useState(null);
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColColor, setNewColColor] = useState("blue");
  const [inboxSearch, setInboxSearch] = useState("");
  const [inboxColorFilter, setInboxColorFilter] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [colOrder, setColOrder] = useState(() => {
    try {
      const saved = localStorage.getItem("zapflow_kanban_col_order");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [draggingColId, setDraggingColId] = useState(null);

  useEffect(() => {
    if (colOrder) localStorage.setItem("zapflow_kanban_col_order", JSON.stringify(colOrder));
  }, [colOrder]);
  const addInputRef = useRef(null);
  // Ref so WS callback and loadBoard can always read the latest chatContact
  // without being recreated on every state change.
  const chatContactRef = useRef(null);
  useEffect(() => { chatContactRef.current = chatContact; }, [chatContact]);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => { if (addingCol) addInputRef.current?.focus(); }, [addingCol]);

  const loadBoard = useCallback(async () => {
    try {
      const r = await apiClient.get("/kanban/board");
      // If a chat is open, zero out unread for that contact so the badge
      // never flickers while the conversation is visible.
      const openPhone = chatContactRef.current
        ? normPhone(chatContactRef.current.phone)
        : null;
      if (openPhone) {
        Object.values(r.data.by_column || {}).forEach(cards => {
          cards.forEach(c => {
            if (normPhone(c.phone) === openPhone) c.unread = 0;
          });
        });
      }
      setBoard(r.data);
      setColOrder(prev => {
        const newIds = ["inbox", ...(r.data.columns || []).map(c => c.id)];
        if (!prev) return newIds;
        const filtered = prev.filter(id => newIds.includes(id));
        const added = newIds.filter(id => !prev.includes(id));
        return [...filtered, ...added];
      });
    } catch { toast.error("Erro ao carregar Kanban"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  useWebSocket(useCallback((event) => {
    if (event?.type === "kanban_reminder") {
      const { phone, name, text } = event;
      playNotificationSound();
      toast(`🔔 ${name || "Contato"}`, {
        description: text || "Lembrete",
        duration: 0,
        icon: "🔔",
      });
      // Light up the dot immediately on the card
      setBoard(prev => {
        if (!prev) return prev;
        const byCol = {};
        Object.entries(prev.by_column).forEach(([cid, cards]) => {
          byCol[cid] = cards.map(c =>
            normPhone(c.phone) === normPhone(phone) ? { ...c, reminder_fired: true } : c
          );
        });
        return { ...prev, by_column: byCol };
      });
      return;
    }
    if (event?.type === "chat_incoming" || event?.type === "chat_outgoing") {
      loadBoard();
      // Only notify for incoming messages AND only when that chat is NOT open.
      if (event.message?.direction === "in") {
        const isOpenChat = chatContactRef.current &&
          normPhone(chatContactRef.current.phone) === normPhone(event.message?.phone);
        if (!isOpenChat) {
          playNotificationSound();
          const m = event.message;
          const name = m?.name || (m?.phone ? `+${m.phone}` : "Contato");
          const preview = m?.content && !m.content.startsWith("http")
            ? m.content.slice(0, 60) + (m.content.length > 60 ? "…" : "")
            : "📎 Mídia recebida";
          toast(name, {
            description: preview,
            duration: 5000,
            icon: "💬",
          });
        }
      }
    }
  }, [loadBoard]));

  const handleColDragStart = useCallback((e, colId) => {
    setDraggingColId(colId);
    e.dataTransfer.setData("dragType", "column");
    e.dataTransfer.setData("colId", colId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragStart = useCallback((e, phone, fromCol) => {
    setDraggingId(phone);
    setDraggingFromCol(fromCol);
    e.dataTransfer.setData("dragType", "card");
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(async (e, toColId) => {
    e.preventDefault();
    const dragType = e.dataTransfer.getData("dragType");

    if (dragType === "column") {
      const fromColId = e.dataTransfer.getData("colId");
      setDraggingColId(null);
      if (fromColId && fromColId !== toColId) {
        setColOrder(prev => {
          const arr = [...(prev || [])];
          const fi = arr.indexOf(fromColId);
          const ti = arr.indexOf(toColId);
          if (fi === -1 || ti === -1) return prev;
          arr.splice(fi, 1);
          arr.splice(ti, 0, fromColId);
          return arr;
        });
      }
      return;
    }

    const phone = draggingId;
    const fromCol = draggingFromCol;
    if (!phone || !fromCol || fromCol === toColId) {
      setDraggingId(null);
      setDraggingFromCol(null);
      return;
    }
    setDraggingId(null);
    setDraggingFromCol(null);

    // Optimistic update
    setBoard(prev => {
      if (!prev) return prev;
      const byCol = {};
      Object.entries(prev.by_column).forEach(([cid, cards]) => { byCol[cid] = [...cards]; });
      const fromList = byCol[fromCol] || [];
      const toList = byCol[toColId] || [];
      const idx = fromList.findIndex(c => c.phone === phone);
      if (idx === -1) return prev;
      const [card] = fromList.splice(idx, 1);
      toList.push(card);
      toList.sort((a, b) => {
        const fa = a.flagged ? 0 : 1;
        const fb = b.flagged ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return (b.last_at || "") > (a.last_at || "") ? -1 : 1;
      });
      byCol[fromCol] = fromList;
      byCol[toColId] = toList;
      return { ...prev, by_column: byCol };
    });

    try {
      await apiClient.post("/kanban/move", {
        contact_phone: phone, from_column: fromCol, to_column: toColId,
      });
    } catch {
      toast.error("Erro ao mover contato");
      loadBoard();
    }
  }, [draggingId, draggingFromCol, loadBoard]);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDraggingFromCol(null);
    setDraggingColId(null);
  }, []);

  const addColumn = async () => {
    const name = newColName.trim();
    if (!name) return;
    try {
      await apiClient.post("/kanban/columns", { name, color: newColColor });
      setNewColName("");
      setAddingCol(false);
      setNewColColor("blue");
      await loadBoard();
    } catch { toast.error("Erro ao criar coluna"); }
  };

  const deleteColumn = async (colId) => {
    if (!window.confirm("Deletar coluna? Os contatos voltarão ao Inbox.")) return;
    try {
      await apiClient.delete(`/kanban/columns/${colId}`);
      await loadBoard();
    } catch { toast.error("Erro ao deletar coluna"); }
  };

  const renameColumn = async (colId, name, color) => {
    try {
      await apiClient.put(`/kanban/columns/${colId}`, { name, color });
      await loadBoard();
    } catch { toast.error("Erro ao atualizar coluna"); }
  };

  const updateCard = useCallback(async (phone, data) => {
    // Optimistic
    setBoard(prev => {
      if (!prev) return prev;
      const byCol = {};
      Object.entries(prev.by_column).forEach(([cid, cards]) => {
        let updated = cards.map(c => {
          if (c.phone !== phone) return c;
          const next = { ...c, ...data };
          if (data.custom_name !== undefined) next.name = data.custom_name || c.name;
          return next;
        });
        if (data.flagged !== undefined) {
          updated.sort((a, b) => {
            const fa = a.flagged ? 0 : 1;
            const fb = b.flagged ? 0 : 1;
            if (fa !== fb) return fa - fb;
            return (b.last_at || "") > (a.last_at || "") ? -1 : 1;
          });
        }
        byCol[cid] = updated;
      });
      return { ...prev, by_column: byCol };
    });

    try {
      await apiClient.patch(`/kanban/cards/${encodeURIComponent(phone)}`, data);
    } catch {
      toast.error("Erro ao atualizar contato");
      loadBoard();
    }
  }, [loadBoard]);

  const updateReminder = useCallback(async (phone, text, at, clear = false) => {
    // Optimistic update on the board
    setBoard(prev => {
      if (!prev) return prev;
      const byCol = {};
      Object.entries(prev.by_column).forEach(([cid, cards]) => {
        byCol[cid] = cards.map(c =>
          c.phone === phone
            ? { ...c, reminder_text: clear ? null : text, reminder_at: clear ? null : at, reminder_fired: false }
            : c
        );
      });
      return { ...prev, by_column: byCol };
    });
    try {
      await apiClient.patch(`/kanban/cards/${encodeURIComponent(phone)}`, {
        reminder_text: clear ? null : text,
        reminder_at: clear ? null : at,
        reminder_clear: clear || undefined,
      });
    } catch { toast.error("Erro ao salvar lembrete"); loadBoard(); }
  }, [loadBoard]);

  const handleOpenChat = useCallback((contact) => {
    setChatContact(contact);
    setBoard(prev => {
      if (!prev) return prev;
      const byCol = {};
      Object.entries(prev.by_column).forEach(([cid, cards]) => {
        byCol[cid] = cards.map(c => normPhone(c.phone) === normPhone(contact.phone) ? { ...c, unread: 0 } : c);
      });
      return { ...prev, by_column: byCol };
    });
    apiClient.post("/chat/read", null, { params: { phone: contact.phone } }).catch(() => {});
  }, []);

  const orderedCols = useMemo(() => {
    if (!board || !colOrder) return [];
    const allIds = ["inbox", ...(board.columns || []).map(c => c.id)];
    return colOrder
      .filter(id => allIds.includes(id))
      .map(id => id === "inbox"
        ? { id: "inbox", name: "Inbox", color: "emerald", isInbox: true }
        : board.columns.find(c => c.id === id)
      )
      .filter(Boolean);
  }, [board, colOrder]);

  if (loading || !board) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "70vh", flexDirection: "column", gap: 12, color: "var(--zf-t4)" }}>
        <Loader2 size={26} style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: 13 }}>Carregando CRM…</span>
      </div>
    );
  }

  const totalContacts = Object.values(board.by_column).reduce((a, b) => a + b.length, 0);

  return (
    <div
      onDragEnd={handleDragEnd}
      style={{
        display: "flex", flexDirection: "column",
        height: isMobile ? "calc(100vh - 144px)" : "100vh",
        overflow: "hidden",
        fontFamily: "Satoshi, system-ui, sans-serif",
      }}
    >
      {/* Top bar */}
      <div style={{ padding: isMobile ? "10px 14px 8px" : "18px 20px 14px", flexShrink: 0, borderBottom: `0.5px solid var(--zf-bd)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            {!isMobile && (
              <div style={{ fontSize: 10, color: "var(--zf-t5)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>
                CRM WhatsApp
              </div>
            )}
            <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, color: "var(--zf-t1)", margin: 0, lineHeight: 1 }}>
              Kanban
            </h1>
            <p style={{ fontSize: 10, color: "var(--zf-t4)", margin: "3px 0 0" }}>
              {totalContacts} contatos · {board.columns?.length ?? 0} coluna{(board.columns?.length ?? 0) !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Add column control — desktop inline, mobile icon-only */}
          {addingCol && !isMobile ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                ref={addInputRef}
                value={newColName}
                onChange={e => setNewColName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") addColumn();
                  if (e.key === "Escape") { setAddingCol(false); setNewColName(""); }
                }}
                placeholder="Nome da coluna"
                style={{
                  fontSize: 12, background: "var(--zf-in)",
                  border: `0.5px solid var(--zf-b3)`,
                  borderRadius: 8, padding: "7px 11px",
                  color: "var(--zf-t1)", outline: "none", width: 150,
                }}
              />
              <div style={{ display: "flex", gap: 4 }}>
                {Object.entries(COL_COLORS).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => setNewColColor(key)}
                    style={{
                      width: 16, height: 16, borderRadius: "50%", background: val.dot,
                      border: newColColor === key ? `2px solid var(--zf-sel)` : `1px solid var(--zf-b3)`,
                      cursor: "pointer", padding: 0,
                    }}
                    title={key}
                  />
                ))}
              </div>
              <button
                onClick={addColumn}
                style={{
                  fontSize: 12, padding: "7px 13px",
                  background: "#25D366", color: "#000",
                  border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600,
                }}
              >
                Criar
              </button>
              <button
                onClick={() => { setAddingCol(false); setNewColName(""); }}
                style={{
                  padding: "7px 9px", background: "none",
                  border: `0.5px solid var(--zf-b3)`,
                  borderRadius: 8, cursor: "pointer", color: "var(--zf-t4)",
                  display: "flex", alignItems: "center",
                }}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingCol(true)}
              style={{
                fontSize: 12,
                padding: isMobile ? "7px 9px" : "7px 13px",
                background: "var(--zf-in)",
                border: `0.5px solid var(--zf-b5)`,
                borderRadius: 8, cursor: "pointer", color: "var(--zf-t3)",
                display: "flex", alignItems: "center", gap: 5, fontWeight: 500,
              }}
            >
              <Plus size={13} />
              {!isMobile && "Nova coluna"}
            </button>
          )}
        </div>

        {/* Mobile: add column form shown below title row */}
        {isMobile && addingCol && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                ref={addInputRef}
                value={newColName}
                onChange={e => setNewColName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") addColumn();
                  if (e.key === "Escape") { setAddingCol(false); setNewColName(""); }
                }}
                placeholder="Nome da coluna"
                style={{
                  flex: 1, fontSize: 12, background: "var(--zf-in)",
                  border: `0.5px solid var(--zf-b3)`,
                  borderRadius: 8, padding: "7px 11px",
                  color: "var(--zf-t1)", outline: "none",
                }}
              />
              <button
                onClick={() => { setAddingCol(false); setNewColName(""); }}
                style={{
                  padding: "7px 9px", background: "none",
                  border: `0.5px solid var(--zf-b3)`,
                  borderRadius: 8, cursor: "pointer", color: "var(--zf-t4)",
                  display: "flex", alignItems: "center",
                }}
              >
                <X size={13} />
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {Object.entries(COL_COLORS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setNewColColor(key)}
                  style={{
                    width: 18, height: 18, borderRadius: "50%", background: val.dot,
                    border: newColColor === key ? `2px solid var(--zf-sel)` : `1px solid var(--zf-b3)`,
                    cursor: "pointer", padding: 0, flexShrink: 0,
                  }}
                  title={key}
                />
              ))}
              <button
                onClick={addColumn}
                style={{
                  marginLeft: "auto", fontSize: 12, padding: "6px 16px",
                  background: "#25D366", color: "#000",
                  border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600,
                }}
              >
                Criar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main area — todas as colunas (inbox + kanban) juntas */}
      <div style={{
        flex: 1, minHeight: 0,
        overflowX: isMobile ? "hidden" : "auto",
        overflowY: isMobile ? "auto" : "hidden",
        padding: "14px",
      }}>
        <div style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 10,
          height: isMobile ? "auto" : "100%",
          alignItems: "stretch",
          width: isMobile ? "100%" : "max-content",
        }}>
          {orderedCols.map(col => (
            <KanbanColumn
              key={col.id}
              col={col}
              isInbox={col.isInbox}
              contacts={board.by_column[col.id] || []}
              draggingId={draggingId}
              draggingColId={draggingColId}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onRename={renameColumn}
              onDelete={deleteColumn}
              onCardNameEdit={(phone, name) => updateCard(phone, { custom_name: name })}
              onCardColorChange={(phone, color) => updateCard(phone, { color })}
              onCardFlagToggle={(phone, flagged) => updateCard(phone, { flagged })}
              onCardReminderSave={updateReminder}
              onOpenChat={handleOpenChat}
              isMobile={isMobile}
              onColDragStart={handleColDragStart}
              inboxSearch={inboxSearch}
              setInboxSearch={setInboxSearch}
              inboxColorFilter={inboxColorFilter}
              setInboxColorFilter={setInboxColorFilter}
            />
          ))}
        </div>
      </div>

      {/* Chat Modal */}
      {chatContact && (
        <ChatModal
          contact={chatContact}
          onClose={() => setChatContact(null)}
        />
      )}
    </div>
  );
}
