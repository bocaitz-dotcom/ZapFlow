import React, { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { PageHeader, Empty } from "../components/Primitives";
import { Send, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function DisparoPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loadingId, setLoadingId] = useState(null);

  const load = async () => {
    const r = await apiClient.get("/campaigns");
    setCampaigns(r.data.filter((c) => c.status !== "concluida"));
  };
  useEffect(() => { load(); }, []);

  const start = async (c) => {
    setLoadingId(c.id);
    try {
      await apiClient.post(`/campaigns/${c.id}/start`);
      toast.success(`Disparo iniciado: ${c.name}`);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Falha"); }
    finally { setLoadingId(null); }
  };

  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto">
      <PageHeader eyebrow="Ações" title="Disparo em massa" subtitle="Selecione uma campanha pronta e inicie o disparo. Controle total via dashboard.">
        <Link to="/app/campanhas/nova" className="bg-white text-neutral-950 hover:bg-neutral-200 px-4 py-2.5 rounded-md text-sm font-bold flex items-center gap-2">
          <Send size={14} /> Nova campanha
        </Link>
      </PageHeader>

      {campaigns.length === 0 ? (
        <Empty title="Sem campanhas para disparar" subtitle="Crie uma campanha primeiro para iniciar um disparo."/>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.id} className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5 flex items-center justify-between" data-testid={`disparo-row-${c.id}`}>
              <div>
                <div className="font-display font-bold">{c.name}</div>
                <div className="text-xs text-neutral-500 mt-1 font-mono">
                  {c.total_contacts} contatos · {c.send_type} · delay {c.delay_min}-{c.delay_max}s
                </div>
              </div>
              <button
                onClick={() => start(c)}
                disabled={loadingId === c.id || c.status === "enviando"}
                data-testid={`disparo-start-${c.id}`}
                className="bg-[#25D366] text-neutral-950 hover:bg-[#1ebe5c] disabled:opacity-50 rounded-md px-5 py-2.5 text-sm font-bold flex items-center gap-2"
              >
                {loadingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {c.status === "enviando" ? "Em execução..." : "Iniciar disparo"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
