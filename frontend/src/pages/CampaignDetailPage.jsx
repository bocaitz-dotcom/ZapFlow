import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "../lib/api";
import { PageHeader, Pill } from "../components/Primitives";
import { ArrowLeft, Check, CheckCheck, Eye, MessageSquare, XCircle, Clock } from "lucide-react";
import { useWebSocket } from "../lib/ws";

const STATUS_ICON = {
  pendente: Clock, enviado: Check, entregue: CheckCheck, lido: Eye, respondido: MessageSquare, falha: XCircle,
};
const STATUS_COLOR = {
  pendente: "text-neutral-500", enviado: "text-neutral-300",
  entregue: "text-neutral-200", lido: "text-sky-400",
  respondido: "text-[#25D366]", falha: "text-red-400",
};

export default function CampaignDetailPage() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [messages, setMessages] = useState([]);

  const load = async () => {
    const [c, m] = await Promise.all([
      apiClient.get(`/campaigns/${id}`),
      apiClient.get(`/campaigns/${id}/messages`),
    ]);
    setCampaign(c.data);
    setMessages(m.data);
  };

  useEffect(() => { load(); }, [id]);
  useWebSocket((msg) => {
    if (msg.campaign_id === id) load();
  });

  if (!campaign) return <div className="p-10 text-neutral-500">Carregando...</div>;

  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto">
      <Link to="/app/campanhas" className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white mb-4" data-testid="back-to-campaigns">
        <ArrowLeft size={14} /> Voltar
      </Link>
      <PageHeader
        eyebrow={<Pill variant={campaign.status === "concluida" ? "green" : campaign.status === "enviando" ? "amber" : "default"}>{campaign.status}</Pill>}
        title={campaign.name}
        subtitle={`${campaign.total_contacts} contatos · ${campaign.send_type} · ${campaign.message_versions.length} variações`}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {[
          { l: "Enviados", v: campaign.sent },
          { l: "Entregues", v: campaign.delivered },
          { l: "Lidos", v: campaign.read, c: "text-sky-400" },
          { l: "Respondidos", v: campaign.replied, c: "text-[#25D366]" },
          { l: "Falhas", v: campaign.failed, c: "text-red-400" },
        ].map((s) => (
          <div key={s.l} className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">{s.l}</div>
            <div className={`font-mono text-2xl font-bold mt-1 ${s.c || "text-neutral-50"}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="font-display font-bold">Log de disparos</div>
          <span className="text-xs text-neutral-500 font-mono">{messages.length} registros</span>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {messages.length === 0 && (
            <div className="p-10 text-center text-neutral-500 text-sm">Nenhum envio ainda. Inicie a campanha.</div>
          )}
          {messages.map((m) => {
            const Icon = STATUS_ICON[m.status] || Clock;
            return (
              <div key={m.id} className="flex items-center gap-3 px-6 py-3 border-b border-neutral-800/50 hover:bg-neutral-900/40" data-testid={`msg-log-${m.id}`}>
                <Icon size={16} className={STATUS_COLOR[m.status]} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.contact_name} <span className="font-mono text-[11px] text-neutral-500 ml-1">{m.contact_phone}</span></div>
                  <div className="text-xs text-neutral-500 truncate mt-0.5">{m.content}</div>
                </div>
                <Pill variant={m.status === "falha" ? "red" : m.status === "respondido" ? "green" : m.status === "lido" ? "sky" : "default"}>
                  {m.status}
                </Pill>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
