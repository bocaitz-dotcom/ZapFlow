import React, { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { PageHeader, Empty } from "../components/Primitives";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import Modal from "../components/Modal";
import Select from "../components/Select";

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
      
      {/* 🔥 HEADER CORRETO */}
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

      {/* 🔥 MODAL */}
      <Modal open={show} onClose={resetModal}>
        <form onSubmit={save} className="space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold">
                {editingTemplate ? "Editar template" : "Novo template"}
              </h2>
              <p className="text-sm text-neutral-400">
                Crie mensagens reutilizáveis com variações
              </p>
            </div>

            <button type="button" onClick={resetModal}>
              ✕
            </button>
          </div>

          <input
            required
            placeholder="Nome do template"
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-white/20 outline-none"
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

          {/* VARIAÇÕES */}
          {form.versions.map((v, i) => (
            <div key={i} className="flex gap-2 items-start">
              <textarea
                rows={2}
                value={v}
                placeholder={`Variação ${i + 1}`}
                onChange={(e) => {
                  const c = [...form.versions];
                  c[i] = e.target.value;
                  setForm({ ...form, versions: c });
                }}
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-white/20 outline-none"
              />

              {form.versions.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const c = form.versions.filter((_, index) => index !== i);
                    setForm({ ...form, versions: c });
                  }}
                  className="mt-1 p-2 rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setForm({ ...form, versions: [...form.versions, ""] })
            }
            className="text-xs text-neutral-400 hover:text-white transition"
          >
            + Adicionar variação
          </button>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={resetModal}
              className="text-sm text-neutral-400 hover:text-white"
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="bg-white text-neutral-950 px-4 py-2 rounded-lg font-semibold hover:bg-neutral-200 transition"
            >
              {editingTemplate ? "Atualizar" : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>

      {/* 🔥 CARDS */}
      {items.length === 0 ? (
        <Empty title="Sem templates" subtitle="Crie seu primeiro template." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {items.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 p-5 transition hover:border-neutral-700 hover:shadow-xl"
            >
              {/* HEADER DO CARD */}
              <div className="flex justify-between mb-3">
                <div>
                  <div className="text-lg font-semibold">{t.name}</div>

                  <div className="mt-1 text-xs px-2 py-0.5 rounded-full bg-neutral-800 inline-flex gap-1">
                    {t.tone === "venda" && "💰"}
                    {t.tone === "formal" && "🧾"}
                    {t.tone === "recuperacao" && "♻️"}
                    {t.tone}
                  </div>
                </div>

                {/* 🔥 AÇÕES SEMPRE VISÍVEIS */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => edit(t)}
                    className="p-1.5 rounded-md text-neutral-400 hover:text-blue-400 hover:bg-blue-500/10 transition"
                  >
                    <Pencil size={14} />
                  </button>

                  <button
                    onClick={() => del(t.id)}
                    className="p-1.5 rounded-md text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* PREVIEW */}
              <div className="space-y-2">
                {t.versions?.slice(0, 2).map((v, i) => (
                  <div
                    key={i}
                    className="bg-neutral-950/70 border border-neutral-800/60 rounded-lg p-2 text-xs text-neutral-300 font-mono line-clamp-3"
                  >
                    {v}
                  </div>
                ))}

                {t.versions?.length > 2 && (
                  <div className="text-xs text-neutral-500">
                    + {t.versions.length - 2} variações
                  </div>
                )}
              </div>

              {/* FOOTER */}
              <div className="mt-4 flex justify-between text-xs text-neutral-500">
                <span>{t.versions?.length || 0} variações</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}