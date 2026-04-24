import React, { useMemo } from "react";
import { Check, CheckCheck } from "lucide-react";

const renderWithVars = (text) => {
  if (!text) return null;
  const parts = text.split(/(\{nome\}|\{veiculo\}|\{servico\})/g);
  return parts.map((p, i) => {
    if (/^\{\w+\}$/.test(p)) {
      return (
        <span key={i} className="bg-black/25 text-[#00E676] font-mono text-[11px] px-1 py-0.5 rounded mx-0.5">
          {p}
        </span>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
};

export default function WhatsAppChatPreview({ text, contactName = "Maria Silva", hasAudio = false }) {
  const time = useMemo(() => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }, []);

  return (
    <div className="bg-[#0b141a] border border-neutral-800 rounded-xl overflow-hidden flex flex-col h-full min-h-[420px] shadow-2xl">
      {/* Header */}
      <div className="bg-[#202c33] px-4 py-3 flex items-center gap-3 border-b border-black/40">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#25D366] to-[#0d8a3f] flex items-center justify-center text-sm font-bold text-white">
          {contactName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-semibold truncate">{contactName}</div>
          <div className="text-[11px] text-neutral-400">online</div>
        </div>
        <div className="text-neutral-500 text-xs font-mono">{time}</div>
      </div>

      {/* Chat area */}
      <div
        className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      >
        {/* Incoming (sample) */}
        <div className="self-start bg-[#202c33] text-white px-3 py-2 rounded-lg rounded-tl-none max-w-[82%] text-sm shadow">
          Oi, tudo bem?
          <div className="text-[10px] text-neutral-400 text-right mt-1">{time}</div>
        </div>

        {/* Outgoing - our message */}
        <div className="self-end bg-[#005c4b] text-white px-3 py-2 rounded-lg rounded-tr-none max-w-[82%] text-sm shadow animate-fade-up">
          <div className="whitespace-pre-wrap break-words">
            {renderWithVars(text || "Digite sua mensagem para ver o preview...")}
          </div>
          {hasAudio && (
            <div className="mt-2 bg-black/20 rounded-md p-2 flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-[#25D366]/30 flex items-center justify-center">
                <div className="w-0 h-0 border-l-[6px] border-l-[#25D366] border-y-[4px] border-y-transparent ml-0.5" />
              </div>
              <div className="flex-1 flex items-end gap-0.5 h-5">
                {[3, 6, 10, 8, 12, 7, 14, 9, 5, 11, 6, 8, 13, 7, 4].map((h, i) => (
                  <div key={i} className="w-0.5 bg-[#25D366]/70 rounded" style={{ height: `${h}px` }} />
                ))}
              </div>
              <span className="font-mono text-[10px] text-neutral-300">0:08</span>
            </div>
          )}
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-neutral-300">{time}</span>
            <CheckCheck size={12} className="text-[#53bdeb]" />
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="bg-[#202c33] px-3 py-2 flex items-center gap-2 border-t border-black/40">
        <div className="flex-1 bg-[#2a3942] text-neutral-400 px-3 py-2 rounded-full text-xs">
          Preview somente leitura
        </div>
        <div className="h-8 w-8 rounded-full bg-[#25D366] flex items-center justify-center">
          <Check size={14} className="text-[#202c33]" strokeWidth={3} />
        </div>
      </div>
    </div>
  );
}
