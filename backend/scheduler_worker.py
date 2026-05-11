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
import httpx
import json

async def execute_job(job):

    payload = job.get("payload", {})
    user_id = job.get("user_id")

    # CORRETO para dict
    payload["user_id"] = user_id
    payload["name"] = payload.get("nome", "")

    #print("\n========== payload COMPLETO ==========")
    #print(json.dumps(payload, indent=2, ensure_ascii=False, default=str))
    #print("==================================\n")

    try:
        
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://http://localhost:8000/api/chat/send-by-instance",
                json=payload
            )

        print("STATUS:", response.status_code)
        print("RESPONSE:", response.text)

        if response.status_code != 200:
            raise Exception(f"HTTP {response.status_code}: {response.text}")

        await db.scheduled_jobs.update_one(
            {"id": job["id"]},
            {"$set": {
                "status": "concluida",
                "executed_at": datetime.now(SP_TZ)
            }}
        )

    except Exception as e:
        print("ERROR EXECUTE_JOB:", str(e))

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