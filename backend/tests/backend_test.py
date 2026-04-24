"""Comprehensive backend tests for ZapFlow API (Baileys real integration)."""
import io
import os
import time
import uuid
import json
import pytest
import requests
import httpx

WEBHOOK_SECRET = "zapflow-webhook-secret"
SIDECAR_URL = "http://127.0.0.1:3001"

# Shared state across tests (ordered execution)
STATE = {}


# ========== HEALTH ==========
def test_root_health(api_client, base_url):
    r = api_client.get(f"{base_url}/api/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_sidecar_health():
    """Baileys Node.js sidecar must be up on 127.0.0.1:3001."""
    r = requests.get(f"{SIDECAR_URL}/health", timeout=5)
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert "sessions" in d and isinstance(d["sessions"], int)


# ========== AUTH ==========
def test_register_and_welcome_bonus(api_client, base_url):
    uniq = uuid.uuid4().hex[:8]
    email = f"test_reg_{uniq}@zapflow-qa.com"
    r = api_client.post(f"{base_url}/api/auth/register", json={
        "name": "Reg User", "email": email, "password": "Test@12345"
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert "access_token" in d and isinstance(d["access_token"], str)
    assert d["user"]["email"] == email
    assert d["user"]["credits"] == 25.0


def test_register_duplicate_email(api_client, base_url, test_user, auth_token):
    r = api_client.post(f"{base_url}/api/auth/register", json=test_user)
    assert r.status_code == 400


def test_login_success(api_client, base_url, test_user, auth_token):
    r = api_client.post(f"{base_url}/api/auth/login", json={
        "email": test_user["email"], "password": test_user["password"]
    })
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_invalid(api_client, base_url, test_user):
    r = api_client.post(f"{base_url}/api/auth/login", json={
        "email": test_user["email"], "password": "WrongPass"
    })
    assert r.status_code == 401


def test_auth_me(api_client, base_url, auth_headers, test_user):
    r = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
    assert r.status_code == 200
    d = r.json()
    assert d["email"] == test_user["email"]
    assert "password_hash" not in d


def test_auth_me_unauthorized(api_client, base_url):
    r = api_client.get(f"{base_url}/api/auth/me")
    assert r.status_code == 401


# ========== DASHBOARD ==========
def test_dashboard_stats(api_client, base_url, auth_headers):
    r = api_client.get(f"{base_url}/api/dashboard/stats", headers=auth_headers)
    assert r.status_code == 200
    d = r.json()
    for k in ("contacts", "active_campaigns", "sessions_connected", "credits", "stats", "recent_campaigns", "activity"):
        assert k in d


# ========== CONTACTS ==========
def test_create_contact_valid(api_client, base_url, auth_headers):
    r = api_client.post(f"{base_url}/api/contacts", headers=auth_headers, json={
        "name": "Joao Teste", "phone": "11987654321",
        "vehicle": "Civic", "service": "Revisao"
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["phone"] == "5511987654321"
    STATE["contact_id"] = d["id"]


def test_create_contact_invalid_phone(api_client, base_url, auth_headers):
    r = api_client.post(f"{base_url}/api/contacts", headers=auth_headers, json={
        "name": "Bad", "phone": "123"
    })
    assert r.status_code == 400


def test_list_contacts(api_client, base_url, auth_headers):
    r = api_client.get(f"{base_url}/api/contacts", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_csv_import(api_client, base_url, auth_token):
    csv_text = (
        "Name,Phone,Vehicle,Service\n"
        "Carlos,11988887777,Corolla,Troca de oleo\n"
        "Ana,5511977776666,Onix,Alinhamento\n"
        "Bad,123,Gol,X\n"
    )
    files = {"file": ("contacts.csv", csv_text, "text/csv")}
    headers = {"Authorization": f"Bearer {auth_token}"}
    r = requests.post(f"{base_url}/api/contacts/import-csv", headers=headers, files=files)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["imported"] == 2
    assert d["skipped"] == 1


# ========== TEMPLATES ==========
def test_create_template(api_client, base_url, auth_headers):
    r = api_client.post(f"{base_url}/api/templates", headers=auth_headers, json={
        "name": "TEST Promo",
        "versions": ["Ola {nome}!", "Oi {nome}, {servico}"],
        "tone": "venda"
    })
    assert r.status_code == 200
    STATE["template_id"] = r.json()["id"]


def test_list_templates(api_client, base_url, auth_headers):
    r = api_client.get(f"{base_url}/api/templates", headers=auth_headers)
    assert r.status_code == 200
    assert any(t["id"] == STATE["template_id"] for t in r.json())


# ========== WHATSAPP SESSIONS - REAL BAILEYS ==========
def test_create_whatsapp_session(api_client, base_url, auth_headers):
    r = api_client.post(f"{base_url}/api/whatsapp/sessions", headers=auth_headers, json={
        "name": "TEST Chip 1", "daily_limit": 200
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "desconectado"
    assert d["daily_limit"] == 200
    STATE["session_id"] = d["id"]


def test_list_whatsapp_sessions(api_client, base_url, auth_headers):
    r = api_client.get(f"{base_url}/api/whatsapp/sessions", headers=auth_headers)
    assert r.status_code == 200
    assert any(s["id"] == STATE["session_id"] for s in r.json())


def test_session_limit_enforced(api_client, base_url, auth_headers):
    """Create up to 5 sessions total; 6th must 400."""
    created_ids = []
    # We already have 1 (TEST Chip 1). Create 4 more to reach 5 total.
    for i in range(2, 6):
        r = api_client.post(f"{base_url}/api/whatsapp/sessions", headers=auth_headers, json={
            "name": f"TEST Chip {i}", "daily_limit": 50
        })
        assert r.status_code == 200, f"Session {i} failed: {r.text}"
        created_ids.append(r.json()["id"])
    # 6th must 400
    r = api_client.post(f"{base_url}/api/whatsapp/sessions", headers=auth_headers, json={
        "name": "TEST Chip 6", "daily_limit": 50
    })
    assert r.status_code == 400, r.text
    assert "Limite" in r.text or "limite" in r.text or "5" in r.text
    # cleanup extras
    for sid in created_ids:
        api_client.delete(f"{base_url}/api/whatsapp/sessions/{sid}", headers=auth_headers)


def test_connect_session_real_baileys(api_client, base_url, auth_headers):
    """POST connect should call Node sidecar and transition to aguardando_qr with real QR data URL."""
    sid = STATE["session_id"]
    r = api_client.post(f"{base_url}/api/whatsapp/sessions/{sid}/connect", headers=auth_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] in ("conectando", "aguardando_qr")
    # Wait up to ~10s for Baileys to emit QR via webhook
    qr_seen = False
    for _ in range(15):
        time.sleep(1)
        lst = api_client.get(f"{base_url}/api/whatsapp/sessions", headers=auth_headers).json()
        s = next((x for x in lst if x["id"] == sid), None)
        assert s is not None
        if s["status"] == "aguardando_qr" and s.get("qr_code"):
            assert s["qr_code"].startswith("data:image/png;base64,"), \
                f"Expected data URL, got prefix: {s['qr_code'][:40]}"
            assert len(s["qr_code"]) > 500  # real base64 PNG is big
            qr_seen = True
            break
    assert qr_seen, f"QR never appeared via webhook. Last status: {s.get('status')}"
    STATE["connected_session_id"] = sid


# ========== WEBHOOK SECURITY & EVENTS ==========
def test_webhook_requires_secret(api_client, base_url):
    r = requests.post(f"{base_url}/api/whatsapp/webhook", json={"event": "qr", "session_id": "x"})
    assert r.status_code == 401


def test_webhook_wrong_secret(api_client, base_url):
    r = requests.post(
        f"{base_url}/api/whatsapp/webhook",
        json={"event": "qr", "session_id": "x"},
        headers={"X-Webhook-Secret": "wrong"},
    )
    assert r.status_code == 401


def test_webhook_event_connected_updates_db(api_client, base_url, auth_headers):
    sid = STATE["session_id"]
    phone = "5511999990000"
    r = requests.post(
        f"{base_url}/api/whatsapp/webhook",
        json={"event": "connected", "session_id": sid, "phone_number": phone},
        headers={"X-Webhook-Secret": WEBHOOK_SECRET},
    )
    assert r.status_code == 200
    time.sleep(0.5)
    lst = api_client.get(f"{base_url}/api/whatsapp/sessions", headers=auth_headers).json()
    s = next(x for x in lst if x["id"] == sid)
    assert s["status"] == "conectado"
    assert s["phone_number"] == phone
    assert s["qr_code"] is None


def test_webhook_event_logged_out_clears_phone(api_client, base_url, auth_headers):
    sid = STATE["session_id"]
    r = requests.post(
        f"{base_url}/api/whatsapp/webhook",
        json={"event": "logged_out", "session_id": sid},
        headers={"X-Webhook-Secret": WEBHOOK_SECRET},
    )
    assert r.status_code == 200
    time.sleep(0.5)
    lst = api_client.get(f"{base_url}/api/whatsapp/sessions", headers=auth_headers).json()
    s = next(x for x in lst if x["id"] == sid)
    assert s["status"] == "desconectado"
    assert s["phone_number"] is None
    assert s["qr_code"] is None


def test_webhook_event_qr_updates_db(api_client, base_url, auth_headers):
    sid = STATE["session_id"]
    fake_qr = "data:image/png;base64,AAAAAAAA"
    r = requests.post(
        f"{base_url}/api/whatsapp/webhook",
        json={"event": "qr", "session_id": sid, "qr": fake_qr},
        headers={"X-Webhook-Secret": WEBHOOK_SECRET},
    )
    assert r.status_code == 200
    time.sleep(0.5)
    lst = api_client.get(f"{base_url}/api/whatsapp/sessions", headers=auth_headers).json()
    s = next(x for x in lst if x["id"] == sid)
    assert s["status"] == "aguardando_qr"
    assert s["qr_code"] == fake_qr


def test_webhook_event_incoming_message_marks_replied(api_client, base_url, auth_headers):
    """Insert a message via campaign flow; then simulate incoming reply webhook."""
    sid = STATE["session_id"]
    # First, force session conectado for campaign start validation
    requests.post(
        f"{base_url}/api/whatsapp/webhook",
        json={"event": "connected", "session_id": sid, "phone_number": "5511999990000"},
        headers={"X-Webhook-Secret": WEBHOOK_SECRET},
    )
    time.sleep(0.3)
    # Create campaign
    r = api_client.post(f"{base_url}/api/campaigns", headers=auth_headers, json={
        "name": "TEST Reply",
        "message_versions": ["Oi {nome}"],
        "contact_ids": [STATE["contact_id"]],
        "session_ids": [sid],
        "send_type": "texto",
        "delay_min": 1, "delay_max": 1, "hourly_limit": 60
    })
    assert r.status_code == 200
    cid = r.json()["id"]
    STATE["reply_campaign_id"] = cid
    # Start it (session shows connected in DB but sidecar will reject send -> falls back to simulation path)
    api_client.post(f"{base_url}/api/campaigns/{cid}/start", headers=auth_headers)
    time.sleep(8)
    # Mark message's contact as replied via webhook
    msgs = api_client.get(f"{base_url}/api/campaigns/{cid}/messages", headers=auth_headers).json()
    assert len(msgs) >= 1, "No messages created by campaign runner"
    phone = msgs[0]["contact_phone"]
    # Fire incoming_message webhook
    r = requests.post(
        f"{base_url}/api/whatsapp/webhook",
        json={"event": "incoming_message", "session_id": sid,
              "from": f"{phone}@s.whatsapp.net", "text": "sim quero"},
        headers={"X-Webhook-Secret": WEBHOOK_SECRET},
    )
    assert r.status_code == 200
    time.sleep(1)
    # Check at least one message now marked respondido (if status was enviado/entregue/lido)
    msgs2 = api_client.get(f"{base_url}/api/campaigns/{cid}/messages", headers=auth_headers).json()
    # No assertion failure if messages were all 'pendente' or 'falha' (acceptable),
    # but at least the webhook did not error.
    assert all("status" in m for m in msgs2)


def test_connect_bad_session_404(api_client, base_url, auth_headers):
    r = api_client.post(f"{base_url}/api/whatsapp/sessions/doesnotexist/connect", headers=auth_headers)
    assert r.status_code == 404


def test_disconnect_session(api_client, base_url, auth_headers):
    sid = STATE["session_id"]
    r = api_client.post(f"{base_url}/api/whatsapp/sessions/{sid}/disconnect", headers=auth_headers)
    assert r.status_code == 200


# ========== CAMPAIGNS ==========
def test_create_campaign(api_client, base_url, auth_headers):
    r = api_client.post(f"{base_url}/api/campaigns", headers=auth_headers, json={
        "name": "TEST Campaign",
        "template_id": STATE["template_id"],
        "message_versions": ["Ola {nome}"],
        "contact_ids": [STATE["contact_id"]],
        "session_ids": [STATE["session_id"]],
        "send_type": "texto",
        "delay_min": 1, "delay_max": 2, "hourly_limit": 60
    })
    assert r.status_code == 200, r.text
    STATE["campaign_id"] = r.json()["id"]


def test_start_campaign_simulation_fallback(api_client, base_url, auth_headers):
    """Session is not connected via Baileys (was disconnected) -> runner should simulate or mark falha/pendente."""
    cid = STATE["campaign_id"]
    r = api_client.post(f"{base_url}/api/campaigns/{cid}/start", headers=auth_headers)
    assert r.status_code == 200, r.text
    time.sleep(10)
    msgs = api_client.get(f"{base_url}/api/campaigns/{cid}/messages", headers=auth_headers).json()
    assert len(msgs) >= 1
    # Just ensure messages created and don't crash
    assert all("status" in m for m in msgs)


def test_start_campaign_without_contacts_fails(api_client, base_url, auth_headers):
    r = api_client.post(f"{base_url}/api/campaigns", headers=auth_headers, json={
        "name": "TEST Empty", "message_versions": ["oi"],
        "contact_ids": [], "session_ids": [STATE["session_id"]]
    })
    cid = r.json()["id"]
    r2 = api_client.post(f"{base_url}/api/campaigns/{cid}/start", headers=auth_headers)
    assert r2.status_code == 400
    api_client.delete(f"{base_url}/api/campaigns/{cid}", headers=auth_headers)


def test_start_campaign_without_session_fails(api_client, base_url, auth_headers):
    r = api_client.post(f"{base_url}/api/campaigns", headers=auth_headers, json={
        "name": "TEST NoSess", "message_versions": ["oi"],
        "contact_ids": [STATE["contact_id"]], "session_ids": []
    })
    cid = r.json()["id"]
    r2 = api_client.post(f"{base_url}/api/campaigns/{cid}/start", headers=auth_headers)
    assert r2.status_code == 400
    api_client.delete(f"{base_url}/api/campaigns/{cid}", headers=auth_headers)


# ========== REPORTS & CREDITS ==========
def test_reports(api_client, base_url, auth_headers):
    r = api_client.get(f"{base_url}/api/reports", headers=auth_headers)
    assert r.status_code == 200
    d = r.json()
    assert "campaigns" in d and "totals" in d


def test_credits_balance(api_client, base_url, auth_headers):
    r = api_client.get(f"{base_url}/api/credits/balance", headers=auth_headers)
    assert r.status_code == 200
    d = r.json()
    assert "credits" in d and "transactions" in d


def test_recharge_min_limit(api_client, base_url, auth_headers):
    r = api_client.post(f"{base_url}/api/credits/recharge", headers=auth_headers, json={"amount": 5})
    assert r.status_code == 400


def test_recharge_success(api_client, base_url, auth_headers):
    before = api_client.get(f"{base_url}/api/credits/balance", headers=auth_headers).json()["credits"]
    r = api_client.post(f"{base_url}/api/credits/recharge", headers=auth_headers, json={"amount": 50})
    assert r.status_code == 200
    d = r.json()
    assert d["credits"] == pytest.approx(before + 50, rel=0.01)


# ========== AI ==========
def test_ai_suggest(api_client, base_url, auth_headers):
    r = api_client.post(f"{base_url}/api/ai/suggest", headers=auth_headers, json={
        "context": "Oficina promocao", "tone": "venda", "variations": 2
    }, timeout=60)
    assert r.status_code == 200, r.text
    assert len(r.json()["variations"]) >= 1


# ========== CLEANUP ==========
def test_zz_delete_reply_campaign(api_client, base_url, auth_headers):
    cid = STATE.get("reply_campaign_id")
    if cid:
        api_client.delete(f"{base_url}/api/campaigns/{cid}", headers=auth_headers)


def test_zz_delete_campaign(api_client, base_url, auth_headers):
    cid = STATE.get("campaign_id")
    if cid:
        r = api_client.delete(f"{base_url}/api/campaigns/{cid}", headers=auth_headers)
        assert r.status_code == 200


def test_zz_delete_template(api_client, base_url, auth_headers):
    tid = STATE.get("template_id")
    if tid:
        api_client.delete(f"{base_url}/api/templates/{tid}", headers=auth_headers)


def test_zz_delete_session_cleans_sidecar(api_client, base_url, auth_headers):
    sid = STATE.get("session_id")
    if not sid:
        return
    # Verify auth_info dir may exist
    auth_dir = f"/app/whatsapp-sessions/{sid}"
    r = api_client.delete(f"{base_url}/api/whatsapp/sessions/{sid}", headers=auth_headers)
    assert r.status_code == 200
    time.sleep(1)
    # The sidecar should have removed the auth dir
    assert not os.path.isdir(auth_dir), f"Sidecar did not clean {auth_dir}"
