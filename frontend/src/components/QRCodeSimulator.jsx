import React, { useMemo } from "react";

/**
 * Renders a QR-code-like grid from a seed string (deterministic pattern).
 * Purely CSS so it feels real without an external QR library.
 */
export default function QRCodeSimulator({ pattern, size = 22 }) {
  const cells = useMemo(() => {
    if (!pattern) return [];
    const arr = pattern.split("").map((c) => c === "1");
    // Add corner squares (finder patterns)
    const out = arr.slice(0, size * size);
    const idx = (r, c) => r * size + c;
    const drawFinder = (r0, c0) => {
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          const border = r === 0 || r === 6 || c === 0 || c === 6;
          out[idx(r0 + r, c0 + c)] = inner || border;
        }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);
    return out;
  }, [pattern, size]);

  return (
    <div className="relative aspect-square w-full bg-white p-4 rounded-lg overflow-hidden">
      <div
        className="grid h-full w-full gap-0"
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      >
        {cells.map((on, i) => (
          <div key={i} className={`qr-cell ${on ? "bg-neutral-950" : "bg-white"}`} />
        ))}
      </div>
      {/* Scan line */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-x-0 h-1 bg-[#25D366]/70 blur-[2px] animate-scan" />
      </div>
    </div>
  );
}
