import React from "react";

export function FgtChip({ small = false, className = "" }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[5px] font-black font-mono tracking-tight select-none ${
        small ? "w-4 h-4 text-[9px]" : "w-5 h-5 text-[11px]"
      } bg-amber-500/15 text-amber-400 border border-amber-400/30 ${className}`}
      aria-hidden="true"
    >
      $
    </span>
  );
}
