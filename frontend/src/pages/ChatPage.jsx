import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { apiClient } from "../lib/api";
import { useWebSocket } from "../lib/ws";
import { PageHeader, Empty } from "../components/Primitives";
import { MessageCircle, Send, Search, Loader2, Check, CheckCheck, AlertCircle, Trash2, X, Download, Play, Pause, Volume2 } from "lucide-react";
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

function normPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (!d) return d;
  const n = d.startsWith("55") ? d : "55" + d;
  return n.length === 12 && n[4] === "9" ? n.slice(0, 4) + "9" + n.slice(4) : n;
}

function isOrphanLid(phone) {
  const s = String(phone || "").replace(/\D/g, "");
  if (!s) return false;
  if (s.startsWith("55") && s.length >= 12 && s.length <= 13) return false;
  return s.length >= 13;
}

function StatusIcon({ status }) {
  if (status === "falha") return <AlertCircle size={12} className="text-red-400" />;
  if (status === "lido" || status === "PLAYED" || status === "respondido") return <CheckCheck size={12} className="text-sky-400" />;
  if (status === "entregue") return <CheckCheck size={12} className="text-neutral-400" />;
  return <Check size={12} className="text-neutral-400" />;
}

function normalizeStatus(status) {
  switch ((status || "").toUpperCase()) {
    case "RECEBIDO":
    case "ENTREGUE":
      return "entregue";
    case "LIDO":
    case "READ":
    case "PLAYED":
      return "lido";
    case "FALHA":
      return "falha";
    case "RESPONDIDO":
      return "respondido";
    default:
      return "enviado";
  }
}

// ============== MODAL FULLSCREEN PARA IMAGEM ==============
function ImageModal({ src, onClose }) {
  useEffect(() => {
    const handleEsc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="relative w-full h-full flex items-center justify-center">
        <img src={src} alt="Preview" className="max-w-full max-h-full object-contain" />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
        >
          <X size={24} className="text-white" />
        </button>
      </div>
    </div>
  );
}

// ============== MODAL FULLSCREEN PARA VÍDEO ==============
function VideoModal({ src, onClose }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const handleEsc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="relative w-full h-full flex items-center justify-center">
        <video
          ref={videoRef}
          controls
          autoPlay
          className="max-w-full max-h-full object-contain"
        >
          <source src={src} type="video/mp4" />
        </video>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
        >
          <X size={24} className="text-white" />
        </button>
      </div>
    </div>
  );
}

