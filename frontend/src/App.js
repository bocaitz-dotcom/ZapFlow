import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { Toaster } from "sonner";

import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import ContactsPage from "./pages/ContactsPage";
import CampaignsPage from "./pages/CampaignsPage";
import CampaignNewPage from "./pages/CampaignNewPage";
import CampaignDetailPage from "./pages/CampaignDetailPage";
import TemplatesPage from "./pages/TemplatesPage";
import WhatsAppPage from "./pages/WhatsAppPage";
import DisparoPage from "./pages/DisparoPage";
import ReportsPage from "./pages/ReportsPage";
import CreditsPage from "./pages/CreditsPage";
import SettingsPage from "./pages/SettingsPage";
import ChatPage from "./pages/ChatPage";
import KanbanPage from "./pages/KanbanPage";
import Scheduler from "./pages/Scheduler";

import "./App.css";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen bg-neutral-950 text-neutral-500 flex items-center justify-center">Carregando…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: "#0a0a0a",
              border: "1px solid #262626",
              color: "#fafafa",
              fontFamily: "Satoshi, system-ui, sans-serif",
            },
          }}
        />
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/app" element={<Protected><Layout /></Protected>}>
            <Route index element={<DashboardPage />} />
            <Route path="contatos" element={<ContactsPage />} />
            <Route path="campanhas" element={<CampaignsPage />} />
            <Route path="campanhas/nova" element={<CampaignNewPage />} />
            <Route path="campanhas/:id" element={<CampaignDetailPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="conexoes" element={<WhatsAppPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="kanban" element={<KanbanPage />} />
            <Route path="disparo" element={<DisparoPage />} />
            <Route path="relatorios" element={<ReportsPage />} />
            <Route path="creditos" element={<CreditsPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="scheduler" element={<Scheduler />} />
          </Route>
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
