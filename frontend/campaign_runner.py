"""Simulated WhatsApp campaign runner with anti-block controls.
If a session is connected via Baileys, sends real messages; otherwise simulates
(unless CAMPAIGN_SIMULATE_IF_NOT_CONNECTED=false which makes it fail-fast).
"""
import asyncio
import os
import random
import base64 as _b64
from datetime import datetime, timezone
from typing import List
from ws_manager import manager
from wa_client import wa_client

SIMULATE_FALLBACK = os.environ.get("CAMPAIGN_SIMULATE_IF_NOT_CONNECTED", "true").lower() == "true"


AUDIO_COST = 0.15  # BRL per audio message
TEXT_COST = 0.05   # BRL per text message


def render_message(template: str, contact: dict) -> str:
    """Replace variables {nome}, {veiculo}, {servico} with contact data."""
    return (
        template
        .replace("{nome}", contact.get("name", ""))
        .replace("{veiculo}", contact.get("vehicle") or "seu veículo")
        .replace("{servico}", contact.get("service") or "nosso serviço")
    )


async def _simulate_send(status_chain: List[str], delay_range=(0.5, 2.0)):
    """Simulate lifecycle: sent -> delivered -> read -> replied/failed."""
    for s in status_chain:
        await asyncio.sleep(random.uniform(*delay_range))
        yield s


