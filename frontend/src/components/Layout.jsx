import React from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Megaphone, FileText, Smartphone,
  BarChart3, Wallet, Settings, LogOut, Zap, Sparkles, MessageCircle, Clock, Menu, Kanban, Sun, Moon
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

const mobileNav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true, id: "dashboard" },
  { to: "/app/contatos", label: "Contatos", icon: Users, id: "contatos" },
  { to: "/app/campanhas", label: "Campanhas", icon: Megaphone, id: "campanhas" },
  { to: "/app/templates", label: "Templates", icon: FileText, id: "templates" },
  { to: "/app/conexoes", label: "Conexões", icon: Smartphone, id: "conexoes" },
  { action: "more", label: "Mais", icon: Menu, id: "more" },
];

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true, id: "dashboard" },
  { to: "/app/contatos", label: "Contatos", icon: Users, id: "contatos" },
  { to: "/app/campanhas", label: "Campanhas", icon: Megaphone, id: "campanhas" },
  { to: "/app/templates", label: "Templates", icon: FileText, id: "templates" },
  { to: "/app/conexoes", label: "Conexões WhatsApp", icon: Smartphone, id: "conexoes" },
  { to: "/app/chat", label: "Chat", icon: MessageCircle, id: "chat" },
  { to: "/app/kanban", label: "Kanban CRM", icon: Kanban, id: "kanban" },
  { to: "/app/scheduler", label: "Scheduler", icon: Clock, id: "scheduler" },
  { to: "/app/relatorios", label: "Relatórios", icon: BarChart3, id: "relatorios" },
  { to: "/app/creditos", label: "Créditos", icon: Wallet, id: "creditos" },
  { to: "/app/configuracoes", label: "Configurações", icon: Settings, id: "configuracoes" },
];

