import React, { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Zap, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function RegisterPage() {
  const { register, user, loading } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/app" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    setBusy(true);
    try {
      await register(name, email, password);
      toast.success("Conta criada! +R$25 de bônus");
      nav("/app");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Falha ao cadastrar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grain bg-neutral-950 text-neutral-50 flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-10 justify-center">
          <div className="h-10 w-10 rounded-md bg-[#25D366] flex items-center justify-center shadow-[0_0_40px_rgba(37,211,102,0.4)]">
            <Zap size={20} className="text-neutral-950" strokeWidth={2.6} />
          </div>
          <span className="font-display font-black text-2xl tracking-tighter">ZapFlow</span>
        </div>

        <form onSubmit={submit} className="space-y-5" data-testid="register-form">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 mb-2">Criar conta</div>
            <h1 className="font-display text-3xl font-black tracking-tighter">Comece grátis</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Ganhe <span className="text-[#25D366] font-mono font-bold">R$ 25</span> de bônus para testar.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">Nome</label>
            <input
              data-testid="register-name-input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/50"
              placeholder="Seu nome"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">E-mail</label>
            <input
              data-testid="register-email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/50"
              placeholder="voce@empresa.com"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">Senha</label>
            <input
              data-testid="register-password-input"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/50"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <button
            disabled={busy}
            data-testid="register-submit-button"
            className="w-full bg-white text-neutral-950 hover:bg-neutral-200 font-bold py-2.5 rounded-md transition-colors flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Criar conta
          </button>

          <p className="text-xs text-neutral-500 text-center">
            Já tem conta?{" "}
            <Link to="/login" className="text-white hover:text-[#25D366] underline underline-offset-4" data-testid="go-login-link">
              Entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
