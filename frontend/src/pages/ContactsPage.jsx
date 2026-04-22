import React, { useEffect, useState, useRef } from "react";
import { apiClient } from "../lib/api";
import { PageHeader, Empty } from "../components/Primitives";
import { Plus, Upload, Search, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ContactsPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", vehicle: "", service: "" });
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const load = async () => {
    const r = await apiClient.get("/contacts", { params: { search: search || undefined } });
    setItems(r.data);
  };
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [search]);

  const add = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post("/contacts", form);
      toast.success("Contato adicionado");
      setForm({ name: "", phone: "", vehicle: "", service: "" });
      setShowForm(false);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Falha"); }
  };

  const del = async (id) => {
    if (!window.confirm("Excluir este contato?")) return;
    await apiClient.delete(`/contacts/${id}`);
    load();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await apiClient.post("/contacts/import-csv", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`${r.data.imported} importados, ${r.data.skipped} ignorados`);
      load();
    } catch (err) { toast.error("Falha no upload"); }
    finally { setUploading(false); e.target.value = ""; }
  };

  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto">
      <PageHeader eyebrow="CRM" title="Contatos" subtitle="Importe via CSV ou adicione manualmente. Variáveis disponíveis: {nome}, {veiculo}, {servico}.">
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFile} data-testid="csv-file-input" />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          data-testid="import-csv-button"
          className="bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 px-4 py-2.5 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          Importar CSV
        </button>
        <button
          onClick={() => setShowForm((s) => !s)}
          data-testid="add-contact-button"
          className="bg-white text-neutral-950 hover:bg-neutral-200 px-4 py-2.5 rounded-md text-sm font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={15} /> Novo contato
        </button>
      </PageHeader>

      {showForm && (
        <form onSubmit={add} className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5 mb-6 grid grid-cols-1 md:grid-cols-5 gap-3" data-testid="contact-form">
          <input required placeholder="Nome" className="md:col-span-1 bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="contact-name-input" />
          <input required placeholder="Telefone (55DDDNUMERO)" className="md:col-span-1 bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm font-mono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="contact-phone-input" />
          <input placeholder="Veículo (opcional)" className="md:col-span-1 bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} />
          <input placeholder="Serviço (opcional)" className="md:col-span-1 bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />
          <button className="bg-white text-neutral-950 hover:bg-neutral-200 rounded-md px-4 py-2 text-sm font-bold" data-testid="save-contact-button">Salvar</button>
        </form>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={15} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          data-testid="contact-search-input"
          className="w-full bg-neutral-900/50 border border-neutral-800 rounded-md pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/50"
        />
      </div>

      {items.length === 0 ? (
        <Empty title="Nenhum contato ainda" subtitle="Importe um CSV com colunas Name,Phone ou adicione manualmente." />
      ) : (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 bg-neutral-900/50">
              <tr className="text-left text-neutral-500 text-[11px] uppercase tracking-wider">
                <th className="px-6 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium font-mono">Telefone</th>
                <th className="px-4 py-3 font-medium">Veículo</th>
                <th className="px-4 py-3 font-medium">Serviço</th>
                <th className="px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b border-neutral-800/50 hover:bg-neutral-900/40" data-testid={`contact-row-${c.id}`}>
                  <td className="px-6 py-3.5 font-medium">{c.name}</td>
                  <td className="px-4 py-3.5 font-mono text-neutral-300">{c.phone}</td>
                  <td className="px-4 py-3.5 text-neutral-400">{c.vehicle || "—"}</td>
                  <td className="px-4 py-3.5 text-neutral-400">{c.service || "—"}</td>
                  <td className="px-4 py-3.5 text-right">
                    <button onClick={() => del(c.id)} data-testid={`delete-contact-${c.id}`} className="text-neutral-500 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 text-xs text-neutral-500 font-mono">
        Formato CSV esperado: <span className="text-neutral-300">Name,Phone,Vehicle,Service</span>
      </div>
    </div>
  );
}
