import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { apiClient } from "../lib/api";
import { useWebSocket } from "../lib/ws";
import { PageHeader, Empty } from "../components/Primitives";
import { MessageCircle, Send, Search, Loader2, Check, CheckCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
    const mid = rest.length === 9 ? `${rest.slice(0, 5)}-${rest.slice(5)}` : `${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `+55 (${ddd}) ${mid}`;
  }
  return `+${s}`;
}

function StatusIcon({ status }) {
  if (status === "falha") return <AlertCircle size={12} className="text-red-400" />;
  if (status === "lido" || status === "respondido") return <CheckCheck size={12} className="text-sky-400" />;
  if (status === "entregue") return <CheckCheck size={12} className="text-neutral-400" />;
  return <Check size={12} className="text-neutral-400" />;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [search, setSearch] = useState("");
  const [activePhone, setActivePhone] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const r = await apiClient.get("/chat/conversations");
      setConversations(r.data.conversations || []);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  const loadMessages = useCallback(async (phone) => {
    if (!phone) return;
    setLoadingMsgs(true);
    try {
      const r = await apiClient.get("/chat/messages", { params: { phone } });
      setMessages(r.data.messages || []);
      apiClient.post("/chat/read", null, { params: { phone } }).catch(() => {});
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (activePhone) loadMessages(activePhone);
  }, [activePhone, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Real-time updates: incoming & outgoing chat events
  useWebSocket(useCallback((event) => {
    if (event?.type === "chat_incoming" || event?.type === "chat_outgoing") {
      const m = event.message;
      if (!m) return;
      // Refresh side list
      loadConversations();
      // If user is viewing this conversation, append message
      if (m.phone === activePhone) {
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev;
          return [...prev, {
            id: m.id,
            direction: m.direction,
            content: m.content,
            created_at: m.created_at,
            status: m.status || "enviado",
            source: "chat",
          }];
        });
        if (m.direction === "in") {
          apiClient.post("/chat/read", null, { params: { phone: m.phone } }).catch(() => {});
        }
      }
    } else if (event?.type === "message_update") {
      // A campaign message status changed; refresh conversation list lazily
      loadConversations();
    }
  }, [activePhone, loadConversations]));

  const filteredConvs = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.trim().toLowerCase();
    return conversations.filter((c) =>
      (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q)
    );
  }, [conversations, search]);

  const activeConv = conversations.find((c) => c.phone === activePhone);

  const send = async () => {
    const text = draft.trim();
    if (!text || !activePhone || sending) return;
    setSending(true);
    try {
      const r = await apiClient.post("/chat/send", {
        phone: activePhone,
        text,
        session_id: activeConv?.session_id || null,
      });
      setDraft("");
      const m = r.data.message;
      setMessages((prev) => [...prev, {
        id: m.id, direction: "out", content: m.content,
        created_at: m.created_at, status: m.status, source: "chat",
      }]);
      if (!r.data.ok) {
        toast.error(r.data.error || "Falha ao enviar, mensagem salva localmente");
      }
      loadConversations();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Falha no envio");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-[1400px] mx-auto" data-testid="chat-page">
      <PageHeader
        eyebrow="Inbox"
        title="Chat"
        subtitle="Converse em tempo real com os contatos que receberam seus disparos. Todas as mensagens enviadas e respondidas aparecem aqui."
      />

      <div
        className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 bg-neutral-900/40 border border-neutral-800 rounded-lg overflow-hidden"
        style={{ height: "calc(100vh - 260px)", minHeight: 520 }}
      >
        {/* Conversations list */}
        <aside
          className={`border-r border-neutral-800 bg-neutral-950/60 flex flex-col min-h-0 ${
            activePhone ? "hidden lg:flex" : "flex"
          }`}
          data-testid="chat-conversations"
        >
          <div className="p-3 border-b border-neutral-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contato ou telefone…"
                data-testid="chat-search-input"
                className="w-full bg-neutral-900/70 border border-neutral-800 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#25D366]/50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-10 text-neutral-500">
                <Loader2 size={16} className="animate-spin mr-2" /> Carregando…
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500">
                Nenhuma conversa ainda. Assim que você enviar uma campanha ou receber respostas, elas aparecem aqui.
              </div>
            ) : (
              filteredConvs.map((c) => {
                const active = c.phone === activePhone;
                return (
                  <button
                    key={c.phone}
                    onClick={() => setActivePhone(c.phone)}
                    data-testid={`chat-conv-${c.phone}`}
                    className={`w-full text-left px-4 py-3 border-b border-neutral-900 transition-colors flex items-start gap-3 ${
                      active ? "bg-neutral-900" : "hover:bg-neutral-900/60"
                    }`}
                  >
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#25D366]/30 to-neutral-800 flex items-center justify-center text-sm font-bold shrink-0">
                      {(c.name || c.phone)?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-semibold">
                          {c.name || fmtPhone(c.phone)}
                        </div>
                        <div className="text-[10px] text-neutral-500 font-mono shrink-0">
                          {fmtTime(c.last_at)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="truncate text-xs text-neutral-400">
                          {c.last_direction === "out" ? "Você: " : ""}
                          {c.last_message || "(sem texto)"}
                        </div>
                        {c.unread > 0 && (
                          <span
                            data-testid={`chat-unread-${c.phone}`}
                            className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#25D366] text-neutral-950 text-[10px] font-bold flex items-center justify-center"
                          >
                            {c.unread > 99 ? "99+" : c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Chat window */}
        <section
          className={`flex flex-col min-h-0 ${activePhone ? "flex" : "hidden lg:flex"}`}
          data-testid="chat-window"
        >
          {!activePhone ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <Empty
                title="Selecione uma conversa"
                subtitle="Escolha um contato ao lado para ver o histórico e responder."
              />
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-950/60 flex items-center gap-3">
                <button
                  onClick={() => setActivePhone(null)}
                  className="lg:hidden text-neutral-400 hover:text-white text-sm"
                  data-testid="chat-back-button"
                >
                  ← Voltar
                </button>
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#25D366]/30 to-neutral-800 flex items-center justify-center text-sm font-bold">
                  {(activeConv?.name || activePhone)?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate" data-testid="chat-header-name">
                    {activeConv?.name || fmtPhone(activePhone)}
                  </div>
                  <div className="text-[11px] text-neutral-500 font-mono">
                    {fmtPhone(activePhone)}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div
                className="flex-1 overflow-y-auto px-5 py-4 space-y-2"
                style={{
                  background:
                    "radial-gradient(1200px 600px at 80% 10%, rgba(37,211,102,0.04), transparent 60%), #0a0a0a",
                }}
                data-testid="chat-messages-list"
              >
                {loadingMsgs ? (
                  <div className="flex items-center justify-center py-10 text-neutral-500">
                    <Loader2 size={16} className="animate-spin mr-2" /> Carregando mensagens…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-xs text-neutral-500 py-10">
                    Nenhuma mensagem trocada ainda.
                  </div>
                ) : (
                  messages.map((m) => {
                    const isOut = m.direction === "out";
                    return (
                      <div
                        key={m.id}
                        data-testid={`chat-msg-${m.id}`}
                        className={`flex ${isOut ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                            isOut
                              ? "bg-[#25D366]/90 text-neutral-950 rounded-br-sm"
                              : "bg-neutral-900 text-neutral-50 border border-neutral-800 rounded-bl-sm"
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-words leading-relaxed">
                            {m.content}
                          </div>
                          <div className={`mt-1 flex items-center gap-1 text-[10px] font-mono ${
                            isOut ? "text-neutral-900/70 justify-end" : "text-neutral-500"
                          }`}>
                            <span>{fmtTime(m.created_at)}</span>
                            {isOut && <StatusIcon status={m.status} />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-neutral-800 bg-neutral-950/70 p-3 flex items-end gap-2">
                <textarea
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Digite uma mensagem…  (Enter para enviar, Shift+Enter quebra linha)"
                  data-testid="chat-input"
                  className="flex-1 resize-none bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#25D366]/50 max-h-32"
                />
                <button
                  onClick={send}
                  disabled={!draft.trim() || sending}
                  data-testid="chat-send-button"
                  className="h-10 px-4 rounded-md bg-[#25D366] text-neutral-950 font-bold text-sm flex items-center gap-2 hover:bg-[#1fbe58] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Enviar
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="mt-4 text-[11px] text-neutral-500 flex items-center gap-2">
        <MessageCircle size={12} />
        Dica: abra uma instância conectada em <span className="text-neutral-300">Conexões WhatsApp</span> para que suas respostas sejam entregues de verdade.
      </div>
    </div>
  );
}
