import React, { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageHeader, Pill } from "../components/Primitives";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";

const PACKS = [50, 100, 250, 500, 1000];

export default function CreditsPage() {
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(null);

  const load = async () => {
    const r = await apiClient.get("/credits/balance");
    setData(r.data);
  };
  useEffect(() => { load(); }, []);

  const money = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const recharge = async (amount) => {
    setLoading(amount);
    try {
      await apiClient.post("/credits/recharge", { amount });
      toast.success(`+ ${money(amount)} adicionados ao saldo`);
      await refresh();
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Falha"); }
    finally { setLoading(null); }
  };

  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto">
      <PageHeader eyebrow="Financeiro" title="Créditos" subtitle="Recarregue seu saldo via Pix (simulado em teste). R$ 0,05/texto · R$ 0,15/áudio." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="md:col-span-1 bg-gradient-to-br from-[#25D366]/20 to-[#25D366]/5 border border-[#25D366]/30 rounded-lg p-6">
          <div className="flex items-center gap-2 text-[#25D366] text-[10px] uppercase tracking-[0.25em] font-bold">
            <Wallet size={14} /> Saldo atual
          </div>
          <div className="font-mono text-4xl font-black text-white mt-4" data-testid="credits-balance">
            {money(data?.credits)}
          </div>
          <div className="text-xs text-neutral-400 mt-2">
            ≈ {Math.floor((data?.credits || 0) / 0.05)} msgs de texto
          </div>
        </div>

        <div className="md:col-span-2 bg-neutral-900/50 border border-neutral-800 rounded-lg p-6">
          <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">Pacotes rápidos</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {PACKS.map((v) => (
              <button
                key={v}
                onClick={() => recharge(v)}
                disabled={loading === v}
                data-testid={`recharge-${v}`}
                className="bg-neutral-950 border border-neutral-800 hover:border-[#25D366] hover:bg-[#25D366]/5 transition-all rounded-md p-3 group"
              >
                <div className="font-mono text-xl font-bold text-white">{money(v)}</div>
                <div className="text-[10px] text-neutral-500 group-hover:text-[#25D366]">+Pix simulado</div>
                {loading === v && <Loader2 size={12} className="mx-auto mt-1 animate-spin" />}
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input
              type="number"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Valor personalizado (min R$ 10)"
              className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm font-mono"
              data-testid="custom-amount-input"
            />
            <button
              onClick={() => custom && recharge(+custom)}
              disabled={!custom || +custom < 10}
              data-testid="custom-recharge-button"
              className="bg-white text-neutral-950 hover:bg-neutral-200 disabled:opacity-40 px-5 py-2 text-sm font-bold rounded-md"
            >
              Recarregar
            </button>
          </div>
        </div>
      </div>

      <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-800 font-display font-bold">Histórico de transações</div>
        <div className="max-h-[500px] overflow-y-auto">
          {(!data?.transactions || data.transactions.length === 0) && (
            <div className="p-10 text-center text-neutral-500 text-sm">Nenhuma transação ainda.</div>
          )}
          {data?.transactions?.map((t) => {
            const isIn = t.type !== "consumo";
            const Icon = t.type === "bonus" ? Gift : isIn ? ArrowUpCircle : ArrowDownCircle;
            return (
              <div key={t.id} className="flex items-center gap-3 px-6 py-3 border-t border-neutral-800/50" data-testid={`transaction-${t.id}`}>
                <Icon size={18} className={isIn ? "text-[#25D366]" : "text-red-400"} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t.description}</div>
                  <div className="text-[11px] text-neutral-500 font-mono">{new Date(t.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <Pill variant={t.type === "recarga" ? "green" : t.type === "bonus" ? "sky" : "default"}>{t.type}</Pill>
                <div className={`font-mono font-bold text-sm ${isIn ? "text-[#25D366]" : "text-red-400"}`}>
                  {isIn ? "+" : ""}{money(t.amount)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