// ============== PLAYER ÁUDIO MODERNO ==============
function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateDuration = () => setDuration(audio.duration);
    const updateTime = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleProgressClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    if (audioRef.current) {
      audioRef.current.currentTime = percent * duration;
    }
  };

  const formatTime = (time) => {
    if (!time || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-3 bg-gradient-to-r from-[#25D366]/20 to-[#25D366]/10 rounded-full px-4 py-3 max-w-xs border border-[#25D366]/30">
      <audio ref={audioRef} src={src} />
      
      <button
        onClick={togglePlay}
        className="flex-shrink-0 w-10 h-10 bg-[#25D366] rounded-full flex items-center justify-center hover:bg-[#1fbe58] transition-all hover:scale-105 shadow-lg"
      >
        {isPlaying ? (
          <Pause size={18} className="text-white fill-white" />
        ) : (
          <Play size={18} className="text-white fill-white ml-0.5" />
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1">
        <div
          onClick={handleProgressClick}
          className="w-full h-1 bg-neutral-700 rounded-full cursor-pointer hover:h-1.5 transition-all"
        >
          <div
            className="h-full bg-[#25D366] rounded-full transition-all"
            style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <Volume2 size={16} className="text-neutral-400 flex-shrink-0" />
    </div>
  );
}

// ============== RENDERIZADOR DE MÍDIA ==============
function MediaRenderer({ content, mediaType, onImageClick, onVideoClick }) {
  if (!content) return null;

  const isUrl = content.startsWith("http://") || content.startsWith("https://");
  if (!isUrl) return null;

  // 🎵 ÁUDIO
  if (mediaType === "audio") {
    return <AudioPlayer src={content} />;
  }

  // 📸 IMAGEM
  if (mediaType === "image") {
    return (
      <div
        onClick={() => onImageClick(content)}
        className="cursor-pointer group relative max-w-xs rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all"
      >
        <img
          src={content}
          alt="Imagem"
          className="imgw max-h-64 w-full object-cover rounded-2xl group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 13H7" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  // 🎬 VÍDEO
  if (mediaType === "video") {
    return (
      <div
        onClick={() => onVideoClick(content)}
        className="cursor-pointer group relative w-full max-w-md rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all bg-black"
      >
        <video
          className="w-full h-auto max-h-96 object-cover rounded-2xl"
          poster={content}
        >
          <source src={content} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300 flex items-center justify-center">
          <div className="w-16 h-16 bg-[#25D366] rounded-full flex items-center justify-center group-hover:scale-110 transition-transform opacity-80 group-hover:opacity-100">
            <Play size={28} className="text-white fill-white ml-1" />
          </div>
        </div>
      </div>
    );
  }

  // 📄 ARQUIVO/DOCUMENTO
  if (mediaType === "document" || mediaType === "file") {
    const fileName = content.split("/").pop() || "Arquivo";
    const fileExtension = fileName.split(".").pop()?.toUpperCase() || "DOC";

    return (
      <a
        href={content}
        download={fileName}
        className="flex items-center gap-3 p-4 bg-gradient-to-r from-neutral-800 to-neutral-900 rounded-2xl hover:from-neutral-700 hover:to-neutral-800 transition-all max-w-xs group border border-neutral-700 hover:border-[#25D366]/50 shadow-lg hover:shadow-xl"
      >
        <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-[#25D366] to-[#1fbe58] rounded-xl flex items-center justify-center font-bold text-xs text-neutral-950 group-hover:scale-110 transition-transform">
          {fileExtension}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-neutral-100 truncate group-hover:text-[#25D366] transition-colors">{fileName}</div>
          <div className="text-xs text-neutral-400">Documento</div>
        </div>
        <Download size={20} className="flex-shrink-0 text-neutral-400 group-hover:text-[#25D366] transition-colors" />
      </a>
    );
  }

  return null;
}

// ============== COMPONENTE PRINCIPAL ==============
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
  const [imageModalSrc, setImageModalSrc] = useState(null);
  const [videoModalSrc, setVideoModalSrc] = useState(null);
  const messagesContainerRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const r = await apiClient.get("/chat/conversations");
      setConversations(r.data.conversations || []);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const target = el.scrollHeight;
    const start = el.scrollTop;
    const change = target - start;
    const duration = 300;
    let startTime = null;

    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = elapsed / duration;
      const eased = progress < 0.5 
        ? 2 * progress * progress 
        : -1 + (4 - 2 * progress) * progress;
      
      el.scrollTop = start + change * Math.min(eased, 1);
      
      if (elapsed < duration) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, []);

  const loadMessages = useCallback(async (phone) => {
    if (!phone) return;

    setLoadingMsgs(true);

    try {
      const r = await apiClient.get("/chat/messages", {
        params: { phone },
      });

      const serverMessages = r.data.messages || [];

      setMessages((prev) => {
        const map = new Map();

        prev.forEach((m) => {
          const key = m.message_id || m.id;
          if (m.source !== "server") {
            map.set(key, m);
          }
        });

        serverMessages.forEach((m) => {
          const key = m.message_id || m.id;
          map.set(key, {
            id: m.id,
            message_id: m.message_id,
            direction: m.direction,
            content: m.content,
            media: m.media,
            media_type: m.media_type,
            created_at: m.created_at,
            status: m.status || "enviado",
            source: "server",
          });
        });

        return Array.from(map.values()).sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at)
        );
      });

      scrollToBottom();

      await apiClient.post("/chat/read", null, {
        params: { phone },
      }).catch(() => {});
    } finally {
      setLoadingMsgs(false);
    }
  }, [scrollToBottom]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!activePhone) return;
    setMessages([]);
    (async () => {
      await loadMessages(activePhone);
    })();
  }, [activePhone, loadMessages]);

  useEffect(() => {
    if (!messages.length || loadingMsgs) return;
    scrollToBottom();
  }, [messages, loadingMsgs, scrollToBottom]);

  useWebSocket(useCallback((event) => {
    if (event?.type === "chat_console") {

      console.log(event);

      const update = event.message;
      if (update?.status) {
        setMessages((prev) =>
          prev.map((m) => {
            const match = m.message_id === update.message_id || m.id === update.message_id;
            if (!match) return m;
            return { ...m, status: normalizeStatus(update.status) };
          })
        );
      }

    } else if (event?.type === "chat_incoming" || event?.type === "chat_outgoing") {
      const m = event.message;
      if (!m) return;

      loadConversations();

      if (normPhone(m.phone) === normPhone(activePhone)) {
        setMessages((prev) => {
          const exists = prev.some((x) => x.message_id === m.message_id);
          if (exists) return prev;
          const content = m.media || m.content;
          if (!content) return prev;
          return [
            ...prev,
            {
              id: m.id,
              message_id: m.message_id,
              direction: m.direction,
              content,
              media: m.media,
              media_type: m.media_type,
              created_at: m.created_at,
              status: m.status || "enviado",
              source: "ws",
            },
          ];
        });
        if (m.direction === "in") {
          apiClient.post("/chat/read", null, { params: { phone: m.phone } }).catch(() => {});
        }
      }
    } else if (event?.type === "message_update") {
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
      if (m?.phone && m.phone !== activePhone) {
        setActivePhone(m.phone);
      } else {
        setMessages((prev) => [...prev, {
          id: m.id,
          message_id: m.message_id,
          direction: "out",
          content: m.content,
          media: m.media,
          media_type: m.media_type,
          created_at: m.created_at,
          status: m.status,
          source: "chat",
        }]);
      }
      if (!r.data.ok) {
        toast.error(r.data.error || "Falha ao enviar");
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
      toast.success("Conversa associada");
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
        subtitle="Converse em tempo real com os contatos que receberam seus disparos."
      />

      <div
        className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 bg-white dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden"
        style={{ height: "calc(100vh - 260px)", minHeight: 520 }}
      >
        {/* Conversations List */}
        <aside
          className={`border-r border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-950/60 flex flex-col min-h-0 ${
            activePhone ? "hidden lg:flex" : "flex"
          }`}
          data-testid="chat-conversations"
        >
          <div className="p-3 border-b border-neutral-200 dark:border-neutral-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contato…"
                className="w-full bg-neutral-100 dark:bg-neutral-900/70 border border-neutral-200 dark:border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#25D366]/50"
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
                Nenhuma conversa ainda.
              </div>
            ) : (
              filteredConvs.map((c) => {
                const active = c.phone === activePhone;
                return (
                  <div
                    key={c.phone}
                    onClick={() => setActivePhone(c.phone)}
                    className={`w-full text-left px-4 py-3 border-b border-neutral-100 dark:border-neutral-900 transition-all cursor-pointer flex items-start gap-3 ${
                      active ? "bg-neutral-100 dark:bg-neutral-900 border-l-2 border-l-[#25D366]" : "hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                    }`}
                  >
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#25D366]/30 to-neutral-800 flex items-center justify-center text-sm font-bold shrink-0">
                      {(c.name || c.phone)?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {c.name || fmtPhone(c.phone)}
                        </div>
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-500 shrink-0 flex items-center gap-2">
                          <span>{fmtTime(c.last_at)}</span>
                          <button
                            onClick={(e) => deleteConv(c.phone, e)}
                            className="text-neutral-500 hover:text-red-400 transition-colors p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {c.last_direction === "out" ? "Você: " : ""}
                          {c.last_message || "(sem texto)"}
                        </div>
                        {c.unread > 0 && (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#25D366] text-neutral-950 text-[10px] font-bold flex items-center justify-center">
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

        {/* Chat Window */}
        <section
          className={`flex flex-col min-h-0 ${activePhone ? "flex" : "hidden lg:flex"}`}
          data-testid="chat-window"
        >
          {!activePhone ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <Empty
                title="Selecione uma conversa"
                subtitle="Escolha um contato ao lado para começar."
              />
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-950/60 flex items-center gap-3">
                <button
                  onClick={() => setActivePhone(null)}
                  className="lg:hidden text-neutral-400 hover:text-white text-sm"
                >
                  ← Voltar
                </button>
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#25D366]/30 to-neutral-800 flex items-center justify-center text-sm font-bold">
                  {(activeConv?.name || activePhone)?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate text-neutral-900 dark:text-neutral-100">
                    {activeConv?.name || fmtPhone(activePhone)}
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-500">
                    {fmtPhone(activePhone)}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteConv(activePhone, e)}
                  className="h-9 px-3 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 border border-neutral-200 dark:border-neutral-800 flex items-center gap-2 text-xs font-semibold transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Warning Banner */}
              {isOrphanLid(activePhone) && (
                <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-200 text-xs flex items-center gap-3">
                  <AlertCircle size={16} className="shrink-0 text-amber-400" />
                  <div className="flex-1">Conversa temporária. Associe ao contato correto.</div>
                  <button
                    onClick={openAssociate}
                    className="shrink-0 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs rounded-lg transition-colors"
                  >
                    Associar
                  </button>
                </div>
              )}

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
                style={{
                  background: "radial-gradient(1200px 600px at 80% 10%, rgba(37,211,102,0.04), transparent 60%), var(--zf-s1)",
                }}
              >
                {loadingMsgs ? (
                  <div className="flex items-center justify-center py-10 text-neutral-500">
                    <Loader2 size={16} className="animate-spin mr-2" /> Carregando…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-xs text-neutral-500 py-10">
                    Nenhuma mensagem ainda.
                  </div>
                ) : (
                  messages.map((m) => {
                    const isOut = m.direction === "out";
                    return (
                      <div
                        key={m.message_id || m.id}
                        className={`flex ${isOut ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-lg rounded-2xl px-4 py-3 text-sm shadow-lg ${
                            isOut
                              ? "bg-gradient-to-r from-[#25D366] whatsapp-bubble text-neutral-950 rounded-br-none"
                              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 border border-neutral-200 dark:border-neutral-700 rounded-bl-none"
                          }`}
                        >
                          {/* Mídia */}
                          {m.media && m.media_type && (
                            <div className="mb-3">
                              <MediaRenderer
                                content={m.media}
                                mediaType={m.media_type}
                                onImageClick={setImageModalSrc}
                                onVideoClick={setVideoModalSrc}
                              />
                            </div>
                          )}

                          {/* Texto */}
                          {m.content && !m.content.startsWith("http") && (
                            <div className="whitespace-pre-wrap break-words leading-relaxed">
                              {m.content}
                            </div>
                          )}

                          {/* Timestamp */}
                          <div className={`horacreatew mt-2 flex items-center gap-1 text-[11px] ${
                            isOut ? "text-neutral-950/70" : "text-neutral-400"
                          }`}>
                            <span>{fmtTime(m.created_at)}</span>
                            {isOut && <StatusIcon status={m.status} />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-950/70 p-4 flex items-end gap-3">
                <textarea
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Digite uma mensagem…"
                  className="flex-1 resize-none bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#25D366]/50 max-h-32 transition-all"
                />
                <button
                  onClick={send}
                  disabled={!draft.trim() || sending}
                  className="h-11 px-5 rounded-xl bg-[#25D366] text-neutral-950 font-bold text-sm flex items-center gap-2 hover:bg-[#1fbe58] disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-105 shadow-lg"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Modals */}
      {imageModalSrc && <ImageModal src={imageModalSrc} onClose={() => setImageModalSrc(null)} />}
      {videoModalSrc && <VideoModal src={videoModalSrc} onClose={() => setVideoModalSrc(null)} />}

      {/* Associate Modal */}
      {assocOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setAssocOpen(false)}
        >
          <div
            className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">Associar a um contato</h2>
              <p className="text-xs text-neutral-500 mt-1">Escolha o contato para unificar.</p>
            </div>
            <div className="p-4">
              <input
                autoFocus
                value={assocQuery}
                onChange={(e) => setAssocQuery(e.target.value)}
                placeholder="Buscar contato…"
                className="w-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#25D366]/50"
              />
              <div className="mt-3 max-h-72 overflow-y-auto space-y-1">
                {filteredContacts.length === 0 ? (
                  <div className="text-center text-xs text-neutral-500 py-6">
                    Nenhum contato encontrado.
                  </div>
                ) : (
                  filteredContacts.slice(0, 50).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => associateTo(c.phone)}
                      className="w-full text-left px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg flex items-center gap-3 transition-colors"
                    >
                      <div className="h-8 w-8 rounded-full bg-[#25D366]/30 flex items-center justify-center text-xs font-bold">
                        {c.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{c.name}</div>
                        <div className="text-[11px] text-neutral-500">{fmtPhone(c.phone)}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end gap-2">
              <button
                onClick={() => setAssocOpen(false)}
                className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
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
