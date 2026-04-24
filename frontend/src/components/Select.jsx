import React, { useState, useRef, useEffect } from "react";

export default function Select({ value, onChange, options, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handleClick = (e) => {
      if (!ref.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="space-y-1">
      {label && <div className="text-xs text-neutral-400">{label}</div>}

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition
          border ${
            open
              ? "border-white/30 ring-2 ring-white/10"
              : "border-neutral-800 hover:border-neutral-700"
          }
          bg-neutral-950/80`}
        >
          <div className="flex items-center gap-2">
            <span>{selected?.icon}</span>
            <span>{selected?.label}</span>
          </div>

          <span className={`text-xs ${open ? "rotate-180" : ""}`}>▼</span>
        </button>

        {open && (
          <div className="absolute z-50 mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl overflow-hidden animate-scaleIn">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition ${
                  value === opt.value
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-300 hover:bg-neutral-800"
                }`}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}