import React, { useEffect } from "react";

export default function Modal({ open, onClose, children }) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };

    if (open) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "auto";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Overlay */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-xl animate-fadeIn"
      />

      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-xl rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-gradient-to-b dark:from-neutral-900 dark:to-neutral-950 shadow-2xl animate-scaleIn"
      >
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}