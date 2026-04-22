import React, { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { useWebSocket } from "../lib/ws";
import { PageHeader, MetricCard, Pill } from "../components/Primitives";
import {
  Users, Megaphone, Smartphone, Wallet, TrendingUp,
  CheckCheck, Check, Eye, MessageSquare, XCircle
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, AreaChart, Area,
} from "recharts";
import { Link } from "react-router-dom";
import { Pill as StatusPill } from "../components/Primitives";

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const load = async () => {
    const r = await apiClient.get("/dashboard/stats");
    setData(r.data);
  };
  useEffect(() => { load(); }, []);
  useWebSocket((msg) => {
    if (["message_update", "campaign_status"].includes(msg.type)) {
      load();
    }
  });

  const money = (n) =>
    (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        subtitle="Métricas operacionais em tempo real."
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard testid="metric-contacts" label="Contatos" value={data?.contacts ?? "—"} icon={Users} />
        <MetricCard testid="metric-leads" label="Leads no funil" value={data?.leads ?? "—"} icon={TrendingUp} accent="text-[#25D366]" />
        <MetricCard testid="metric-value" label="Valor estimado" value={money(data?.funnel_value)} icon={Wallet} />
        <MetricCard testid="metric-sessions" label="WhatsApps conectados" value={data?.sessions_connected ?? "—"} icon={Smartphone} />
        <MetricCard testid="metric-campaigns" label="Campanhas ativas" value={data?.active_campaigns ?? "—"} icon={Megaphone} />
      </div>

      {/* Chart + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <div className="lg:col-span-2 bg-neutral-900/50 border border-neutral-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Últimos 7 dias</div>
              <div className="font-display text-xl font-bold mt-1">Atividade de disparo</div>
            </div>
            <Pill variant="green">ao vivo</Pill>
          </div>
          <div className="h-64" data-testid="dashboard-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.activity || []}>
                <defs>
                  <linearGradient id="gEnviados" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gLidos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#25D366" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#25D366" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#737373", fontSize: 11, fontFamily: "JetBrains Mono" }} tickFormatter={(v) => v?.slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#737373", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0a0a0a", border: "1px solid #262626", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#fafafa" }}
                />
                <Area type="monotone" dataKey="enviados" stroke="#fafafa" strokeWidth={2} fill="url(#gEnviados)" />
                <Area type="monotone" dataKey="lidos" stroke="#25D366" strokeWidth={2} fill="url(#gLidos)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stats funnel */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Funil</div>
          <div className="font-display text-xl font-bold mt-1 mb-6">Status das mensagens</div>
          <div className="space-y-3">
            <FunnelRow icon={Check} label="Enviados" value={data?.stats?.sent} color="text-neutral-200" />
            <FunnelRow icon={CheckCheck} label="Entregues" value={data?.stats?.delivered} color="text-neutral-200" />
            <FunnelRow icon={Eye} label="Lidos" value={data?.stats?.read} color="text-sky-400" />
            <FunnelRow icon={MessageSquare} label="Respondidos" value={data?.stats?.replied} color="text-[#25D366]" />
            <FunnelRow icon={XCircle} label="Falhas" value={data?.stats?.failed} color="text-red-400" />
          </div>
        </div>
      </div>

      {/* Recent campaigns */}
      <div className="mt-8 bg-neutral-900/50 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-6">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Recentes</div>
            <div className="font-display text-xl font-bold mt-1">Campanhas</div>
          </div>
          <Link
            to="/app/campanhas"
            data-testid="view-all-campaigns-link"
            className="text-sm text-neutral-400 hover:text-white"
          >
            Ver todas →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-neutral-800 bg-neutral-900/50">
              <tr className="text-left text-neutral-500 text-[11px] uppercase tracking-wider">
                <th className="px-6 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium font-mono">Contatos</th>
                <th className="px-4 py-3 font-medium font-mono">Enviados</th>
                <th className="px-4 py-3 font-medium font-mono">Entregues</th>
                <th className="px-4 py-3 font-medium font-mono">Lidos</th>
              </tr>
            </thead>
            <tbody>
              {(!data?.recent_campaigns || data.recent_campaigns.length === 0) && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-neutral-500">Nenhuma campanha ainda.</td></tr>
              )}
              {data?.recent_campaigns?.map((c) => (
                <tr key={c.id} className="border-b border-neutral-800/50 hover:bg-neutral-900/40 transition-colors">
                  <td className="px-6 py-4 font-medium">{c.name}</td>
                  <td className="px-4 py-4">
                    <StatusPill variant={c.status === "concluida" ? "green" : c.status === "enviando" ? "amber" : c.status === "pausada" ? "red" : "default"}>
                      {c.status}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-4 font-mono text-neutral-400">{c.total_contacts}</td>
                  <td className="px-4 py-4 font-mono">{c.sent}</td>
                  <td className="px-4 py-4 font-mono">{c.delivered}</td>
                  <td className="px-4 py-4 font-mono text-[#25D366]">{c.read}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FunnelRow({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-800/60 pb-2 last:border-0">
      <div className="flex items-center gap-2">
        <Icon size={15} className={color} />
        <span className="text-sm text-neutral-300">{label}</span>
      </div>
      <div className="font-mono font-bold">{value ?? 0}</div>
    </div>
  );
}
