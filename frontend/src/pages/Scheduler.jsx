import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../lib/api";
import { Plus, Trash2, Eye, X } from "lucide-react";

/* ================= TOAST (SASS STYLE SOLID) ================= */
function Toast({ toast, onClose }) {
  if (!toast?.show) return null;

  const isError = toast.type === "error";

  return (
    <div className="fixed top-4 right-4 z-[999999]">
      <div
        className={`
          w-[340px] rounded-xl px-4 py-3 flex items-start gap-3
          shadow-2xl border font-medium text-sm
          ${isError
            ? "bg-red-700 border-red-600 text-white"
            : "bg-emerald-700 border-emerald-600 text-white"
          }
        `}
      >
        <div className="flex-1 leading-snug">
          {toast.message}
        </div>

        <button onClick={onClose}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/* ================= MODAL ================= */
function Modal({ open, onClose, children }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();

    if (open) {
      document.addEventListener("keydown", esc);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "auto";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
      />
      <div className="relative z-[110] w-full max-w-xl bg-neutral-950 border border-white/10 rounded-2xl p-5">
        {children}
      </div>
    </div>
  );
}

/* ================= SP TIME ================= */
function getNowSP() {
  const now = new Date();
  return new Date(
    now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
}

function formatDate(dt) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

/* ================= COMPONENT ================= */
export default function Scheduler() {
  const token = localStorage.getItem("zf_token");

  const [jobs, setJobs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [sessions, setSessions] = useState([]);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);

  const [toast, setToast] = useState({ show: false });

  const emptyForm = {
    instance_name: "",
    phone: "",
    template_id: "",
    schedule_at: ""
  };

  const [form, setForm] = useState(emptyForm);
  const [vars, setVars] = useState({});

  /* ================= TOAST ================= */
  function showToast(message, type = "success") {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false }), 2500);
  }

  /* ================= LOAD ================= */
  async function loadJobs() {
    const r = await fetch("https://http://localhost:8000/api/scheduler/list", {
      headers: { Authorization: "Bearer " + token }
    });
    setJobs(await r.json());
  }

  async function loadTemplates() {
    const r = await fetch("https://http://localhost:8000/api/templates", {
      headers: { Authorization: "Bearer " + token }
    });
    setTemplates(await r.json());
  }

  async function loadSessions() {
    const r = await fetch("https://http://localhost:8000/api/whatsapp/sessions", {
      headers: { Authorization: "Bearer " + token }
    });
    setSessions(await r.json());
  }

  useEffect(() => {
    loadJobs();
    loadTemplates();
    loadSessions();
  }, []);

  /* ================= TEMPLATE ================= */
  const selectedTemplate = useMemo(() => {
    return templates.find(t => t.id === form.template_id) || null;
  }, [form.template_id, templates]);

  const variables = useMemo(() => {
    const text = selectedTemplate?.versions?.[0];
    if (!text) return [];

    const matches = [...text.matchAll(/\{(\w+)\}/g)];
    return [...new Set(matches.map(m => m[1]))];
  }, [selectedTemplate]);

  function setVar(k, v) {
    setVars(prev => ({ ...prev, [k]: v }));
  }

  /* ================= RESET ================= */
  function resetForm() {
    setForm(emptyForm);
    setVars({});
    setView(null);
  }

  function openCreate() {
    resetForm(); // 👈 SEMPRE LIMPA AO ABRIR
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    resetForm();
  }

  /* ================= VALIDATION ================= */
  function validate() {
    if (!form.instance_name) return "Selecione a instância";
    if (!form.phone) return "Informe o telefone";
    if (!form.template_id) return "Selecione o template";
    if (!form.schedule_at) return "Defina data e hora";

    const selected = new Date(form.schedule_at);
    const now = getNowSP();

    if (selected < now) {
      return "Não é possível agendar no passado";
    }

    for (const v of variables) {
      if (!vars[v]) return `Preencha: ${v}`;
    }

    return null;
  }

  function getUser() {
    try {
      const raw = localStorage.getItem("zf_user");
      if (!raw) return null;

      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /* ================= CREATE ================= */
 async function createJob() {
  const error = validate();
  if (error) return showToast(error, "error");

  const user = getUser();

  if (!user?.id) {
    return showToast("Usuário inválido", "error");
  }

  const payload = {
    user_id: user.id,
    schedule_at: form.schedule_at,
    payload: {
      instance_name: form.instance_name,
      phone: form.phone,
      template_name: selectedTemplate?.name,
      ...vars
    }
  };

  await apiClient.post("/scheduler/create", payload);

  closeModal();
  loadJobs();
  showToast("Agendamento criado com sucesso 🚀");
}

function StatusBadge({ status }) {
  const s = (status || "").toLowerCase();

  const styles = {
    concluida: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    pending: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    error: "bg-red-500/10 text-red-400 border-red-500/20",
    default: "bg-neutral-500/10 text-neutral-300 border-neutral-500/20",
  };

  const cls = styles[s] || styles.default;

  return (
    <span
      className={`items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}
    >
      {status}
    </span>
  );
}

function getMinDateTimeLocalSP() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );

  const pad = (n) => String(n).padStart(2, "0");

  return (
    now.getFullYear() +
    "-" +
    pad(now.getMonth() + 1) +
    "-" +
    pad(now.getDate()) +
    "T" +
    pad(now.getHours()) +
    ":" +
    pad(now.getMinutes())
  );
}

  async function deleteJob(id) {
    await apiClient.delete(`/scheduler/${id}`);
    loadJobs();
    showToast("Removido com sucesso");
  }

  /* ================= PREVIEW ================= */
  function buildPreview(job) {
    const tpl = templates.find(t => t.name === job.payload?.template_name);
    let msg = tpl?.versions?.[0] || "Template não encontrado";

    Object.entries(job.payload || {}).forEach(([k, v]) => {
      msg = msg.replaceAll(`{${k}}`, v);
    });

    return msg;
  }

  /* ================= UI ================= */
  return (
    <div className="p-6 max-w-6xl mx-auto text-white">

      <Toast toast={toast} onClose={() => setToast({ show: false })} />

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">⚡ Scheduler Pro</h2>

        <button
          onClick={openCreate}
          className="bg-white text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-neutral-200"
        >
          <Plus size={16} />
          Novo agendamento
        </button>
      </div>

  {/* TABLE WRAPPER CENTRALIZADO */}
  <div className="flex justify-center items-start py-6">

    <div className="w-full max-w-6xl border border-neutral-800 rounded-xl overflow-hidden">

      {/* HEADER */}
      <div className="hidden md:grid grid-cols-6 bg-neutral-900 p-3 text-xs text-neutral-400 text-center">
        <div>Contato</div>
        <div>Status</div>
        <div>Instância</div>
        <div>Template</div>
        <div>Data</div>
        <div>Ações</div>
      </div>

      {/* SCROLL CONTROLADO */}
      <div className="max-h-[70vh] overflow-y-auto">

        {[...jobs]
          .sort((a, b) => new Date(b.schedule_at) - new Date(a.schedule_at))
          .map(j => (
            <div key={j.id} className="border-t border-neutral-800">

          {/* 📱 MOBILE PROFISSIONAL (HIERARQUIA CLARA) */}
          <div className="md:hidden p-4">

            {/* CARD */}
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden">

              {/* HEADER DO CARD */}
              <div className="flex justify-between items-start p-3 border-b border-neutral-800">

                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">
                    {j.payload?.nome || "Sem nome"}
                  </div>

                  <div className="text-xs text-neutral-400 mt-0.5">
                    {j.payload?.phone}
                  </div>
                </div>

                <StatusBadge status={j?.status} />

              </div>

              {/* BODY (DADOS ORGANIZADOS) */}
              <div className="p-3 space-y-3">

                {/* ITEM 1 */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">Instância</span>
                  <span className="text-xs text-white text-right max-w-[65%] truncate">
                    {j.payload?.instance_name}
                  </span>
                </div>

                {/* ITEM 2 */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">Template</span>
                  <span className="text-xs text-white text-right max-w-[65%] truncate">
                    {j.payload?.template_name}
                  </span>
                </div>

                {/* ITEM 3 */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">Agendado</span>
                  <span className="text-xs text-white text-right">
                    {formatDate(j.schedule_at)}
                  </span>
                </div>

              </div>

              {/* FOOTER (AÇÕES FIXAS) */}
              <div className="flex justify-end gap-3 p-3 border-t border-neutral-800 bg-black/20">

                <button
                  onClick={() => setView(j)}
                  className="text-blue-400 text-xs font-medium flex items-center gap-1 hover:text-blue-300"
                >
                  <Eye size={15} />
                  Detalhes
                </button>

                <button
                  onClick={() => deleteJob(j.id)}
                  className="text-red-400 text-xs font-medium flex items-center gap-1 hover:text-red-300"
                >
                  <Trash2 size={15} />
                  Excluir
                </button>

              </div>

            </div>
          </div>

              {/* 🖥️ DESKTOP */}
            <div className="hidden md:grid grid-cols-6 p-3 text-sm items-center text-center">

              {/* Contato */}
              <div className="flex flex-col items-center justify-center text-center">
                <span className="font-medium">
                  {j.payload?.nome || "Sem nome"}
                </span>
                <span className="text-xs text-neutral-400">
                  {j.payload?.phone}
                </span>
              </div>

              {/* Status */}
              <div className="flex justify-center items-center">
                <StatusBadge status={j?.status} />
              </div>

              {/* Instância */}
              <div className="flex items-center justify-center text-center">
                {j.payload?.instance_name}
              </div>

              {/* Template */}
              <div className="flex items-center justify-center text-center">
                {j.payload?.template_name}
              </div>

              {/* Data */}
              <div className="flex items-center justify-center text-center">
                {formatDate(j.schedule_at)}
              </div>

              {/* Ações */}
              <div className="flex justify-center items-center gap-3">
                <button onClick={() => setView(j)} className="text-blue-400">
                  <Eye size={16} />
                </button>

                <button onClick={() => deleteJob(j.id)}>
                  <Trash2 size={16} className="text-red-400" />
                </button>
              </div>

            </div>

            </div>
          ))}

      </div>

    </div>
  </div>

      {/* VIEW */}
      <Modal open={!!view} onClose={() => setView(null)}>
        {view && (
          <div className="space-y-3">
            <h2 className="font-semibold">Pré-visualização</h2>

            <div className="text-xs bg-neutral-900 p-3 rounded">
              📞 {view.payload?.phone}<br />
              🏢 {view.payload?.instance_name}<br />
              ⏰ {formatDate(view.schedule_at)}
            </div>

            <div className="bg-black border border-neutral-800 p-3 rounded text-sm whitespace-pre-wrap">
              {buildPreview(view)}
            </div>
          </div>
        )}
      </Modal>

      {/* CREATE */}
      <Modal open={open} onClose={closeModal}>
        <h2 className="text-lg font-semibold mb-3">Novo agendamento</h2>

        <div className="grid grid-cols-2 gap-3">

          <select
            className="bg-neutral-900 p-2 rounded"
            onChange={e => setForm({ ...form, instance_name: e.target.value })}
          >
            <option>Instância</option>
            {sessions.map(s => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>

          <input
            placeholder="Telefone"
            className="bg-neutral-900 p-2 rounded"
            onChange={e => setForm({ ...form, phone: e.target.value })}
          />

          <select
            className="bg-neutral-900 p-2 rounded"
            onChange={e => setForm({ ...form, template_id: e.target.value })}
          >
            <option>Template</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <input
            type="datetime-local"
            min={getMinDateTimeLocalSP()}
            className="bg-neutral-900 p-2 rounded"
            onChange={e => setForm({ ...form, schedule_at: e.target.value })}
          />

          {variables.length > 0 && (
            <div className="col-span-2 grid grid-cols-2 gap-2">
              {variables.map(v => (
                <input
                  key={v}
                  placeholder={v}
                  className="bg-neutral-800 p-2 rounded text-sm"
                  onChange={e => setVar(v, e.target.value)}
                />
              ))}
            </div>
          )}

        </div>

        <button
          onClick={createJob}
          className="w-full mt-4 bg-white text-black py-2 rounded-lg font-bold"
        >
          Salvar agendamento
        </button>

      </Modal>

    </div>
  );
}