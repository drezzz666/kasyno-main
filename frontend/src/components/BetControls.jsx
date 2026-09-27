import React from "react";

export function FgtChip({ small = false, className = "" }) {
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-to-b from-yellow-400 to-yellow-600 text-white font-bold ${small ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm"} ${className}`}
    >
      <span className="text-shadow">F</span>
    </div>
  );
}
