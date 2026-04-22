"""ZapFlow - FastAPI backend for WhatsApp bulk messaging SaaS."""
import os
import csv
import io
import re
import base64
import asyncio
import logging
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import (
    FastAPI, APIRouter, Depends, HTTPException, UploadFile, File,
    WebSocket, WebSocketDisconnect, BackgroundTasks, Query, Request, Header
)
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

from models import (
    UserRegister, UserLogin, UserPublic,
    ContactCreate, Contact,
    TemplateCreate, Template,
    WhatsAppSessionCreate, WhatsAppSession,
    CampaignCreate, Campaign,
    MessageLog, CreditRecharge, CreditTransaction,
    AISuggestRequest, TTSRequest, CSVImportResult,
    ChatMessage, ChatSendRequest,
    uid, now_iso,
)
from auth import (
    hash_password, verify_password,
    create_access_token, decode_token, get_current_user,
)
from ws_manager import manager
from campaign_runner import run_campaign
from wa_client import wa_client, WEBHOOK_SECRET

MAX_SESSIONS_PER_USER = int(os.environ.get("MAX_SESSIONS_PER_USER", "5"))

# Env
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="ZapFlow API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("zapflow")


# ============== AUTH ==============
@api.post("/auth/register")
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(400, "Email já cadastrado")
    user = {
        "id": uid(),
        "name": data.name,
        "email": data.email,
        "password_hash": hash_password(data.password),
        "credits": 25.0,  # welcome credits (R$ 25)
        "created_at": now_iso(),
    }
    await db.users.insert_one(dict(user))
    await db.credit_transactions.insert_one({
        "id": uid(), "user_id": user["id"], "type": "bonus",
        "amount": 25.0, "balance_after": 25.0,
        "description": "Bônus de boas-vindas",
        "created_at": now_iso(),
    })
    token = create_access_token(user["id"], user["email"])
    return {
        "access_token": token,
        "user": {
            "id": user["id"], "name": user["name"], "email": user["email"],
            "credits": user["credits"], "created_at": user["created_at"],
        },
    }


@api.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "Credenciais inválidas")
    token = create_access_token(user["id"], user["email"])
    return {
        "access_token": token,
        "user": {
            "id": user["id"], "name": user["name"], "email": user["email"],
            "credits": user.get("credits", 0), "created_at": user["created_at"],
        },
    }


