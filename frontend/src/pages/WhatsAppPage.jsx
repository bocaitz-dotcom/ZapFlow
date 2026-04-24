import React, { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { PageHeader, Empty, Pill } from "../components/Primitives";
import { Plus, Smartphone, Trash2, Loader2, X, Wifi, WifiOff, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { useWebSocket } from "../lib/ws";

const STATUS_META = {
  conectado: { label: "conectado", variant: "green", dot: "bg-[#25D366]", ring: "ring-[#25D366]/40 animate-pulse-green" },
  aguardando_qr: { label: "aguardando qr", variant: "amber", dot: "bg-amber-400", ring: "" },
  conectando: { label: "conectando", variant: "amber", dot: "bg-amber-400", ring: "" },
  desconectado: { label: "desconectado", variant: "red", dot: "bg-red-500", ring: "" },
};

export default function WhatsAppPage() {
  const [sessions, setSessions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState(500);
  const [modalSession, setModalSession] = useState(null); // open QR modal
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const r = await apiClient.get("/whatsapp/sessions");
    setSessions(r.data);
  };

  useEffect(() => { load(); }, []);

  // Live updates via WS
  useWebSocket((msg) => {
    if (!msg?.type) return;
    if (["session_qr", "session_status"].includes(msg.type)) {
      setSessions((prev) => prev.map((s) => {
        if (s.id !== msg.session_id) return s;
        if (msg.type === "session_qr") {
          return { ...s, status: "aguardando_qr", qr_code: msg.qr };
        }
        if (msg.type === "session_status") {
          return { ...s, status: msg.status, phone_number: msg.phone_number ?? s.phone_number, qr_code: msg.status === "conectado" ? null : s.qr_code };
        }
        return s;
      }));
      if (msg.type === "session_status" && msg.status === "conectado") {
        toast.success(`Conectado: ${msg.phone_number || "WhatsApp ativo"}`);
        setModalSession(null);
      }
    }
  });

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await apiClient.post("/whatsapp/sessions", { name, daily_limit: +limit });
      toast.success("Instância criada");
      setName(""); setShowForm(false);
      await load();
      connect(r.data);
    } catch (err) { toast.error(err?.response?.data?.detail || "Falha"); }
    finally { setCreating(false); }
  };

  const connect = async (s) => {
    setModalSession(s);
    try {
      const r = await apiClient.post(`/whatsapp/sessions/${s.id}/connect`);
      setSessions((prev) => prev.map((x) => x.id === s.id ? { ...x, status: r.data.status, qr_code: r.data.qr_code } : x));
      setModalSession((prev) => prev ? { ...prev, status: r.data.status, qr_code: r.data.qr_code } : prev);
      toast.info("Abra WhatsApp → Aparelhos conectados → Conectar aparelho");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Falha ao iniciar");
      setModalSession(null);
    }
  };

  const disconnect = async (id) => {
    await apiClient.post(`/whatsapp/sessions/${id}/disconnect`);
    toast.success("Desconectado");
    load();
  };

  const del = async (id) => {
    if (!window.confirm("Excluir sessão? Isso apagará a autenticação permanentemente.")) return;
    await apiClient.delete(`/whatsapp/sessions/${id}`);
    toast.success("Excluída");
    load();
  };

  // Sync modal with live session state
  useEffect(() => {
    if (modalSession) {
      const updated = sessions.find((s) => s.id === modalSession.id);
      if (updated) setModalSession(updated);
    }
  }, [sessions, modalSession?.id]);

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-[1200px] mx-auto">
        <PageHeader
          eyebrow="Conexões"
          title="Instâncias WhatsApp"
          subtitle="Conecte números reais via Baileys. Sessões persistidas em disco com reconexão automática."
        >
          <button
            onClick={() => setShowForm((s) => !s)}
            data-testid="add-session-button"
            className="bg-white text-neutral-950 hover:bg-neutral-200 px-4 py-2.5 rounded-md text-sm font-bold flex items-center gap-2 transition"
          >
            <Plus size={15} /> Nova conexão
          </button>
        </PageHeader>

        {showForm && (
          <form
            onSubmit={create}
            className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5 mb-6 flex flex-col sm:flex-row gap-3 animate-fade-up"
            data-testid="session-form"
          >
            <input
              required
              placeholder="Nome da instância (ex. Vendas 01)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-white/50 focus:outline-none"
              data-testid="session-name-input"
            />
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="Limite diário"
              className="w-full sm:w-40 bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm font-mono"
            />
            <button
              type="submit"
              disabled={creating}
              data-testid="create-session-button"
              className="bg-white text-neutral-950 hover:bg-neutral-200 px-5 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : null}
              Criar e conectar
            </button>
          </form>
        )}

        {sessions.length === 0 ? (
          <Empty
            title="Nenhuma instância"
            subtitle="Crie uma instância para conectar um número WhatsApp real via QR Code."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((s) => {
              const meta = STATUS_META[s.status] || STATUS_META.desconectado;
              return (
                <div
                  key={s.id}
                  className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5 hover:border-neutral-700 transition-colors"
                  data-testid={`session-card-${s.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-11 w-11 rounded-md flex items-center justify-center ring-2 ring-transparent ${s.status === "conectado" ? "bg-[#25D366]/10 ring-[#25D366]/40" : "bg-neutral-800"} ${meta.ring}`}>
                        <Smartphone size={18} className={s.status === "conectado" ? "text-[#25D366]" : "text-neutral-500"} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display font-bold truncate">{s.name}</div>
                        <div className="font-mono text-[11px] text-neutral-500 truncate">
                          {s.phone_number ? `+${s.phone_number}` : "sem número"}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => del(s.id)}
                      data-testid={`delete-session-${s.id}`}
                      className="text-neutral-600 hover:text-red-400 p-1"
                      title="Excluir instância"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      <Pill variant={meta.variant}>{meta.label}</Pill>
                    </div>
                    <div className="font-mono text-[11px] text-neutral-500">
                      {s.sent_today}/{s.daily_limit} hoje
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    {s.status === "conectado" ? (
                      <button
                        onClick={() => disconnect(s.id)}
                        data-testid={`disconnect-${s.id}`}
                        className="flex-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 rounded-md py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <WifiOff size={12} /> Desconectar
                      </button>
                    ) : s.status === "aguardando_qr" || s.status === "conectando" ? (
                      <button
                        onClick={() => setModalSession(s)}
                        data-testid={`open-qr-${s.id}`}
                        className="flex-1 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 rounded-md py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                      >
                        <RotateCw size={12} className="animate-spin" /> Abrir QR Code
                      </button>
                    ) : (
                      <button
                        onClick={() => connect(s)}
                        data-testid={`connect-${s.id}`}
                        className="flex-1 bg-[#25D366] text-neutral-950 hover:bg-[#1ebe5c] rounded-md py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                      >
                        <Wifi size={12} /> Conectar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-xs text-neutral-500 font-mono">
          Baileys ativo · Sessões persistidas em <span className="text-neutral-300">/app/whatsapp-sessions</span>
        </div>
      </div>

      {/* QR Modal */}
      {modalSession && (
        <QRModal
          session={modalSession}
          onClose={() => setModalSession(null)}
          onReconnect={() => connect(modalSession)}
        />
      )}
    </div>
  );
}

function QRModal({ session, onClose, onReconnect }) {
  const qr = session.qr_code;
  const connected = session.status === "conectado";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-up"
      data-testid="qr-modal"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-sm w-full relative shadow-2xl"
      >
        <button
          onClick={onClose}
          data-testid="qr-modal-close"
          className="absolute top-3 right-3 text-neutral-500 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
        <div className="text-center mb-5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#25D366] mb-2">
            {session.name}
          </div>
          <h2 className="font-display text-2xl font-black tracking-tight">
            {connected ? "Conectado ✓" : "Escaneie o QR Code"}
          </h2>
          <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
            Abra WhatsApp → <span className="text-neutral-300">Configurações</span> →{" "}
            <span className="text-neutral-300">Aparelhos conectados</span> → Conectar aparelho
          </p>
        </div>

        <div className="max-w-[280px] mx-auto relative">
          {qr ? (
            <div className="bg-white p-3 rounded-lg">
              <img
                src={qr}
                alt="QR Code WhatsApp"
                className="w-full h-auto"
                data-testid="qr-image"
              />
            </div>
          ) : (
            <div className="aspect-square w-full bg-neutral-800/60 rounded-lg flex flex-col items-center justify-center gap-3 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent animate-scan" />
              <Loader2 size={32} className="text-neutral-500 animate-spin" />
              <div className="text-[11px] text-neutral-500 font-mono">
                {connected ? "conectado" : "gerando QR..."}
              </div>
            </div>
          )}
          {/* Corner brackets decoration */}
          <div className="absolute -top-1 -left-1 w-5 h-5 border-l-2 border-t-2 border-[#25D366] rounded-tl" />
          <div className="absolute -top-1 -right-1 w-5 h-5 border-r-2 border-t-2 border-[#25D366] rounded-tr" />
          <div className="absolute -bottom-1 -left-1 w-5 h-5 border-l-2 border-b-2 border-[#25D366] rounded-bl" />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 border-r-2 border-b-2 border-[#25D366] rounded-br" />
        </div>

        <div className="mt-5 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
          {connected ? (
            <span className="text-[#25D366] font-mono">+{session.phone_number}</span>
          ) : (
            <>
              <Loader2 size={12} className="animate-spin" /> Aguardando leitura...
            </>
          )}
        </div>

        {!connected && (
          <button
            onClick={onReconnect}
            data-testid="qr-refresh-button"
            className="mt-4 w-full bg-neutral-800 hover:bg-neutral-700 rounded-md py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          >
            <RotateCw size={12} /> Gerar novo QR
          </button>
        )}
      </div>
    </div>
  );
}
