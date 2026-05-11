import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
import os
from pathlib import Path
from dotenv import load_dotenv
import re
import random
from zoneinfo import ZoneInfo

# ========================
# ENV
# ========================
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ========================
# TIMEZONE OFICIAL
# ========================
SP_TZ = ZoneInfo("America/Sao_Paulo")

# ========================
# LOCK POR INSTÂNCIA
# ========================
session_locks = {}

def get_lock(session_id: str):
    if session_id not in session_locks:
        session_locks[session_id] = asyncio.Lock()
    return session_locks[session_id]

# ========================
# TEMPLATE ENGINE
# ========================
def render(text: str, payload: dict):
    def repl(m):
        key = m.group(1)
        return str(payload.get(key, "") or "")
    return re.sub(r"\{(\w+)\}", repl, text)

# ========================
# PARSE DATA SEGURO
# ========================
def parse_schedule(value):
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(value)

    # força timezone SP se não existir
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=SP_TZ)

    return dt

# ========================
# EXECUÇÃO DO JOB
# ========================
async def execute_job(job):
    payload = job.get("payload", {})

    instance_name = payload.get("instance_name")
    phone = payload.get("phone")
    template_name = payload.get("template_name")
    user_id = job.get("user_id")

    if not instance_name or not phone or not template_name:
        await db.scheduled_jobs.update_one(
            {"id": job["id"]},
            {"$set": {"status": "error", "error": "payload inválido"}}
        )
        return

    # buscar instância
    session = await db.whatsapp_sessions.find_one({
        "user_id": user_id,
        "name": instance_name,
        "status": "conectado"
    })

    if not session:
        await db.scheduled_jobs.update_one(
            {"id": job["id"]},
            {"$set": {"status": "error", "error": "instância não encontrada"}}
        )
        return

    session_id = session["id"]
    lock = get_lock(session_id)

    async with lock:
        try:
            from wa_client import wa_client

            # buscar template
            template = await db.templates.find_one({
                "user_id": user_id,
                "name": template_name
            })

            if not template:
                raise Exception("template não encontrado")

            text = random.choice(template.get("versions", []))

            # render variáveis completas
            text = render(text, payload)

            await wa_client.send_text(session_id, phone, text)

            await db.scheduled_jobs.update_one(
                {"id": job["id"]},
                {"$set": {
                    "status": "concluida",
                    "executed_at": datetime.now(SP_TZ)
                }}
            )

            # anti spam
            await asyncio.sleep(5)

        except Exception as e:
            await db.scheduled_jobs.update_one(
                {"id": job["id"]},
                {"$set": {
                    "status": "error",
                    "error": str(e)
                }}
            )

# ========================
# WORKER PRINCIPAL
# ========================
async def worker():
    while True:
        now = datetime.now(SP_TZ)

        jobs = await db.scheduled_jobs.find({
            "status": "pending"
        }).to_list(200)

        for job in jobs:
            try:
                schedule_at = parse_schedule(job["schedule_at"])

                # DEBUG (IMPORTANTE)
                print(f"[NOW] {now} | [JOB] {schedule_at}")

                # só executa quando chegou a hora exata ou passou
                if schedule_at <= now:
                    await execute_job(job)

            except Exception as e:
                await db.scheduled_jobs.update_one(
                    {"id": job["id"]},
                    {"$set": {"status": "error", "error": str(e)}}
                )

        await asyncio.sleep(2)

# ========================
# START
# ========================
if __name__ == "__main__":
    asyncio.run(worker())