@api.get("/auth/me")
async def me(current=Depends(get_current_user)):
    user = await db.users.find_one({"id": current["id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    return user


# ============== DASHBOARD ==============
@api.get("/dashboard/stats")
async def dashboard_stats(current=Depends(get_current_user)):
    uid_ = current["id"]
    contacts_count = await db.contacts.count_documents({"user_id": uid_})
    active_campaigns = await db.campaigns.count_documents(
        {"user_id": uid_, "status": {"$in": ["pendente", "enviando"]}}
    )
    sessions_connected = await db.whatsapp_sessions.count_documents(
        {"user_id": uid_, "status": "conectado"}
    )

    # Leads funnel
    replied = await db.messages.count_documents({"user_id": uid_, "status": "respondido"})
    read_c = await db.messages.count_documents({"user_id": uid_, "status": {"$in": ["lido", "respondido"]}})
    delivered_c = await db.messages.count_documents({"user_id": uid_, "status": {"$in": ["entregue", "lido", "respondido"]}})
    sent_c = await db.messages.count_documents({"user_id": uid_, "status": {"$ne": "pendente"}})
    failed_c = await db.messages.count_documents({"user_id": uid_, "status": "falha"})

    # User credits
    user = await db.users.find_one({"id": uid_}, {"_id": 0})
    credits = user.get("credits", 0) if user else 0

    # Estimated funnel value (R$ per replied lead x 50)
    funnel_value = replied * 250  # avg ticket

    # Recent campaigns
    recent_campaigns = await db.campaigns.find(
        {"user_id": uid_}, {"_id": 0}
    ).sort("created_at", -1).limit(5).to_list(5)

    # Last 7 days activity for chart
    activity = []
    msgs = await db.messages.find(
        {"user_id": uid_}, {"_id": 0, "status": 1, "sent_at": 1, "created_at": 1}
    ).to_list(5000)
    from collections import defaultdict
    day_map = defaultdict(lambda: {"enviados": 0, "entregues": 0, "lidos": 0, "respondidos": 0, "falhas": 0})
    for m in msgs:
        ts = m.get("sent_at") or m.get("created_at")
        if not ts:
            continue
        day = ts[:10]
        s = m.get("status")
        if s in ("enviado", "entregue", "lido", "respondido"):
            day_map[day]["enviados"] += 1
        if s in ("entregue", "lido", "respondido"):
            day_map[day]["entregues"] += 1
        if s in ("lido", "respondido"):
            day_map[day]["lidos"] += 1
        if s == "respondido":
            day_map[day]["respondidos"] += 1
        if s == "falha":
            day_map[day]["falhas"] += 1
    for day in sorted(day_map.keys())[-7:]:
        activity.append({"date": day, **day_map[day]})

    return {
        "contacts": contacts_count,
        "active_campaigns": active_campaigns,
        "sessions_connected": sessions_connected,
        "credits": credits,
        "funnel_value": funnel_value,
        "leads": replied,
        "stats": {
            "sent": sent_c, "delivered": delivered_c, "read": read_c,
            "replied": replied, "failed": failed_c,
        },
        "recent_campaigns": recent_campaigns,
        "activity": activity,
    }


# ============== CONTACTS ==============
PHONE_RE = re.compile(r"^55\d{10,11}$")


def normalize_phone(raw: str) -> Optional[str]:
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return None
    if not digits.startswith("55"):
        digits = "55" + digits
    if len(digits) < 12 or len(digits) > 13:
        return None
    return digits


def _phone_last10(p: str) -> str:
    """Last 10 digits = DDD (2) + subscriber (8) — stable across BR 12/13-digit
    variants and LID prefixes. Used to reconcile inbound replies with the
    outgoing number we originally sent to."""
    digits = re.sub(r"\D", "", p or "")
    return digits[-10:] if len(digits) >= 10 else digits


async def resolve_canonical_phone(db, user_id: str, incoming: str) -> str:
    """Given an incoming phone from WhatsApp (possibly a LID or 12/13-digit
    variant), find the phone we already have in our records (contacts or
    outgoing messages) that matches on the last 10 digits, and return that
    canonical phone so the conversation stays unified. Falls back to the
    normalized/original incoming number."""
    if not incoming:
        return incoming

    # 0. Explicit LID -> phone mapping captured on send (most reliable)
    digits_only = re.sub(r"\D", "", incoming)
    if digits_only:
        lm = await db.lid_mappings.find_one(
            {"user_id": user_id, "lid": digits_only}, {"_id": 0, "phone": 1}
        )
        if lm and lm.get("phone"):
            return lm["phone"]

    key = _phone_last10(incoming)
    if not key or len(key) < 10:
        return normalize_phone(incoming) or incoming

    # 1. Prefer an existing contact
    contacts = await db.contacts.find(
        {"user_id": user_id}, {"_id": 0, "phone": 1}
    ).to_list(5000)
    for c in contacts:
        if _phone_last10(c.get("phone") or "") == key:
            return c["phone"]

    # 2. Any outgoing campaign/chat message we already sent to this number
    # scan a bounded set (cheap for demo volumes)
    camp_msgs = await db.messages.find(
        {"user_id": user_id}, {"_id": 0, "contact_phone": 1},
    ).to_list(10000)
    for m in camp_msgs:
        if _phone_last10(m.get("contact_phone") or "") == key:
            return m["contact_phone"]

    chat_msgs = await db.chat_messages.find(
        {"user_id": user_id, "direction": "out"}, {"_id": 0, "phone": 1},
    ).to_list(10000)
    for m in chat_msgs:
        if _phone_last10(m.get("phone") or "") == key:
            return m["phone"]

    return normalize_phone(incoming) or incoming


@api.get("/contacts", response_model=List[Contact])
async def list_contacts(current=Depends(get_current_user), search: Optional[str] = None):
    q = {"user_id": current["id"]}
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search}},
        ]
    cur = db.contacts.find(q, {"_id": 0}).sort("created_at", -1).limit(1000)
    return await cur.to_list(1000)