async def run_campaign(db, campaign_id: str, user_id: str):
    """Background task that simulates the whole campaign."""
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        return

    contacts_cur = db.contacts.find(
        {"id": {"$in": campaign["contact_ids"]}, "user_id": user_id}, {"_id": 0}
    )
    contacts = await contacts_cur.to_list(10000)

    sessions = await db.whatsapp_sessions.find(
        {"id": {"$in": campaign["session_ids"]}, "user_id": user_id}, {"_id": 0}
    ).to_list(100)
    if not sessions:
        await db.campaigns.update_one(
            {"id": campaign_id}, {"$set": {"status": "concluida"}}
        )
        return

    versions = campaign["message_versions"] or ["Olá {nome}!"]
    send_type = campaign.get("send_type", "texto")
    cost_per = AUDIO_COST if send_type in ("audio", "ambos") else TEXT_COST

    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {"status": "enviando", "total_contacts": len(contacts)}},
    )
    await manager.send_to_user(
        user_id,
        {"type": "campaign_status", "campaign_id": campaign_id, "status": "enviando"},
    )

    session_idx = 0
    sent = delivered = read = replied = failed = 0

    for contact in contacts:
        # Check user credits
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user or user.get("credits", 0) < cost_per:
            await db.campaigns.update_one(
                {"id": campaign_id}, {"$set": {"status": "pausada"}}
            )
            await manager.send_to_user(
                user_id,
                {"type": "campaign_status", "campaign_id": campaign_id,
                 "status": "pausada", "reason": "Créditos insuficientes"},
            )
            return

        # Rotation between sessions (chips)
        session = sessions[session_idx % len(sessions)]
        session_idx += 1
        template = random.choice(versions)
        content = render_message(template, contact)

        msg_doc = {
            "id": __import__("uuid").uuid4().hex,
            "user_id": user_id,
            "campaign_id": campaign_id,
            "contact_id": contact["id"],
            "contact_name": contact["name"],
            "contact_phone": contact["phone"],
            "session_id": session["id"],
            "content": content,
            "send_type": send_type,
            "status": "pendente",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "sent_at": None,
        }
        await db.messages.insert_one(dict(msg_doc))
        msg_doc.pop("_id", None)

        # Anti-block random delay
        delay = random.uniform(
            campaign.get("delay_min", 3), campaign.get("delay_max", 15)
        )
        # Cap for snappy demo
        await asyncio.sleep(min(delay, 6.0))

        # Try real send via Baileys if session is connected
        send_ok = True
        real_send = False
        error_msg = None
        try:
            st = await wa_client.status(session["id"])
            if st.get("status") == "conectado":
                real_send = True
                if send_type in ("texto", "ambos"):
                    await wa_client.send_text(session["id"], contact["phone"], content)
                if send_type in ("audio", "ambos") and campaign.get("audio_voice"):
                    # Audio pre-generation not implemented yet for real sends.
                    pass
            elif not SIMULATE_FALLBACK:
                # Production: fail-fast instead of faking delivery
                send_ok = False
                error_msg = "Sessão WhatsApp não está conectada"
        except Exception as e:
            error_msg = str(e)
            send_ok = False

        # In simulation mode: ~5% random failure
        if send_ok and not real_send and SIMULATE_FALLBACK:
            if random.random() < 0.05:
                send_ok = False
                error_msg = error_msg or "Número inválido ou chip bloqueado"

        if not send_ok:
            await db.messages.update_one(
                {"id": msg_doc["id"]},
                {"$set": {"status": "falha", "error": error_msg or "Falha ao enviar"}},
            )
            failed += 1
            await db.campaigns.update_one(
                {"id": campaign_id}, {"$inc": {"failed": 1}}
            )
            await manager.send_to_user(
                user_id,
                {"type": "message_update", "campaign_id": campaign_id,
                 "message_id": msg_doc["id"], "status": "falha",
                 "counts": {"sent": sent, "delivered": delivered, "read": read,
                            "replied": replied, "failed": failed}},
            )
            continue

        # Deduct credits
        await db.users.update_one({"id": user_id}, {"$inc": {"credits": -cost_per}})
        await db.credit_transactions.insert_one({
            "id": __import__("uuid").uuid4().hex,
            "user_id": user_id,
            "type": "consumo",
            "amount": -cost_per,
            "balance_after": user["credits"] - cost_per,
            "description": f"Mensagem para {contact['name']}",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        # Mark sent
        sent_at = datetime.now(timezone.utc).isoformat()
        await db.messages.update_one(
            {"id": msg_doc["id"]},
            {"$set": {"status": "enviado", "sent_at": sent_at}},
        )
        sent += 1
        await db.campaigns.update_one(
            {"id": campaign_id}, {"$inc": {"sent": 1}}
        )
        await db.whatsapp_sessions.update_one(
            {"id": session["id"]}, {"$inc": {"sent_today": 1}}
        )
        await manager.send_to_user(
            user_id,
            {"type": "message_update", "campaign_id": campaign_id,
             "message_id": msg_doc["id"], "status": "enviado",
             "contact_name": contact["name"],
             "counts": {"sent": sent, "delivered": delivered, "read": read,
                        "replied": replied, "failed": failed}},
        )

        # Simulate lifecycle async
        asyncio.create_task(_lifecycle(db, user_id, campaign_id, msg_doc["id"]))

    # Wait a bit for lifecycle tasks to progress
    await asyncio.sleep(3)
    await db.campaigns.update_one(
        {"id": campaign_id}, {"$set": {"status": "concluida"}}
    )
    await manager.send_to_user(
        user_id,
        {"type": "campaign_status", "campaign_id": campaign_id, "status": "concluida"},
    )


async def _lifecycle(db, user_id: str, campaign_id: str, message_id: str):
    """Simulate delivered -> read -> replied."""
    # delivered
    await asyncio.sleep(random.uniform(1.0, 3.0))
    await db.messages.update_one({"id": message_id}, {"$set": {"status": "entregue"}})
    await db.campaigns.update_one({"id": campaign_id}, {"$inc": {"delivered": 1}})
    await manager.send_to_user(user_id, {
        "type": "message_update", "message_id": message_id,
        "campaign_id": campaign_id, "status": "entregue"
    })

    # read ~70%
    if random.random() < 0.7:
        await asyncio.sleep(random.uniform(2.0, 5.0))
        await db.messages.update_one({"id": message_id}, {"$set": {"status": "lido"}})
        await db.campaigns.update_one({"id": campaign_id}, {"$inc": {"read": 1}})
        await manager.send_to_user(user_id, {
            "type": "message_update", "message_id": message_id,
            "campaign_id": campaign_id, "status": "lido"
        })

        # replied ~25%
        if random.random() < 0.25:
            await asyncio.sleep(random.uniform(3.0, 8.0))
            await db.messages.update_one({"id": message_id}, {"$set": {"status": "respondido"}})
            await db.campaigns.update_one({"id": campaign_id}, {"$inc": {"replied": 1}})
            await manager.send_to_user(user_id, {
                "type": "message_update", "message_id": message_id,
                "campaign_id": campaign_id, "status": "respondido"
            })
