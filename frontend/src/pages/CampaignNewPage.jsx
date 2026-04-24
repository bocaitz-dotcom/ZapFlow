import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../lib/api";
import { PageHeader, Pill } from "../components/Primitives";
import WhatsAppChatPreview from "../components/WhatsAppChatPreview";
import { Sparkles, Plus, X, Mic, Save, Loader2, Play } from "lucide-react";
import { toast } from "sonner";

const VARS = ["{nome}", "{veiculo}", "{servico}"];
const TONES = [
  { v: "formal", label: "Formal" },
  { v: "venda", label: "Venda" },
  { v: "recuperacao", label: "Recuperação" },
];
const VOICES = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];

export default function CampaignNewPage() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [versions, setVersions] = useState([""]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [tone, setTone] = useState("venda");
  const [context, setContext] = useState("");
  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [sendType, setSendType] = useState("texto");
  const [voice, setVoice] = useState("alloy");
  const [delayMin, setDelayMin] = useState(3);
  const [delayMax, setDelayMax] = useState(15);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audioB64, setAudioB64] = useState(null);
  const [ttsLoading, setTtsLoading] = useState(false);

  useEffect(() => {
    apiClient.get("/contacts").then((r) => setContacts(r.data));
    apiClient.get("/whatsapp/sessions").then((r) => setSessions(r.data));
  }, []);

  const insertVar = (v) => {
    const copy = [...versions];
    copy[activeIdx] = (copy[activeIdx] || "") + " " + v;
    setVersions(copy);
  };

  const aiSuggest = async () => {
    if (!context.trim()) { toast.error("Descreva o contexto do seu negócio"); return; }
    setAiLoading(true);
    try {
      const r = await apiClient.post("/ai/suggest", { context, tone, variations: 3 });
      setVersions(r.data.variations);
      toast.success("IA gerou 3 variações");
    } catch (err) { toast.error(err?.response?.data?.detail || "Falha na IA"); }
    finally { setAiLoading(false); }
  };

  const generateTTS = async () => {
    const sample = (versions[activeIdx] || "")
      .replace(/\{nome\}/g, "João")
      .replace(/\{veiculo\}/g, "seu veículo")
      .replace(/\{servico\}/g, "nosso serviço");
    if (!sample.trim()) { toast.error("Escreva uma mensagem"); return; }
    setTtsLoading(true);
    try {
      const r = await apiClient.post("/ai/tts", { text: sample, voice, model: "tts-1" });
      setAudioB64(r.data.audio_base64);
      toast.success("Áudio gerado!");
    } catch (err) { toast.error(err?.response?.data?.detail || "Falha TTS"); }
    finally { setTtsLoading(false); }
  };

  const save = async (andStart = false) => {
    if (!name || versions.filter(Boolean).length === 0) {
      toast.error("Nome e ao menos 1 mensagem são obrigatórios"); return;
    }
    if (selectedContacts.length === 0) { toast.error("Selecione contatos"); return; }
    if (selectedSessions.length === 0) { toast.error("Selecione ao menos 1 conexão WhatsApp"); return; }
    setSaving(true);
    try {
      const payload = {
        name,
        message_versions: versions.filter(Boolean),
        contact_ids: selectedContacts,
        session_ids: selectedSessions,
        send_type: sendType,
        audio_voice: voice,
        delay_min: delayMin,
        delay_max: delayMax,
        hourly_limit: 60,
      };
      const r = await apiClient.post("/campaigns", payload);
      if (andStart) {
        await apiClient.post(`/campaigns/${r.data.id}/start`);
        toast.success("Campanha criada e iniciada!");
      } else {
        toast.success("Campanha salva!");
      }
      nav("/app/campanhas");
    } catch (err) { toast.error(err?.response?.data?.detail || "Falha"); }
    finally { setSaving(false); }
  };

  const toggleAll = (list, selected, setter) => {
    setter(selected.length === list.length ? [] : list.map((x) => x.id));
  };

  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto">
      <PageHeader eyebrow="Nova campanha" title="Editor de disparo" subtitle="Crie variações de mensagens com IA, variáveis dinâmicas e preview real."/>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        {/* LEFT: editor */}
        <div className="space-y-6">
          <Card>
            <div className="mb-3">
              <label className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1.5 block">Nome da campanha</label>
              <input data-testid="campaign-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Black Friday - Revisão" className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-4 py-2.5 text-sm focus:ring-1 focus:ring-white/50 focus:outline-none" />
            </div>
          </Card>

          {/* AI */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} className="text-[#25D366]" />
              <div className="font-display font-bold">Assistente de copywriting</div>
              <Pill variant="green">Claude Sonnet 4.5</Pill>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
              {TONES.map((t) => (
                <button key={t.v} onClick={() => setTone(t.v)} data-testid={`tone-${t.v}`} className={`text-xs font-semibold py-2 rounded-md border transition-colors ${tone === t.v ? "bg-white text-neutral-950 border-white" : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-600"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <textarea data-testid="ai-context-input" value={context} onChange={(e) => setContext(e.target.value)} rows={2} placeholder="Contexto: ex. Oficina mecânica AlphaMech oferecendo revisão de 10 mil km com 15% off" className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/50" />
            <button onClick={aiSuggest} disabled={aiLoading} data-testid="ai-generate-button" className="mt-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2">
              {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Gerar 3 variações com IA
            </button>
          </Card>

          {/* Versions editor */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="font-display font-bold">Mensagens (randomização anti-spam)</div>
              <button onClick={() => { setVersions([...versions, ""]); setActiveIdx(versions.length); }} data-testid="add-version-button" className="text-xs text-neutral-400 hover:text-white flex items-center gap-1">
                <Plus size={13} /> Nova versão
              </button>
            </div>
            <div className="flex gap-1 mb-2 flex-wrap">
              {versions.map((_, i) => (
                <button key={i} onClick={() => setActiveIdx(i)} data-testid={`version-tab-${i}`} className={`text-xs font-mono px-2.5 py-1 rounded border ${activeIdx === i ? "bg-white text-neutral-950 border-white" : "bg-neutral-950 border-neutral-800 text-neutral-400"}`}>
                  v{i + 1}
                  {versions.length > 1 && (
                    <span onClick={(e) => { e.stopPropagation(); const c = versions.filter((_, j) => j !== i); setVersions(c); setActiveIdx(0); }} className="ml-1 text-neutral-500 hover:text-red-400"><X size={10} className="inline" /></span>
                  )}
                </button>
              ))}
            </div>
            <textarea data-testid={`version-textarea-${activeIdx}`} value={versions[activeIdx] || ""} onChange={(e) => { const c = [...versions]; c[activeIdx] = e.target.value; setVersions(c); }} rows={5} placeholder='Olá {nome}, tudo bem? Aqui é da AlphaMech! Vimos que {veiculo} pode precisar de revisão 🚗' className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-white/50" />
            <div className="flex gap-2 mt-2 flex-wrap">
              {VARS.map((v) => (
                <button key={v} onClick={() => insertVar(v)} className="text-[11px] font-mono bg-black/30 hover:bg-black/60 text-[#00E676] px-2 py-1 rounded border border-[#00E676]/20">
                  {v}
                </button>
              ))}
            </div>
          </Card>

          {/* Audio */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Mic size={15} />
                <div className="font-display font-bold">Áudio (opcional)</div>
              </div>
              <select value={voice} onChange={(e) => setVoice(e.target.value)} data-testid="voice-select" className="bg-neutral-950 border border-neutral-800 rounded-md px-3 py-1.5 text-xs font-mono">
                {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
              {["texto", "audio", "ambos"].map((t) => (
                <button key={t} onClick={() => setSendType(t)} data-testid={`send-type-${t}`} className={`text-xs font-semibold py-2 rounded-md border capitalize transition-colors ${sendType === t ? "bg-[#25D366] text-neutral-950 border-[#25D366]" : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-600"}`}>
                  {t}
                </button>
              ))}
            </div>
            <button onClick={generateTTS} disabled={ttsLoading} data-testid="generate-tts-button" className="bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2">
              {ttsLoading ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
              Gerar prévia de áudio
            </button>
            {audioB64 && (
              <audio controls className="mt-3 w-full" data-testid="audio-preview">
                <source src={`data:audio/mp3;base64,${audioB64}`} type="audio/mp3" />
              </audio>
            )}
          </Card>

          {/* Contacts + sessions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <div className="font-display font-bold">Contatos ({selectedContacts.length}/{contacts.length})</div>
                <button onClick={() => toggleAll(contacts, selectedContacts, setSelectedContacts)} data-testid="select-all-contacts" className="text-xs text-neutral-400 hover:text-white">
                  {selectedContacts.length === contacts.length ? "Limpar" : "Todos"}
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {contacts.length === 0 && <div className="text-xs text-neutral-500 py-4 text-center">Nenhum contato. Adicione na aba Contatos.</div>}
                {contacts.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm py-1.5 px-2 hover:bg-neutral-900 rounded cursor-pointer">
                    <input type="checkbox" data-testid={`select-contact-${c.id}`} checked={selectedContacts.includes(c.id)} onChange={(e) => setSelectedContacts(e.target.checked ? [...selectedContacts, c.id] : selectedContacts.filter((x) => x !== c.id))} className="accent-[#25D366]" />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="font-mono text-[11px] text-neutral-500">{c.phone}</span>
                  </label>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-3">
                <div className="font-display font-bold">Conexões ({selectedSessions.length}/{sessions.length})</div>
                <button onClick={() => toggleAll(sessions, selectedSessions, setSelectedSessions)} className="text-xs text-neutral-400 hover:text-white">
                  {selectedSessions.length === sessions.length ? "Limpar" : "Todas"}
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {sessions.length === 0 && <div className="text-xs text-neutral-500 py-4 text-center">Nenhuma conexão. Crie em WhatsApp.</div>}
                {sessions.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm py-1.5 px-2 hover:bg-neutral-900 rounded cursor-pointer">
                    <input type="checkbox" data-testid={`select-session-${s.id}`} checked={selectedSessions.includes(s.id)} onChange={(e) => setSelectedSessions(e.target.checked ? [...selectedSessions, s.id] : selectedSessions.filter((x) => x !== s.id))} className="accent-[#25D366]" />
                    <span className="flex-1 truncate">{s.name}</span>
                    <Pill variant={s.status === "conectado" ? "green" : "red"}>{s.status}</Pill>
                  </label>
                ))}
              </div>
            </Card>
          </div>

          {/* Anti-block */}
          <Card>
            <div className="font-display font-bold mb-3">Anti-bloqueio</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-neutral-500">Delay mínimo (s)</label>
                <input type="number" min={1} max={60} value={delayMin} onChange={(e) => setDelayMin(+e.target.value)} data-testid="delay-min-input" className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm font-mono mt-1" />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Delay máximo (s)</label>
                <input type="number" min={1} max={120} value={delayMax} onChange={(e) => setDelayMax(+e.target.value)} data-testid="delay-max-input" className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm font-mono mt-1" />
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex gap-3 sticky bottom-0 pt-2 pb-4 bg-neutral-950">
            <button onClick={() => save(false)} disabled={saving} data-testid="save-campaign-button" className="flex-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 rounded-md py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar rascunho
            </button>
            <button onClick={() => save(true)} disabled={saving} data-testid="save-and-start-button" className="flex-1 bg-[#25D366] text-neutral-950 hover:bg-[#1ebe5c] rounded-md py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Salvar e disparar
            </button>
          </div>
        </div>

        {/* RIGHT: preview */}
        <div className="lg:sticky lg:top-6 self-start">
          <div className="text-[10px] uppercase tracking-[0.25em] text-neutral-500 mb-2">Preview · variações rotacionam</div>
          <WhatsAppChatPreview
            text={versions[activeIdx]}
            hasAudio={sendType !== "texto"}
          />
        </div>
      </div>
    </div>
  );
}

function Card({ children }) {
  return <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5">{children}</div>;
}
