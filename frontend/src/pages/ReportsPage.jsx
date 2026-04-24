import React, { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { PageHeader, Pill } from "../components/Primitives";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";

export default function ReportsPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiClient.get("/reports").then((r) => setData(r.data));
  }, []);

  if (!data) return <div className="p-10 text-neutral-500">Carregando...</div>;

  const chart = [
    { name: "Enviados", value: data.totals.sent },
    { name: "Entregues", value: data.totals.delivered },
    { name: "Lidos", value: data.totals.read },
    { name: "Respondidos", value: data.totals.replied },
    { name: "Falhas", value: data.totals.failed },
  ];

  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto">
      <PageHeader eyebrow="Analytics" title="Relatórios" subtitle="Totais consolidados de todas as campanhas." />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {[
          { l: "Enviados", v: data.totals.sent },
          { l: "Entregues", v: data.totals.delivered },
          { l: "Lidos", v: data.totals.read, c: "text-sky-400" },
          { l: "Respondidos", v: data.totals.replied, c: "text-[#25D366]" },
          { l: "Falhas", v: data.totals.failed, c: "text-red-400" },
        ].map((s) => (
          <div key={s.l} className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">{s.l}</div>
            <div className={`font-mono text-3xl font-bold mt-1 ${s.c || "text-white"}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-6 mb-8">
        <div className="font-display font-bold mb-4">Funil consolidado</div>
        <div className="h-72" data-testid="reports-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#737373", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#737373", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #262626", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" fill="#25D366" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-800 font-display font-bold">Por campanha</div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/50">
            <tr className="text-left text-neutral-500 text-[11px] uppercase tracking-wider">
              <th className="px-6 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium font-mono">Contatos</th>
              <th className="px-4 py-3 font-medium font-mono">Env.</th>
              <th className="px-4 py-3 font-medium font-mono">Ent.</th>
              <th className="px-4 py-3 font-medium font-mono">Lid.</th>
              <th className="px-4 py-3 font-medium font-mono">Resp.</th>
              <th className="px-4 py-3 font-medium font-mono">Falhas</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-neutral-500">Sem campanhas.</td></tr>
            )}
            {data.campaigns.map((c) => (
              <tr key={c.id} className="border-t border-neutral-800/50" data-testid={`report-row-${c.id}`}>
                <td className="px-6 py-3">{c.name}</td>
                <td className="px-4 py-3"><Pill variant={c.status === "concluida" ? "green" : c.status === "enviando" ? "amber" : "default"}>{c.status}</Pill></td>
                <td className="px-4 py-3 font-mono text-neutral-400">{c.total_contacts}</td>
                <td className="px-4 py-3 font-mono">{c.sent}</td>
                <td className="px-4 py-3 font-mono">{c.delivered}</td>
                <td className="px-4 py-3 font-mono text-sky-400">{c.read}</td>
                <td className="px-4 py-3 font-mono text-[#25D366]">{c.replied}</td>
                <td className="px-4 py-3 font-mono text-red-400">{c.failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