function MobileDrawer({ open, onClose, nav, onLogout }) {
  if (!open) return null;
  return (
    <div className="md:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-neutral-950 rounded-t-2xl p-4 space-y-2 border-t border-neutral-200 dark:border-neutral-800 animate-slideUp">
        <div className="text-neutral-400 text-xs uppercase tracking-widest px-2 pb-2">Menu</div>
        {nav.filter((n) => !["/app"].includes(n.to)).map((n) => (
          <NavLink key={n.to} to={n.to} onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900">
            <n.icon size={18} />
            {n.label}
          </NavLink>
        ))}
        <button onClick={onLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-900 w-full">
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const nav2 = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const handleLogout = () => { logout(); nav2("/login"); };
  const isKanban = location.pathname === "/app/kanban";

  const ThemeToggle = () => (
    <button
      onClick={toggleTheme}
      title={theme === "dark" ? "Modo claro" : "Modo escuro"}
      className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors p-1"
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );

  return (
    <div className="grain min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 flex">

      {/* Sidebar — collapsed (icon-only) on Kanban */}
      {isKanban ? (
        <aside className="hidden md:flex w-14 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-900 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-xl overflow-visible">
          <div className="py-5 flex items-center justify-center">
            <div className="h-9 w-9 rounded-md bg-[#25D366] flex items-center justify-center shadow-[0_0_30px_rgba(37,211,102,0.35)]">
              <Zap size={18} className="text-neutral-950" strokeWidth={2.6} />
            </div>
          </div>

          <nav className="flex-1 px-1.5 py-2 space-y-0.5 overflow-visible">
            {nav.map((n) => (
              <div key={n.to} className="relative group">
                <NavLink to={n.to} end={n.exact} data-testid={`sidebar-${n.id}-link`}
                  className={({ isActive }) =>
                    `flex items-center justify-center p-2.5 rounded-md transition-colors ${
                      isActive
                        ? "bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50"
                        : "text-neutral-400 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900/60 hover:text-neutral-900 dark:hover:text-neutral-50"
                    }`
                  }>
                  <n.icon size={17} strokeWidth={1.8} />
                </NavLink>
                <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-[9999] flex items-center opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 ease-out">
                  <div className="w-0 h-0 border-y-4 border-y-transparent border-r-4 border-r-neutral-200 dark:border-r-neutral-700" />
                  <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-50 text-xs font-medium px-3 py-1.5 rounded-r-md rounded-bl-md whitespace-nowrap shadow-2xl">
                    {n.label}
                  </div>
                </div>
              </div>
            ))}
          </nav>

          <div className="p-2 border-t border-neutral-200 dark:border-neutral-900 flex flex-col items-center gap-2 overflow-visible">
            <div className="relative group">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-900 flex items-center justify-center text-xs font-bold cursor-default text-neutral-700 dark:text-white">
                {user?.name?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="pointer-events-none absolute left-full bottom-0 ml-3 z-[9999] flex items-center opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 ease-out">
                <div className="w-0 h-0 border-y-4 border-y-transparent border-r-4 border-r-neutral-200 dark:border-r-neutral-700" />
                <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-50 text-xs px-3 py-1.5 rounded-r-md rounded-bl-md whitespace-nowrap shadow-2xl">
                  <div className="font-semibold">{user?.name}</div>
                  <div className="text-neutral-500 text-[10px]">{user?.email}</div>
                </div>
              </div>
            </div>
            <ThemeToggle />
            <button onClick={handleLogout} data-testid="logout-button"
              className="text-neutral-400 dark:text-neutral-500 hover:text-red-500 transition-colors p-1" title="Sair">
              <LogOut size={15} />
            </button>
          </div>
        </aside>
      ) : (
        <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-900 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-xl">
          <div className="px-6 py-6 flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-[#25D366] flex items-center justify-center shadow-[0_0_30px_rgba(37,211,102,0.35)]">
              <Zap size={18} className="text-neutral-950" strokeWidth={2.6} />
            </div>
            <div>
              <div className="font-display font-black text-xl tracking-tighter leading-none">ZapFlow</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500 mt-0.5">Control Room</div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-2 space-y-0.5">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.exact} data-testid={`sidebar-${n.id}-link`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 border-l-2 border-[#25D366] pl-2.5"
                      : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900/60 hover:text-neutral-900 dark:hover:text-neutral-50"
                  }`
                }>
                <n.icon size={17} strokeWidth={1.8} />
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="p-3 border-t border-neutral-200 dark:border-neutral-900">
            <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-900/50">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-900 flex items-center justify-center text-xs font-bold text-neutral-700 dark:text-white">
                {user?.name?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{user?.name}</div>
                <div className="text-[11px] text-neutral-500 truncate">{user?.email}</div>
              </div>
              <div className="flex items-center gap-1">
                <ThemeToggle />
                <button onClick={handleLogout} data-testid="logout-button"
                  className="text-neutral-400 dark:text-neutral-500 hover:text-red-500 transition-colors" title="Sair">
                  <LogOut size={16} />
                </button>
              </div>
            </div>
            <div className="mt-3 px-3 py-2 rounded-md bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Saldo</div>
                <div className="font-mono text-[#25D366] font-bold" data-testid="sidebar-credits">
                  R$ {(user?.credits ?? 0).toFixed(2)}
                </div>
              </div>
              <Sparkles size={16} className="text-[#25D366]" />
            </div>
          </div>
        </aside>
      )}

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 glass border-b border-neutral-200 dark:border-neutral-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-[#25D366] flex items-center justify-center">
            <Zap size={16} className="text-neutral-950" strokeWidth={2.6} />
          </div>
          <span className="font-display font-black text-lg tracking-tighter">ZapFlow</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button onClick={handleLogout} className="text-neutral-400" data-testid="mobile-logout">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-neutral-200 dark:border-neutral-900 px-2 py-2 flex justify-around">
        {mobileNav.map((n) =>
          n.action === "more" ? (
            <button key="more" onClick={() => setDrawerOpen(true)}
              className="flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
              <Menu size={20} />
              <span>Mais</span>
            </button>
          ) : (
            <NavLink key={n.to} to={n.to} end={n.exact}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] ${isActive ? "text-[#25D366]" : "text-neutral-400 dark:text-neutral-500"}`
              }>
              <n.icon size={20} />
              <span>{n.label}</span>
            </NavLink>
          )
        )}
      </nav>

      <main className="flex-1 min-w-0 pt-16 md:pt-0 pb-20 md:pb-0 overflow-x-hidden">
        <Outlet />
      </main>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} nav={nav} onLogout={handleLogout} />
    </div>
  );
}
