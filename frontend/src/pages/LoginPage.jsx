import React, { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/app" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Bem-vindo de volta!");
      nav("/app");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Falha ao entrar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grain bg-neutral-950 text-neutral-50 grid lg:grid-cols-2">
      {/* Left panel */}
      <div className="hidden lg:flex relative items-end p-12 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1770745560263-a8fc696de90b?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.55,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-neutral-950 via-neutral-950/80 to-transparent" />
        <div className="relative z-10 max-w-md">
          <div className="flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-md bg-[#25D366] flex items-center justify-center shadow-[0_0_40px_rgba(37,211,102,0.4)]">
              <Zap size={20} className="text-neutral-950" strokeWidth={2.6} />
            </div>
            <span className="font-display font-black text-2xl tracking-tighter">ZapFlow</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#25D366] mb-4">Control Room</div>
          <h2 className="font-display text-5xl font-black tracking-tighter leading-[1.05]">
            Disparo em massa<br />
            <span className="text-gradient-wa">sem ser bloqueado.</span>
          </h2>
          <p className="text-neutral-400 mt-6 text-sm leading-relaxed">
            Dashboard profissional com rotação de chips, IA de copywriting,
            variáveis dinâmicas e métricas em tempo real. Inspirado nas melhores plataformas SaaS.
          </p>
          <div className="mt-10 flex gap-6 text-xs font-mono text-neutral-500">
            <div>
              <div className="text-2xl font-bold text-white">99.2%</div>
              <div>entrega</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">12k+</div>
              <div>msg/dia</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">∞</div>
              <div>sessões</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" data-testid="login-form">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 mb-2">Acesso</div>
            <h1 className="font-display text-3xl font-black tracking-tighter">Entrar na conta</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Ainda não tem conta?{" "}
              <Link to="/register" className="text-white hover:text-[#25D366] underline underline-offset-4" data-testid="go-register-link">
                Criar agora
              </Link>
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">E-mail</label>
            <input
              data-testid="login-email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/50 focus:border-white/50 transition placeholder:text-neutral-600"
              placeholder="voce@empresa.com"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">Senha</label>
            <input
              data-testid="login-password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/50 focus:border-white/50 transition"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            data-testid="login-submit-button"
            className="w-full bg-white text-neutral-950 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed font-bold py-2.5 rounded-md transition-colors flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            Entrar
          </button>

          <div className="text-[11px] text-neutral-600 text-center pt-4 border-t border-neutral-900">
            Ao continuar, você concorda com nossos Termos e Política de Privacidade.
          </div>
        </form>
      </div>
    </div>
  );
}
