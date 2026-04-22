import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../lib/api";
import { PageHeader, Empty, Pill } from "../components/Primitives";
import { Plus, Play, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useWebSocket } from "../lib/ws";

export default function CampaignsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const load = async () => {
    const r = await apiClient.get("/campaigns");
    setItems(r.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useWebSocket((msg) => {
    if (["campaign_status", "message_update"].includes(msg.type)) load();
  });

  const start = async (id) => {
    try {
      await apiClient.post(`/campaigns/${id}/start`);
      toast.success("Campanha iniciada!");
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Falha"); }
  };

  const del = async (id) => {
    if (!window.confirm("Excluir campanha e logs?")) return;
    await apiClient.delete(`/campaigns/${id}`);
    load();
  };

  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="Automação"
        title="Campanhas"
        subtitle="Crie, dispare e acompanhe o desempenho em tempo real."
      >
        <button
          onClick={() => nav("/app/campanhas/nova")}
          data-testid="new-campaign-button"
          className="bg-white text-neutral-950 hover:bg-neutral-200 px-4 py-2.5 rounded-md text-sm font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={15} /> Nova campanha
        </button>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-neutral-500" /></div>
      ) : items.length === 0 ? (
        <Empty
          title="Sem campanhas"
          subtitle="Crie sua primeira campanha para disparo em massa."
          action={<Link to="/app/campanhas/nova" className="bg-white text-neutral-950 px-5 py-2.5 rounded-md font-bold text-sm inline-flex items-center gap-2"><Plus size={15}/> Nova campanha</Link>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((c) => (
            <div key={c.id} data-testid={`campaign-card-${c.id}`} className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5 hover:border-neutral-700 transition group">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <Pill variant={c.status === "concluida" ? "green" : c.status === "enviando" ? "amber" : c.status === "pausada" ? "red" : "default"}>{c.status}</Pill>
                  <div className="font-display text-lg font-bold mt-3 leading-tight">{c.name}</div>
                  <div className="text-xs text-neutral-500 mt-1 font-mono">{c.total_contacts} contatos · {c.send_type}</div>
                </div>
                <button onClick={() => del(c.id)} className="text-neutral-600 hover:text-red-400" data-testid={`campaign-delete-${c.id}`}>
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center mb-4">
                <Mini label="env" v={c.sent} />
                <Mini label="ent" v={c.delivered} />
                <Mini label="lid" v={c.read} color="text-[#25D366]" />
                <Mini label="err" v={c.failed} color="text-red-400" />
              </div>

              <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-[#25D366] transition-all"
                  style={{ width: `${c.total_contacts ? Math.min(100, (c.sent / c.total_contacts) * 100) : 0}%` }}
                />
              </div>

              <div className="flex gap-2">
                {c.status !== "enviando" && c.status !== "concluida" && (
                  <button
                    onClick={() => start(c.id)}
                    data-testid={`campaign-start-${c.id}`}
                    className="flex-1 bg-[#25D366] text-neutral-950 hover:bg-[#1ebe5c] rounded-md py-2 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Play size={13} /> Iniciar disparo
                  </button>
                )}
                <Link
                  to={`/app/campanhas/${c.id}`}
                  className="flex-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 rounded-md py-2 text-sm font-semibold text-center transition-colors"
                  data-testid={`campaign-detail-${c.id}`}
                >
                  Detalhes
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Mini({ label, v, color }) {
  return (
    <div className="bg-neutral-950 border border-neutral-800/50 rounded p-1.5">
      <div className="text-[9px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`font-mono text-sm font-bold ${color || "text-neutral-200"}`}>{v || 0}</div>
    </div>
  );
}
