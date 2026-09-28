import React from "react";

export function BanknoteSvg({ className = "", style = {} }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 320"
      width="100%"
      height="100%"
      className={className}
      style={style}
    >
      <defs>
        <filter id="bill-shadow" x="-10%" y="-10%" width="125%" height="130%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#061a0a" floodOpacity="0.4" />
        </filter>
        <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#76cc3c" />
          <stop offset="50%" stopColor="#5bae26" />
          <stop offset="100%" stopColor="#438e1a" />
        </linearGradient>
        <linearGradient id="inner-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3d7d1e" />
          <stop offset="100%" stopColor="#24540e" />
        </linearGradient>
        <linearGradient id="light-accent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a3f15f" />
          <stop offset="100%" stopColor="#6ecd2e" />
        </linearGradient>
        <linearGradient id="gold-symbol" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="25%" stopColor="#d4ff99" />
          <stop offset="100%" stopColor="#8ee43f" />
        </linearGradient>
      </defs>

      <g filter="url(#bill-shadow)">
        {/* Zewnętrzna obwódka */}
        <rect
          x="24"
          y="24"
          width="464"
          height="264"
          rx="26"
          ry="26"
          fill="url(#bg-grad)"
          stroke="#8df048"
          strokeWidth="2.5"
        />

        {/* Wewnętrzne ciemnozielone tło */}
        <path
          d="M 60 54 H 452 A 12 12 0 0 1 464 66 V 246 A 12 12 0 0 1 452 258 H 60 A 12 12 0 0 1 48 246 V 66 A 12 12 0 0 1 60 54 Z"
          fill="url(#inner-grad)"
        />

        {/* Ozdobny panel z wycięciami na rogach */}
        <path
          d="M 86 72 H 426 C 426 88 440 102 456 102 V 210 C 440 210 426 224 426 240 H 86 C 86 224 72 210 56 210 V 102 C 72 102 86 88 86 72 Z"
          fill="url(#light-accent)"
        />

        {/* Subtelny cień wewnętrzny */}
        <path
          d="M 98 84 H 414 C 414 96 424 106 436 106 V 206 C 424 206 414 216 414 228 H 98 C 98 216 88 206 76 206 V 106 C 88 106 98 96 98 84 Z"
          fill="url(#inner-grad)"
          opacity="0.18"
        />

        {/* Boczne kropki */}
        <circle cx="120" cy="156" r="22" fill="url(#inner-grad)" />
        <circle cx="120" cy="156" r="14" fill="url(#light-accent)" opacity="0.35" />

        <circle cx="392" cy="156" r="22" fill="url(#inner-grad)" />
        <circle cx="392" cy="156" r="14" fill="url(#light-accent)" opacity="0.35" />

        {/* Centralny medalion */}
        <circle cx="256" cy="156" r="68" fill="url(#inner-grad)" />
        <circle
          cx="256"
          cy="156"
          r="61"
          fill="none"
          stroke="url(#light-accent)"
          strokeWidth="2.5"
          strokeDasharray="6,4"
          opacity="0.7"
        />

        {/* Znak $ */}
        <rect x="251" y="112" width="10" height="88" rx="5" fill="url(#gold-symbol)" />
        <path
          d="M 280 134 C 280 123 270 116 256 116 C 241 116 230 124 230 137 C 230 152 242 157 262 161 C 278 164 286 171 286 182 C 286 195 272 203 256 203 C 239 203 227 194 226 180"
          fill="none"
          stroke="url(#gold-symbol)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Górny blik świetlny */}
        <path
          d="M 30 30 Q 256 40 482 30 A 24 24 0 0 1 486 48 Q 256 75 26 48 A 24 24 0 0 1 30 30 Z"
          fill="#ffffff"
          opacity="0.22"
        />
      </g>
    </svg>
  );
}

export default BanknoteSvg;
