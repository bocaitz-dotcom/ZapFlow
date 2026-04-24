import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { apiClient } from "../lib/api";
import { useWebSocket } from "../lib/ws";
import { PageHeader, Empty } from "../components/Primitives";
import { MessageCircle, Send, Search, Loader2, Check, CheckCheck, AlertCircle, Trash2 } from "lucide-react";
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

// LID conversations look like bare 14-17 digit strings that don't start with
// a real country code (BR=55). They can't be replied to until the user
// associates them with a real contact.
function isOrphanLid(phone) {
  const s = String(phone || "").replace(/\D/g, "");
  if (!s) return false;
  if (s.startsWith("55") && s.length >= 12 && s.length <= 13) return false;
  return s.length >= 13; // heuristic
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
  const [contacts, setContacts] = useState([]);
  const [assocOpen, setAssocOpen] = useState(false);
  const [assocQuery, setAssocQuery] = useState("");
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
      // If backend resolved our LID to the real phone, jump to that thread
      // so the user sees the message in the unified conversation.
      if (m?.phone && m.phone !== activePhone) {
        setActivePhone(m.phone);
      } else {
        setMessages((prev) => [...prev, {
          id: m.id, direction: "out", content: m.content,
          created_at: m.created_at, status: m.status, source: "chat",
        }]);
      }
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

  const deleteConv = async (phone, e) => {
    e?.stopPropagation();
    if (!window.confirm(`Apagar a conversa com ${phone}?`)) return;
    try {
      await apiClient.delete("/chat/conversation", { params: { phone } });
      toast.success("Conversa apagada");
      if (activePhone === phone) setActivePhone(null);
      loadConversations();
    } catch {
      toast.error("Falha ao apagar");
    }
  };

  const openAssociate = async () => {
    setAssocOpen(true);
    setAssocQuery("");
    try {
      const r = await apiClient.get("/contacts");
      setContacts(r.data || []);
    } catch {
      setContacts([]);
    }
  };

  const associateTo = async (toPhone) => {
    if (!activePhone) return;
    try {
      await apiClient.post("/chat/merge", null, {
        params: { from_phone: activePhone, to_phone: toPhone },
      });
      toast.success("Conversa associada ao contato");
      setAssocOpen(false);
      setActivePhone(toPhone);
      loadConversations();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Falha ao associar");
    }
  };

  const filteredContacts = useMemo(() => {
    if (!assocQuery.trim()) return contacts;
    const q = assocQuery.trim().toLowerCase();
    return contacts.filter((c) =>
      (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q)
    );
  }, [contacts, assocQuery]);

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
                  <div
                    key={c.phone}
                    onClick={() => setActivePhone(c.phone)}
                    onKeyDown={(e) => { if (e.key === "Enter") setActivePhone(c.phone); }}
                    role="button"
                    tabIndex={0}
                    data-testid={`chat-conv-${c.phone}`}
                    className={`w-full text-left px-4 py-3 border-b border-neutral-900 transition-colors flex items-start gap-3 cursor-pointer ${
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
                        <div className="text-[10px] text-neutral-500 font-mono shrink-0 flex items-center gap-2">
                          <span>{fmtTime(c.last_at)}</span>
                          <button
                            type="button"
                            onClick={(e) => deleteConv(c.phone, e)}
                            data-testid={`chat-delete-${c.phone}`}
                            title="Apagar conversa"
                            className="text-neutral-500 hover:text-red-400 transition-colors p-1 -m-1 rounded hover:bg-red-500/10"
                          >
                            <Trash2 size={13} />
                          </button>
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
                  </div>
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
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate" data-testid="chat-header-name">
                    {activeConv?.name || fmtPhone(activePhone)}
                  </div>
                  <div className="text-[11px] text-neutral-500 font-mono">
                    {fmtPhone(activePhone)}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteConv(activePhone, e)}
                  data-testid="chat-header-delete"
                  title="Apagar conversa"
                  className="h-9 px-3 rounded-md text-neutral-400 hover:text-red-400 hover:bg-red-500/10 border border-neutral-800 hover:border-red-500/30 flex items-center gap-2 text-xs font-semibold transition-colors"
                >
                  <Trash2 size={14} />
                  <span className="hidden sm:inline">Apagar</span>
                </button>
              </div>

              {/* Orphan-LID warning banner */}
              {isOrphanLid(activePhone) && (
                <div
                  data-testid="chat-orphan-warning"
                  className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
                >
                  <AlertCircle size={16} className="shrink-0 text-amber-400" />
                  <div className="flex-1">
                    Esta conversa foi criada com um identificador temporário do WhatsApp (sem número real).
                    Envios diretos daqui <strong>não chegam</strong>. Associe ao contato correto
                    para unificar o histórico, ou apague e aguarde a próxima resposta.
                  </div>
                  <button
                    type="button"
                    onClick={openAssociate}
                    data-testid="chat-associate-button"
                    className="shrink-0 h-8 px-3 rounded-md bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition-colors"
                  >
                    Associar a um contato
                  </button>
                </div>
              )}

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

      {/* Associate orphan → contact modal */}
      {assocOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setAssocOpen(false)}
          data-testid="chat-associate-modal"
        >
          <div
            className="bg-neutral-950 border border-neutral-800 rounded-lg w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-neutral-800">
              <div className="font-display text-lg font-bold">Associar a um contato</div>
              <div className="text-xs text-neutral-500 mt-1">
                Escolha o contato real para onde esta conversa deve ser unificada.
              </div>
            </div>
            <div className="p-4">
              <input
                autoFocus
                value={assocQuery}
                onChange={(e) => setAssocQuery(e.target.value)}
                placeholder="Buscar contato por nome ou telefone…"
                data-testid="chat-associate-search"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#25D366]/50"
              />
              <div className="mt-3 max-h-72 overflow-y-auto divide-y divide-neutral-900">
                {filteredContacts.length === 0 ? (
                  <div className="text-center text-xs text-neutral-500 py-6">
                    Nenhum contato encontrado. Cadastre em <em>Contatos</em> primeiro.
                  </div>
                ) : (
                  filteredContacts.slice(0, 50).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => associateTo(c.phone)}
                      data-testid={`chat-associate-contact-${c.id}`}
                      className="w-full text-left px-3 py-2 hover:bg-neutral-900 rounded-md flex items-center gap-3 transition-colors"
                    >
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#25D366]/30 to-neutral-800 flex items-center justify-center text-xs font-bold">
                        {c.name?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{c.name}</div>
                        <div className="text-[11px] text-neutral-500 font-mono">{fmtPhone(c.phone)}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => setAssocOpen(false)}
                className="text-sm text-neutral-400 hover:text-white px-3 py-1.5"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
