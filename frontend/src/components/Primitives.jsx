import React from "react";

export function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
      <div>
        {eyebrow && (
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500 mb-3">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-neutral-400 mt-2 max-w-2xl text-sm sm:text-base">
            {subtitle}
          </p>
        )}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function MetricCard({ label, value, hint, accent, icon: Icon, testid }) {
  return (
    <div
      data-testid={testid}
      className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5 hover:-translate-y-0.5 hover:border-neutral-700 transition-all duration-300 group"
    >
      <div className="flex items-start justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
          {label}
        </div>
        {Icon && <Icon size={16} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />}
      </div>
      <div className={`mt-4 font-mono text-3xl font-bold tracking-tight ${accent || "text-neutral-50"}`}>
        {value}
      </div>
      {hint && <div className="text-xs text-neutral-500 mt-1">{hint}</div>}
    </div>
  );
}

export function Empty({ title, subtitle, action }) {
  return (
    <div className="border border-dashed border-neutral-800 rounded-lg p-12 text-center">
      <div className="font-display text-xl font-bold text-neutral-300">{title}</div>
      {subtitle && <div className="text-sm text-neutral-500 mt-2 max-w-md mx-auto">{subtitle}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Pill({ children, variant = "default" }) {
  const variants = {
    default: "bg-neutral-800 text-neutral-300 border-neutral-700",
    green: "bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    sky: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${variants[variant]}`}>
      {children}
    </span>
  );
}
