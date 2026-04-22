import React, { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { PageHeader, Empty, Pill } from "../components/Primitives";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function TemplatesPage() {
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", versions: [""], tone: "venda" });

  const load = async () => { const r = await apiClient.get("/templates"); setItems(r.data); };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    await apiClient.post("/templates", { ...form, versions: form.versions.filter(Boolean) });
    toast.success("Template salvo");
    setForm({ name: "", versions: [""], tone: "venda" });
    setShow(false);
    load();
  };
  const del = async (id) => {
    if (!window.confirm("Excluir template?")) return;
    await apiClient.delete(`/templates/${id}`);
    load();
  };

  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto">
      <PageHeader eyebrow="Biblioteca" title="Templates de mensagem" subtitle="Salve templates reutilizáveis com variações para rotação anti-spam.">
        <button onClick={() => setShow((s) => !s)} data-testid="new-template-button" className="bg-white text-neutral-950 hover:bg-neutral-200 px-4 py-2.5 rounded-md text-sm font-bold flex items-center gap-2">
          <Plus size={15} /> Novo template
        </button>
      </PageHeader>

      {show && (
        <form onSubmit={save} className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5 mb-6 space-y-3">
          <input required placeholder="Nome do template" className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="template-name-input" />
          <select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm">
            <option value="venda">Venda</option>
            <option value="formal">Formal</option>
            <option value="recuperacao">Recuperação</option>
          </select>
          {form.versions.map((v, i) => (
            <div key={i} className="flex gap-2">
              <textarea rows={2} placeholder={`Variação ${i + 1}`} value={v} onChange={(e) => { const c = [...form.versions]; c[i] = e.target.value; setForm({ ...form, versions: c }); }} className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm font-mono" data-testid={`template-version-${i}`} />
              {form.versions.length > 1 && <button type="button" onClick={() => setForm({ ...form, versions: form.versions.filter((_, j) => j !== i) })} className="text-neutral-500 hover:text-red-400"><Trash2 size={14} /></button>}
            </div>
          ))}
          <button type="button" onClick={() => setForm({ ...form, versions: [...form.versions, ""] })} className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"><Plus size={12} /> Adicionar variação</button>
          <div className="flex gap-2">
            <button type="submit" className="bg-white text-neutral-950 hover:bg-neutral-200 px-4 py-2 rounded-md text-sm font-bold" data-testid="save-template-button">Salvar</button>
            <button type="button" onClick={() => setShow(false)} className="text-sm text-neutral-400">Cancelar</button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <Empty title="Sem templates" subtitle="Crie templates de mensagem prontos para reuso." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((t) => (
            <div key={t.id} className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5" data-testid={`template-card-${t.id}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <Pill>{t.tone}</Pill>
                  <div className="font-display text-lg font-bold mt-2">{t.name}</div>
                  <div className="text-[11px] text-neutral-500 font-mono mt-1">{t.versions.length} variações</div>
                </div>
                <button onClick={() => del(t.id)} className="text-neutral-600 hover:text-red-400"><Trash2 size={14} /></button>
              </div>
              <div className="space-y-2">
                {t.versions.slice(0, 2).map((v, i) => (
                  <div key={i} className="bg-neutral-950 border border-neutral-800/70 rounded p-2 text-xs font-mono text-neutral-300 whitespace-pre-wrap line-clamp-3">{v}</div>
                ))}
                {t.versions.length > 2 && <div className="text-[11px] text-neutral-500">+ {t.versions.length - 2} mais...</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
