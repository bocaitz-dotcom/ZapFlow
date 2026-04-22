import os, requests, uuid
BASE=os.environ.get("REACT_APP_BACKEND_URL","https://talk-space-128.preview.emergentagent.com").rstrip("/")
SEC="zapflow-webhook-secret"
def login():
    r=requests.post(f"{BASE}/api/auth/login",json={"email":"chatdemo@example.com","password":"demo12345"})
    assert r.status_code==200,r.text
    return r.json()["access_token"]
def test_auth_required():
    for ep in ["/api/chat/conversations","/api/chat/messages?phone=5511999998888"]:
        assert requests.get(f"{BASE}{ep}").status_code==401
    assert requests.post(f"{BASE}/api/chat/send",json={"phone":"55","text":"x"}).status_code==401
    assert requests.post(f"{BASE}/api/chat/read?phone=5511999998888").status_code==401
def test_conversations():
    h={"Authorization":f"Bearer {login()}"}
    r=requests.get(f"{BASE}/api/chat/conversations",headers=h); assert r.status_code==200
    convs=r.json()["conversations"]; assert len(convs)>=2
    phones=[c["phone"] for c in convs]; assert "5511999998888" in phones
def test_webhook_incoming_and_timeline():
    h={"Authorization":f"Bearer {login()}"}
    # need a session_id belonging to this user to persist
    sess=requests.get(f"{BASE}/api/whatsapp/sessions",headers=h).json()
    if not sess:
        # create one
        sid=requests.post(f"{BASE}/api/whatsapp/sessions",headers=h,json={"name":"TEST","daily_limit":50}).json()["id"]
    else:
        sid=sess[0]["id"]
    txt=f"hello-{uuid.uuid4().hex[:6]}"
    r=requests.post(f"{BASE}/api/whatsapp/webhook",
       json={"event":"incoming_message","session_id":sid,"from":"5511999998888@s.whatsapp.net","text":txt},
       headers={"X-Webhook-Secret":SEC})
    assert r.status_code==200
    msgs=requests.get(f"{BASE}/api/chat/messages?phone=5511999998888",headers=h).json()["messages"]
    assert any(m["content"]==txt and m["direction"]=="in" for m in msgs)
def test_webhook_bad_secret():
    assert requests.post(f"{BASE}/api/whatsapp/webhook",json={"event":"incoming_message"}).status_code==401
def test_read_marks_read():
    h={"Authorization":f"Bearer {login()}"}
    r=requests.post(f"{BASE}/api/chat/read?phone=5511999998888",headers=h)
    assert r.status_code==200 and "updated" in r.json()
def test_send_empty_400():
    h={"Authorization":f"Bearer {login()}"}
    r=requests.post(f"{BASE}/api/chat/send",headers=h,json={"phone":"5511999998888","text":"  "})
    assert r.status_code==400
def test_send_no_session_persists():
    h={"Authorization":f"Bearer {login()}"}
    txt=f"out-{uuid.uuid4().hex[:6]}"
    r=requests.post(f"{BASE}/api/chat/send",headers=h,json={"phone":"5511999998888","text":txt})
    assert r.status_code==200
    d=r.json(); assert d["ok"]==False and d["status"]=="falha"
    msgs=requests.get(f"{BASE}/api/chat/messages?phone=5511999998888",headers=h).json()["messages"]
    assert any(m["content"]==txt and m["direction"]=="out" for m in msgs)
