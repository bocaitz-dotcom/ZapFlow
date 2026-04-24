"""Baileys sidecar client: talks to Node.js service on 181.215.134.15:3003."""
import os
import httpx

WA_SERVICE_URL = os.environ.get("WA_SERVICE_URL", "http://181.215.134.15:3003")
WEBHOOK_SECRET = os.environ.get("WA_WEBHOOK_SECRET", "zapflow-webhook-secret")


class WAClient:
    def __init__(self, base: str = WA_SERVICE_URL):
        self.base = base.rstrip("/")

    async def _post(self, path: str, json=None):
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f"{self.base}{path}", json=json or {})
            r.raise_for_status()
            return r.json()

    async def _get(self, path: str):
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.base}{path}")
            r.raise_for_status()
            return r.json()

    async def health(self):
        return await self._get("/health")

    async def start(self, session_id: str, user_id: str, display_name: str):
        return await self._post("/session/start", {
            "session_id": session_id,
            "user_id": user_id,
            "display_name": display_name,
        })

    async def status(self, session_id: str):
        return await self._get(f"/session/{session_id}/status")

    async def stop(self, session_id: str):
        return await self._post(f"/session/{session_id}/stop")

    async def delete(self, session_id: str):
        return await self._post(f"/session/{session_id}/delete")

    async def send_text(self, session_id: str, number: str, text: str):
        return await self._post(f"/session/{session_id}/send-text", {
            "number": number, "text": text,
        })

    async def send_audio(self, session_id: str, number: str, audio_base64: str, mime: str = "audio/mp4"):
        return await self._post(f"/session/{session_id}/send-audio", {
            "number": number, "audio_base64": audio_base64, "mime": mime,
        })


wa_client = WAClient()