@api.post("/contacts", response_model=Contact)
async def create_contact(data: ContactCreate, current=Depends(get_current_user)):
    phone = normalize_phone(data.phone)
    if not phone:
        raise HTTPException(400, "Telefone inválido. Use formato 55DDDNUMERO")
    contact = Contact(
        user_id=current["id"], name=data.name, phone=phone,
        vehicle=data.vehicle, service=data.service,
    )
    await db.contacts.insert_one(contact.model_dump())
    return contact


@api.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, current=Depends(get_current_user)):
    r = await db.contacts.delete_one({"id": contact_id, "user_id": current["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Contato não encontrado")
    return {"ok": True}


@api.post("/contacts/import-csv", response_model=CSVImportResult)
async def import_csv(file: UploadFile = File(...), current=Depends(get_current_user)):
    content = (await file.read()).decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(content))
    # Normalize header keys lowercase
    imported = skipped = 0
    errors: List[str] = []
    bulk = []
    for row in reader:
        norm = {k.strip().lower(): v for k, v in row.items() if k}
        name = (norm.get("name") or norm.get("nome") or "").strip()
        phone = normalize_phone(norm.get("phone") or norm.get("telefone") or "")
        if not name or not phone:
            skipped += 1
            if len(errors) < 5:
                errors.append(f"Linha inválida: {row}")
            continue
        bulk.append({
            "id": uid(),
            "user_id": current["id"],
            "name": name,
            "phone": phone,
            "vehicle": (norm.get("veiculo") or norm.get("vehicle") or "").strip() or None,
            "service": (norm.get("servico") or norm.get("service") or "").strip() or None,
            "created_at": now_iso(),
        })
    if bulk:
        await db.contacts.insert_many(bulk)
        imported = len(bulk)
    return CSVImportResult(imported=imported, skipped=skipped, errors=errors)


# ============== TEMPLATES ==============
@api.get("/templates", response_model=List[Template])
async def list_templates(current=Depends(get_current_user)):
    cur = db.templates.find({"user_id": current["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@api.post("/templates", response_model=Template)
async def create_template(data: TemplateCreate, current=Depends(get_current_user)):
    t = Template(
        user_id=current["id"], name=data.name,
        versions=data.versions, tone=data.tone,
    )
    await db.templates.insert_one(t.model_dump())
    return t


@api.delete("/templates/{tid}")
async def delete_template(tid: str, current=Depends(get_current_user)):
    r = await db.templates.delete_one({"id": tid, "user_id": current["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Template não encontrado")
    return {"ok": True}


# ============== WHATSAPP SESSIONS ==============
@api.get("/whatsapp/sessions", response_model=List[WhatsAppSession])
async def list_sessions(current=Depends(get_current_user)):
    cur = db.whatsapp_sessions.find({"user_id": current["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(100)


@api.post("/whatsapp/sessions", response_model=WhatsAppSession)
async def create_session(data: WhatsAppSessionCreate, current=Depends(get_current_user)):
    # Enforce instance cap per user
    existing_count = await db.whatsapp_sessions.count_documents({"user_id": current["id"]})
    if existing_count >= MAX_SESSIONS_PER_USER:
        raise HTTPException(400, f"Limite de {MAX_SESSIONS_PER_USER} instâncias por usuário atingido")
    s = WhatsAppSession(
        user_id=current["id"], name=data.name, daily_limit=data.daily_limit,
    )
    await db.whatsapp_sessions.insert_one(s.model_dump())
    return s


@api.post("/whatsapp/sessions/{sid}/connect")
async def connect_session(sid: str, current=Depends(get_current_user)):
    session = await db.whatsapp_sessions.find_one(
        {"id": sid, "user_id": current["id"]}, {"_id": 0}
    )
    if not session:
        raise HTTPException(404, "Sessão não encontrada")

    await db.whatsapp_sessions.update_one(
        {"id": sid}, {"$set": {"status": "conectando", "qr_code": None}}
    )
    try:
        result = await wa_client.start(sid, current["id"], session["name"])
    except Exception as e:
        log.error(f"Baileys start failed: {e}")
        await db.whatsapp_sessions.update_one(
            {"id": sid}, {"$set": {"status": "desconectado"}}
        )
        raise HTTPException(502, f"Serviço WhatsApp indisponível: {e}")
    # If QR already present, persist it
    if result.get("qr"):
        await db.whatsapp_sessions.update_one(
            {"id": sid},
            {"$set": {"qr_code": result["qr"], "status": "aguardando_qr"}},
        )
    return {"status": result.get("status", "conectando"), "qr_code": result.get("qr")}


@api.post("/whatsapp/sessions/{sid}/disconnect")
async def disconnect_session(sid: str, current=Depends(get_current_user)):
    r = await db.whatsapp_sessions.update_one(
        {"id": sid, "user_id": current["id"]},
        {"$set": {"status": "desconectado", "phone_number": None, "qr_code": None}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Sessão não encontrada")
    try:
        await wa_client.stop(sid)
    except Exception as e:
        log.warning(f"Baileys stop warn: {e}")
    return {"ok": True}


@api.delete("/whatsapp/sessions/{sid}")
async def delete_session(sid: str, current=Depends(get_current_user)):
    r = await db.whatsapp_sessions.delete_one({"id": sid, "user_id": current["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Sessão não encontrada")
    try:
        await wa_client.delete(sid)
    except Exception as e:
        log.warning(f"Baileys delete warn: {e}")
    return {"ok": True}


# ============== WHATSAPP WEBHOOK (from Node.js sidecar) ==============
@api.post("/whatsapp/webhook")
async def whatsapp_webhook(
    request: Request,
    x_webhook_secret: Optional[str] = Header(default=None),
):
    if x_webhook_secret != WEBHOOK_SECRET:
        raise HTTPException(401, "Invalid webhook secret")
    payload = await request.json()
    event = payload.get("event")
    sid = payload.get("session_id")
    if not sid:
        return {"ok": True}

    # Try to find the session in DB; for auto-restore, user_id may be "auto-restore"
    session = await db.whatsapp_sessions.find_one({"id": sid}, {"_id": 0})
    if not session:
        return {"ok": True}
    real_user_id = session["user_id"]

    if event == "qr":
        await db.whatsapp_sessions.update_one(
            {"id": sid},
            {"$set": {"status": "aguardando_qr", "qr_code": payload.get("qr")}},
        )
        await manager.send_to_user(real_user_id, {
            "type": "session_qr", "session_id": sid,
            "qr": payload.get("qr"), "status": "aguardando_qr",
        })

    elif event == "connected":
        phone = payload.get("phone_number")
        await db.whatsapp_sessions.update_one(
            {"id": sid},
            {"$set": {"status": "conectado", "phone_number": phone, "qr_code": None}},
        )
        await manager.send_to_user(real_user_id, {
            "type": "session_status", "session_id": sid,
            "status": "conectado", "phone_number": phone,
        })

    elif event in ("disconnected", "logged_out"):
        new_status = "desconectado" if event == "logged_out" else "conectando"
        update = {"status": new_status, "qr_code": None}
        if event == "logged_out":
            update["phone_number"] = None
        await db.whatsapp_sessions.update_one({"id": sid}, {"$set": update})
        await manager.send_to_user(real_user_id, {
            "type": "session_status", "session_id": sid, "status": new_status,
        })

    elif event == "lid_mapping":
        # Node sidecar resolved a LID -> phone. Persist and retroactively merge
        # any chat_messages previously keyed to the raw LID into the real phone
        # conversation.
        lid = (payload.get("lid") or "").strip()
        phone = (payload.get("phone") or "").strip()
        if lid and phone and lid != phone:
            await db.lid_mappings.update_one(
                {"user_id": real_user_id, "lid": lid},
                {"$set": {"user_id": real_user_id, "lid": lid, "phone": phone,
                          "session_id": sid, "updated_at": now_iso()}},
                upsert=True,
            )
            r = await db.chat_messages.update_many(
                {"user_id": real_user_id, "phone": lid},
                {"$set": {"phone": phone}},
            )
            if r.modified_count:
                await manager.send_to_user(real_user_id, {
                    "type": "chat_merged",
                    "from_phone": lid, "to_phone": phone,
                    "moved": r.modified_count,
                })

    elif event == "incoming_message":
        # Reconcile the incoming sender with conversations we already have,
        # so WhatsApp LIDs ("12345@lid") and digit-variant numbers (12 vs 13
        # digit BR numbers) all end up in the same chat thread.
        raw_from = payload.get("from") or ""
        raw_lid = payload.get("from_raw") or raw_from
        push_name = payload.get("push_name")
        number_in = raw_from.split("@")[0]
        text = (payload.get("text") or "").strip()
        canonical = await resolve_canonical_phone(db, real_user_id, number_in)
        # If the raw_lid/number is different from canonical, migrate any
        # previously-orphan chat_messages stored under the bad key onto the
        # canonical phone so the conversation is unified retroactively.
        lid_number = (raw_lid.split("@")[0] if raw_lid else number_in)
        for bad_key in {number_in, lid_number}:
            if bad_key and bad_key != canonical:
                await db.chat_messages.update_many(
                    {"user_id": real_user_id, "phone": bad_key},
                    {"$set": {"phone": canonical}},
                )

        # Try to find the contact name (if any)
        contact = await db.contacts.find_one(
            {"user_id": real_user_id, "phone": canonical}, {"_id": 0, "name": 1}
        )
        name = contact["name"] if contact else push_name

        # Persist incoming chat message
        if text and canonical:
            chat_doc = ChatMessage(
                user_id=real_user_id,
                session_id=sid,
                phone=canonical,
                name=name,
                direction="in",
                content=text,
                status="entregue",
                read=False,
            ).model_dump()
            await db.chat_messages.insert_one(dict(chat_doc))
            await manager.send_to_user(real_user_id, {
                "type": "chat_incoming",
                "message": chat_doc,
            })

        # Existing behavior: mark campaign msgs as responded
        if canonical:
            r = await db.messages.update_many(
                {"user_id": real_user_id, "contact_phone": canonical,
                 "status": {"$in": ["enviado", "entregue", "lido"]}},
                {"$set": {"status": "respondido"}},
            )
            if r.modified_count:
                msgs = await db.messages.find(
                    {"user_id": real_user_id, "contact_phone": canonical, "status": "respondido"},
                    {"_id": 0, "campaign_id": 1},
                ).to_list(100)
                seen = set()
                for m in msgs:
                    if m["campaign_id"] in seen:
                        continue
                    seen.add(m["campaign_id"])
                    await db.campaigns.update_one(
                        {"id": m["campaign_id"]}, {"$inc": {"replied": 1}}
                    )
    return {"ok": True}


@api.post("/whatsapp/resolve-sessions")
async def resolve_sessions(
    request: Request,
    x_webhook_secret: Optional[str] = Header(default=None),
):
    """Called by Node sidecar at boot to map session_ids -> user_ids.
    Orphan folders (no DB row) return null so sidecar can wipe them.
    """
    if x_webhook_secret != WEBHOOK_SECRET:
        raise HTTPException(401, "Invalid webhook secret")
    payload = await request.json()
    ids = payload.get("session_ids") or []
    if not ids:
        return {"mapping": {}}
    rows = await db.whatsapp_sessions.find(
        {"id": {"$in": ids}}, {"_id": 0, "id": 1, "user_id": 1}
    ).to_list(1000)
    mapping = {r["id"]: r["user_id"] for r in rows}
    return {"mapping": mapping}


# ============== CAMPAIGNS ==============
@api.get("/campaigns", response_model=List[Campaign])
async def list_campaigns(current=Depends(get_current_user)):
    cur = db.campaigns.find({"user_id": current["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@api.get("/campaigns/{cid}", response_model=Campaign)
async def get_campaign(cid: str, current=Depends(get_current_user)):
    c = await db.campaigns.find_one({"id": cid, "user_id": current["id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Campanha não encontrada")
    return c


@api.post("/campaigns", response_model=Campaign)
async def create_campaign(data: CampaignCreate, current=Depends(get_current_user)):
    c = Campaign(
        user_id=current["id"], name=data.name,
        template_id=data.template_id,
        message_versions=data.message_versions,
        contact_ids=data.contact_ids,
        session_ids=data.session_ids,
        send_type=data.send_type,
        delay_min=data.delay_min, delay_max=data.delay_max,
        hourly_limit=data.hourly_limit, audio_voice=data.audio_voice,
        total_contacts=len(data.contact_ids),
    )
    await db.campaigns.insert_one(c.model_dump())
    return c


@api.post("/campaigns/{cid}/start")
async def start_campaign(cid: str, bg: BackgroundTasks,
                         current=Depends(get_current_user)):
    c = await db.campaigns.find_one({"id": cid, "user_id": current["id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Campanha não encontrada")
    if c["status"] == "enviando":
        raise HTTPException(400, "Campanha já está em execução")
    if not c.get("contact_ids"):
        raise HTTPException(400, "Campanha sem contatos")
    if not c.get("session_ids"):
        raise HTTPException(400, "Selecione ao menos uma instância WhatsApp")

    bg.add_task(run_campaign, db, cid, current["id"])
    return {"ok": True, "status": "iniciando"}


@api.delete("/campaigns/{cid}")
async def delete_campaign(cid: str, current=Depends(get_current_user)):
    r = await db.campaigns.delete_one({"id": cid, "user_id": current["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Campanha não encontrada")
    await db.messages.delete_many({"campaign_id": cid, "user_id": current["id"]})
    return {"ok": True}


# ============== MESSAGES / REPORTS ==============
@api.get("/campaigns/{cid}/messages")
async def campaign_messages(cid: str, current=Depends(get_current_user),
                            limit: int = Query(200, le=1000)):
    cur = db.messages.find(
        {"campaign_id": cid, "user_id": current["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(limit)
    return await cur.to_list(limit)


@api.get("/reports")
async def reports(current=Depends(get_current_user)):
    campaigns = await db.campaigns.find(
        {"user_id": current["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    total = {"sent": 0, "delivered": 0, "read": 0, "replied": 0, "failed": 0, "total": 0}
    for c in campaigns:
        total["sent"] += c.get("sent", 0)
        total["delivered"] += c.get("delivered", 0)
        total["read"] += c.get("read", 0)
        total["replied"] += c.get("replied", 0)
        total["failed"] += c.get("failed", 0)
        total["total"] += c.get("total_contacts", 0)
    return {"campaigns": campaigns, "totals": total}


# ============== CREDITS ==============
@api.get("/credits/balance")
async def credit_balance(current=Depends(get_current_user)):
    user = await db.users.find_one({"id": current["id"]}, {"_id": 0})
    txs = await db.credit_transactions.find(
        {"user_id": current["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    return {"credits": user.get("credits", 0), "transactions": txs}


@api.post("/credits/recharge")
async def recharge(data: CreditRecharge, current=Depends(get_current_user)):
    if data.amount < 10 or data.amount > 5000:
        raise HTTPException(400, "Valor entre R$ 10 e R$ 5000")
    user = await db.users.find_one({"id": current["id"]}, {"_id": 0})
    new_bal = user.get("credits", 0) + data.amount
    await db.users.update_one({"id": current["id"]}, {"$set": {"credits": new_bal}})
    tx = {
        "id": uid(), "user_id": current["id"], "type": "recarga",
        "amount": data.amount, "balance_after": new_bal,
        "description": "Recarga via Pix (simulada)",
        "created_at": now_iso(),
    }
    await db.credit_transactions.insert_one(dict(tx))
    tx.pop("_id", None)
    return {"credits": new_bal, "transaction": tx}


# ============== AI ==============
@api.post("/ai/suggest")
async def ai_suggest(data: AISuggestRequest, current=Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY não configurada")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(500, f"emergentintegrations indisponível: {e}")

    tone_map = {
        "formal": "Use tom formal, cortês e profissional, sem gírias.",
        "venda": "Use tom persuasivo de vendas, amigável, com chamada para ação clara.",
        "recuperacao": "Use tom de recuperação de cliente: empático, acolhedor, com senso de urgência sutil.",
    }
    tone_hint = tone_map.get(data.tone, tone_map["venda"])
    system = (
        "Você é um especialista em copywriting para WhatsApp no Brasil. "
        "Gere mensagens curtas (até 280 caracteres), usando linguagem natural brasileira. "
        "Use as variáveis {nome}, {veiculo}, {servico} quando fizer sentido. "
        "Retorne APENAS as mensagens numeradas, sem explicações."
    )
    prompt = (
        f"{tone_hint}\n\n"
        f"Contexto do negócio: {data.context}\n\n"
        f"Gere {data.variations} variações diferentes de mensagem para disparo em massa. "
        f"Cada uma em uma linha, começando com '1.', '2.', etc."
    )

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"ai-suggest-{current['id']}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    try:
        reply = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        raise HTTPException(500, f"Falha na IA: {e}")
    # Parse numbered list
    lines = [ln.strip() for ln in reply.split("\n") if ln.strip()]
    variations = []
    for ln in lines:
        m = re.match(r"^\d+[\.\)]\s*(.+)$", ln)
        if m:
            variations.append(m.group(1).strip().strip('"').strip("'"))
    if not variations:
        variations = [reply.strip()]
    return {"variations": variations[: data.variations]}


@api.post("/ai/tts")
async def ai_tts(data: TTSRequest, current=Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY não configurada")
    if len(data.text) > 4000:
        raise HTTPException(400, "Texto muito longo (máx 4000)")
    try:
        from emergentintegrations.llm.openai import OpenAITextToSpeech
    except Exception as e:
        raise HTTPException(500, f"emergentintegrations indisponível: {e}")

    tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
    try:
        audio_bytes = await tts.generate_speech(
            text=data.text, model=data.model, voice=data.voice,
        )
    except Exception as e:
        raise HTTPException(500, f"Falha no TTS: {e}")

    b64 = base64.b64encode(audio_bytes).decode()
    return {"audio_base64": b64, "mime": "audio/mp3"}


# ============== CHAT (conversations) ==============
@api.get("/chat/conversations")
async def chat_conversations(current=Depends(get_current_user)):
    """Aggregate conversations from both chat_messages (inbound+manual outbound)
    and campaign messages (outgoing). Returns one entry per phone with last
    message, unread count, and contact name."""
    uid_ = current["id"]

    # Pull all chat_messages + campaign messages for this user.
    chat_msgs = await db.chat_messages.find(
        {"user_id": uid_}, {"_id": 0}
    ).to_list(20000)
    camp_msgs = await db.messages.find(
        {"user_id": uid_, "status": {"$ne": "pendente"}},
        {"_id": 0, "contact_phone": 1, "contact_name": 1,
         "content": 1, "sent_at": 1, "created_at": 1, "session_id": 1},
    ).to_list(20000)

    convs: dict = {}
    def bump(phone, name, content, ts, direction, unread_inc=0, session_id=None):
        if not phone:
            return
        c = convs.setdefault(phone, {
            "phone": phone, "name": name, "last_message": "",
            "last_direction": "out", "last_at": "", "unread": 0,
            "session_id": session_id,
        })
        if name and not c["name"]:
            c["name"] = name
        if session_id and not c.get("session_id"):
            c["session_id"] = session_id
        if ts and ts > (c["last_at"] or ""):
            c["last_at"] = ts
            c["last_message"] = content or ""
            c["last_direction"] = direction
        c["unread"] += unread_inc

    for m in chat_msgs:
        unread_inc = 1 if (m.get("direction") == "in" and not m.get("read")) else 0
        bump(m.get("phone"), m.get("name"), m.get("content"),
             m.get("created_at"), m.get("direction", "in"),
             unread_inc=unread_inc, session_id=m.get("session_id"))

    for m in camp_msgs:
        ts = m.get("sent_at") or m.get("created_at")
        bump(m.get("contact_phone"), m.get("contact_name"),
             m.get("content"), ts, "out",
             session_id=m.get("session_id"))

    items = sorted(convs.values(), key=lambda x: x["last_at"] or "", reverse=True)
    return {"conversations": items}


@api.get("/chat/messages")
async def chat_messages(
    phone: str = Query(..., min_length=6),
    limit: int = Query(500, le=2000),
    current=Depends(get_current_user),
):
    uid_ = current["id"]
    timeline = []

    # chat_messages (inbound + manual outbound)
    chats = await db.chat_messages.find(
        {"user_id": uid_, "phone": phone}, {"_id": 0}
    ).to_list(limit)
    for m in chats:
        timeline.append({
            "id": m["id"],
            "direction": m.get("direction", "in"),
            "content": m.get("content", ""),
            "created_at": m.get("created_at"),
            "status": m.get("status", "enviado"),
            "source": "chat",
        })

    # campaign outgoing messages for this phone
    camps = await db.messages.find(
        {"user_id": uid_, "contact_phone": phone, "status": {"$ne": "pendente"}},
        {"_id": 0},
    ).to_list(limit)
    for m in camps:
        timeline.append({
            "id": m["id"],
            "direction": "out",
            "content": m.get("content", ""),
            "created_at": m.get("sent_at") or m.get("created_at"),
            "status": m.get("status", "enviado"),
            "source": "campaign",
        })

    timeline.sort(key=lambda x: x.get("created_at") or "")
    return {"phone": phone, "messages": timeline}


@api.post("/chat/read")
async def chat_mark_read(
    phone: str = Query(..., min_length=6),
    current=Depends(get_current_user),
):
    r = await db.chat_messages.update_many(
        {"user_id": current["id"], "phone": phone, "direction": "in", "read": False},
        {"$set": {"read": True}},
    )
    return {"updated": r.modified_count}


@api.post("/chat/send")
async def chat_send(data: ChatSendRequest, current=Depends(get_current_user)):
    if not data.text.strip():
        raise HTTPException(400, "Mensagem vazia")

    phone = normalize_phone(data.phone) or data.phone
    session_id = data.session_id

    # Pick a connected session if none supplied
    if not session_id:
        s = await db.whatsapp_sessions.find_one(
            {"user_id": current["id"], "status": "conectado"}, {"_id": 0}
        )
        session_id = s["id"] if s else None

    # Try real send via Baileys sidecar; tolerate failure so message still
    # gets logged (so the user sees their typed message in the UI).
    status = "enviado"
    error = None
    if session_id:
        try:
            st = await wa_client.status(session_id)
            if st.get("status") == "conectado":
                await wa_client.send_text(session_id, phone, data.text)
            else:
                status = "falha"
                error = "Sessão WhatsApp não conectada"
        except Exception as e:
            status = "falha"
            error = str(e)
    else:
        status = "falha"
        error = "Nenhuma instância WhatsApp conectada"

    # Try to find contact name
    contact = await db.contacts.find_one(
        {"user_id": current["id"], "phone": phone}, {"_id": 0, "name": 1}
    )
    name = contact["name"] if contact else None

    chat_doc = ChatMessage(
        user_id=current["id"],
        session_id=session_id,
        phone=phone,
        name=name,
        direction="out",
        content=data.text,
        status=status,
        read=True,
    ).model_dump()
    await db.chat_messages.insert_one(dict(chat_doc))

    await manager.send_to_user(current["id"], {
        "type": "chat_outgoing", "message": chat_doc,
    })

    return {"ok": status != "falha", "status": status, "error": error, "message": chat_doc}


@api.post("/chat/merge")
async def chat_merge(
    from_phone: str = Query(..., min_length=4),
    to_phone: str = Query(..., min_length=4),
    current=Depends(get_current_user),
):
    """Move all messages from 'from_phone' into 'to_phone' (used to clean up
    orphan LID conversations back into the real phone thread)."""
    if from_phone == to_phone:
        return {"moved": 0}
    r = await db.chat_messages.update_many(
        {"user_id": current["id"], "phone": from_phone},
        {"$set": {"phone": to_phone}},
    )
    return {"moved": r.modified_count}


@api.delete("/chat/conversation")
async def chat_delete_conversation(
    phone: str = Query(..., min_length=4),
    current=Depends(get_current_user),
):
    r = await db.chat_messages.delete_many(
        {"user_id": current["id"], "phone": phone}
    )
    return {"deleted": r.deleted_count}


# ============== WEBSOCKET ==============
@api.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, token: str = Query(...)):
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=1008)
        return
    user_id = payload["sub"]
    await manager.connect(user_id, websocket)
    try:
        while True:
            # keep-alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception:
        manager.disconnect(user_id, websocket)


# ============== ROOT ==============
@api.get("/")
async def root():
    return {"app": "ZapFlow", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
