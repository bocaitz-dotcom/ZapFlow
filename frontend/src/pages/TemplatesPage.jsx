import React, { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { PageHeader, Empty } from "../components/Primitives";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import Modal from "../components/Modal";
import Select from "../components/Select";

/* =========================
   VARIÁVEIS DE TEMPLATE
========================= */
const TEMPLATE_VARIABLES = [
  { label: "Nome", value: "{nome}" },
  { label: "Telefone", value: "{telefone}" },

  { label: "Veículo", value: "{veiculo}" },
  { label: "Placa", value: "{placa}" },
  { label: "Serviço", value: "{servico}" },

  { label: "Procedimento", value: "{procedimento}" },
  { label: "Dentista", value: "{dentista}" },
  { label: "Horário", value: "{horario}" },
  { label: "Data", value: "{data}" },

  { label: "Empresa", value: "{empresa}" },
  { label: "Cidade", value: "{cidade}" },

  { label: "Valor", value: "{valor}" },
  { label: "Desconto", value: "{desconto}" }
];

export default function TemplatesPage() {
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  const [form, setForm] = useState({
    name: "",
    versions: [""],
    tone: "venda"
  });

  const load = async () => {
    const r = await apiClient.get("/templates");
    setItems(r.data);
  };

  useEffect(() => {
    load();
  }, []);

  /* =========================
     INSERIR VARIÁVEL NO CURSOR
  ========================= */
  const insertVariable = (i, variable) => {
    const updated = [...form.versions];

    const textarea = document.getElementById(`template-${i}`);
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    updated[i] =
      updated[i].substring(0, start) +
      variable +
      updated[i].substring(end);

    setForm({ ...form, versions: updated });

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd =
        start + variable.length;
    }, 0);
  };

  const save = async (e) => {
    e.preventDefault();

    const payload = {
      ...form,
      versions: form.versions.filter(Boolean)
    };

    if (editingTemplate) {
      await apiClient.put(`/templates/${editingTemplate.id}`, payload);
      toast.success("Template atualizado");
    } else {
      await apiClient.post("/templates", payload);
      toast.success("Template salvo");
    }

    resetModal();
    load();
  };

  const del = async (id) => {
    if (!window.confirm("Excluir template?")) return;
    await apiClient.delete(`/templates/${id}`);
    load();
  };

  const edit = (t) => {
    setForm({
      name: t.name,
      versions: t.versions,
      tone: t.tone
    });
    setEditingTemplate(t);
    setShow(true);
  };

  const resetModal = () => {
    setShow(false);
    setEditingTemplate(null);
    setForm({ name: "", versions: [""], tone: "venda" });
  };

  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto">

      <PageHeader
        eyebrow="Biblioteca"
        title="Templates de mensagem"
        subtitle="Salve templates reutilizáveis com variações para rotação anti-spam."
      >
        <button
          onClick={() => {
            setEditingTemplate(null);
            setForm({ name: "", versions: [""], tone: "venda" });
            setShow(true);
          }}
          className="bg-white text-neutral-950 hover:bg-neutral-200 px-4 py-2.5 rounded-md text-sm font-bold flex items-center gap-2 transition"
        >
          <Plus size={15} /> Novo template
        </button>
      </PageHeader>

      {/* =========================
           MODAL
      ========================= */}
      <Modal open={show} onClose={resetModal}>
        <form onSubmit={save} className="space-y-4">

          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                {editingTemplate ? "Editar template" : "Novo template"}
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Crie mensagens reutilizáveis com variações
              </p>
            </div>

            <button type="button" onClick={resetModal}>✕</button>
          </div>

          <input
            required
            placeholder="Nome do template"
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
            className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
          />

          <Select
            label="Tom da mensagem"
            value={form.tone}
            onChange={(v) => setForm({ ...form, tone: v })}
            options={[
              { value: "venda", label: "Venda", icon: "💰" },
              { value: "formal", label: "Formal", icon: "🧾" },
              { value: "recuperacao", label: "Recuperação", icon: "♻️" }
            ]}
          />

          {/* =========================
               VARIAÇÕES
          ========================= */}
          {form.versions.map((v, i) => (
            <div key={i} className="space-y-2">

              <div className="flex gap-2 items-start">

                <textarea
                  id={`template-${i}`}
                  rows={2}
                  value={v}
                  placeholder={`Variação ${i + 1}`}
                  onChange={(e) => {
                    const c = [...form.versions];
                    c[i] = e.target.value;
                    setForm({ ...form, versions: c });
                  }}
                  className="flex-1 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-sm font-mono text-neutral-900 dark:text-neutral-100"
                />

                {form.versions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const c = form.versions.filter((_, index) => index !== i);
                      setForm({ ...form, versions: c });
                    }}
                    className="p-2 text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {/* =========================
                   VARIÁVEIS CLIQUE
              ========================= */}
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => insertVariable(i, v.value)}
                    className="text-[10px] px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700"
                  >
                    {v.label}
                  </button>
                ))}
              </div>

            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setForm({ ...form, versions: [...form.versions, ""] })
            }
            className="text-xs text-neutral-400"
          >
            + Adicionar variação
          </button>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={resetModal}>
              Cancelar
            </button>

            <button type="submit" className="bg-white text-black px-4 py-2 rounded-lg">
              {editingTemplate ? "Atualizar" : "Salvar"}
            </button>
          </div>

        </form>
      </Modal>

      {/* =========================
           LISTA
      ========================= */}
      {items.length === 0 ? (
        <Empty title="Sem templates" subtitle="Crie seu primeiro template." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">

          {items.map((t) => (
            <div key={t.id} className="border border-neutral-200 dark:border-neutral-800 p-5 rounded-xl bg-white dark:bg-neutral-900/30 shadow-sm">

              <div className="flex justify-between">
                <div>
                  <div className="font-semibold text-neutral-900 dark:text-neutral-100">{t.name}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">{t.tone}</div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => edit(t)}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => del(t.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {t.versions?.slice(0, 2).map((v, i) => (
                  <div key={i} className="text-xs text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-800">
                    {v}
                  </div>
                ))}
              </div>

            </div>
          ))}

        </div>
      )}

    </div>
  );
}