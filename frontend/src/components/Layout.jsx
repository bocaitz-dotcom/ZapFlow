import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Megaphone, FileText, Smartphone,
  Send, BarChart3, Wallet, Settings, LogOut, Zap, Sparkles, MessageCircle
} from "lucide-react";
import { useAuth } from "../lib/auth";

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true, id: "dashboard" },
  { to: "/app/contatos", label: "Contatos", icon: Users, id: "contatos" },
  { to: "/app/campanhas", label: "Campanhas", icon: Megaphone, id: "campanhas" },
  { to: "/app/templates", label: "Templates", icon: FileText, id: "templates" },
  { to: "/app/conexoes", label: "Conexões WhatsApp", icon: Smartphone, id: "conexoes" },
  { to: "/app/chat", label: "Chat", icon: MessageCircle, id: "chat" },
  { to: "/app/disparo", label: "Disparo", icon: Send, id: "disparo" },
  { to: "/app/relatorios", label: "Relatórios", icon: BarChart3, id: "relatorios" },
  { to: "/app/creditos", label: "Créditos", icon: Wallet, id: "creditos" },
  { to: "/app/configuracoes", label: "Configurações", icon: Settings, id: "configuracoes" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav2 = useNavigate();

  const handleLogout = () => { logout(); nav2("/login"); };

  return (
    <div className="grain min-h-screen bg-neutral-950 text-neutral-50 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-neutral-900 bg-neutral-950/80 backdrop-blur-xl">
        <div className="px-6 py-6 flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-[#25D366] flex items-center justify-center shadow-[0_0_30px_rgba(37,211,102,0.35)]">
            <Zap size={18} className="text-neutral-950" strokeWidth={2.6} />
          </div>
          <div>
            <div className="font-display font-black text-xl tracking-tighter leading-none">ZapFlow</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mt-0.5">Control Room</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.exact}
              data-testid={`sidebar-${n.id}-link`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-neutral-900 text-neutral-50 border-l-2 border-[#25D366] pl-2.5"
                    : "text-neutral-500 hover:bg-neutral-900/60 hover:text-neutral-50"
                }`
              }
            >
              <n.icon size={17} strokeWidth={1.8} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-neutral-900">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-neutral-900/50">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-900 flex items-center justify-center text-xs font-bold">
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{user?.name}</div>
              <div className="text-[11px] text-neutral-500 truncate">{user?.email}</div>
            </div>
            <button
              onClick={handleLogout}
              data-testid="logout-button"
              className="text-neutral-500 hover:text-white transition-colors"
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
          <div className="mt-3 px-3 py-2 rounded-md bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-neutral-400">Saldo</div>
              <div className="font-mono text-[#25D366] font-bold" data-testid="sidebar-credits">
                R$ {(user?.credits ?? 0).toFixed(2)}
              </div>
            </div>
            <Sparkles size={16} className="text-[#25D366]" />
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 glass border-b border-neutral-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-[#25D366] flex items-center justify-center">
            <Zap size={16} className="text-neutral-950" strokeWidth={2.6} />
          </div>
          <span className="font-display font-black text-lg tracking-tighter">ZapFlow</span>
        </div>
        <button onClick={handleLogout} className="text-neutral-400" data-testid="mobile-logout">
          <LogOut size={18} />
        </button>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-neutral-900 px-2 py-2 flex justify-around">
        {nav.slice(0, 5).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.exact}
            data-testid={`mobile-${n.id}-link`}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] ${
                isActive ? "text-[#25D366]" : "text-neutral-500"
              }`
            }
          >
            <n.icon size={18} />
            <span>{n.label.split(" ")[0]}</span>
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 min-w-0 pt-16 md:pt-0 pb-20 md:pb-0 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
