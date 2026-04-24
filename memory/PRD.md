# ZapFlow — PRD

## Original Request
> "Quero que você crie uma área chat para eu poder falar e ver as mensagens enviadas."
> User uploaded an existing WhatsApp marketing/campaign project (`whatsapp--main.zip` = "ZapFlow") and asked to ADD a Chat area on top of it, to view messages already sent and chat with users who replied.

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`) + MongoDB (`chat_messages` collection)
- **WhatsApp engine**: Node.js Baileys sidecar at 127.0.0.1:3001 (existing, infra-level — not started by us)
- **Frontend**: React 19 + Tailwind + Shadcn, new page `ChatPage.jsx`
- **Realtime**: existing WebSocket `/api/ws` reused for `chat_incoming` / `chat_outgoing` events

## Implemented (2026-02)
### Backend
- `models.py`: `ChatMessage`, `ChatSendRequest`
- `server.py` webhook `incoming_message`: persists inbound texts in `chat_messages` + emits WS
- New endpoints:
  - `GET /api/chat/conversations` — grouped list per phone with last message + unread count (merges `chat_messages` + campaign `messages`)
  - `GET /api/chat/messages?phone=...` — merged timeline (campaign outgoing + manual two-way)
  - `POST /api/chat/send` — sends via Baileys sidecar when a session is connected; always stores the typed message so the UI is consistent (marks as `falha` when not connected)
  - `POST /api/chat/read?phone=...` — marks inbound unread as read

### Frontend
- `pages/ChatPage.jsx`: two-pane layout (conversations sidebar + chat window + composer), unread badges, real-time WS updates, mobile-friendly (sidebar collapses)
- `App.js`: route `/app/chat`
- `Layout.jsx`: sidebar entry "Chat" with `MessageCircle` icon

## Core Requirements — Status
- [x] See messages already sent (campaign outgoing appear in chat timeline)
- [x] See replies from recipients (inbound stored + unread badge)
- [x] Reply from the chat UI (text messages)
- [x] Real-time updates via WebSocket
- [x] No new authentication flow added (uses existing JWT)

## Backlog / Next Actions
- P1: Support media messages (images/audio) in chat composer
- P1: Typing indicator / presence via Baileys `presence.update`
- P2: Quick-reply templates from `templates` collection inside chat composer
- P2: Emoji picker
- P2: Start a Node Baileys supervisor entry so sending actually reaches WhatsApp in this pod (currently sidecar service is not auto-started)
