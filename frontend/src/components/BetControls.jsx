import React from "react";

export function FgtChip({ small = false, className = "" }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold font-mono tracking-tighter ${
        small ? "w-4 h-4 text-[9px]" : "w-5 h-5 text-[10px]"
      } bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-200 text-amber-950 border border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.4)] ${className}`}
      aria-hidden="true"
    >
      $
    </span>
  );
}
