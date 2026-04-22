import React from "react";
import { useAuth } from "../lib/auth";
import { PageHeader, Pill } from "../components/Primitives";
import { User, Mail, Shield, Zap } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto">
      <PageHeader eyebrow="Conta" title="Configurações" subtitle="Informações da sua conta ZapFlow." />

      <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-6 space-y-4">
        <Row icon={User} label="Nome" value={user?.name} />
        <Row icon={Mail} label="E-mail" value={user?.email} />
        <Row icon={Shield} label="ID" value={<span className="font-mono text-xs">{user?.id}</span>} />
        <Row icon={Zap} label="Plano" value={<Pill variant="green">Pro trial</Pill>} />
      </div>

      <div className="mt-8 text-xs text-neutral-500 font-mono">
        Versão 1.0.0 · ZapFlow Control Room · Build 2026.02
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-4 py-2 border-b border-neutral-800/50 last:border-0">
      <div className="h-8 w-8 rounded-md bg-neutral-800/60 flex items-center justify-center">
        <Icon size={15} className="text-neutral-400" />
      </div>
      <div className="flex-1">
        <div className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</div>
        <div className="font-medium text-sm">{value}</div>
      </div>
    </div>
  );
}
