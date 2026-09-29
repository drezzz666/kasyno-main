import React from "react";

export function BanknoteSvg({ className = "", style = {} }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 540 310"
      width="100%"
      height="100%"
      className={className}
      style={{
        filter: "drop-shadow(0 14px 28px rgba(0, 0, 0, 0.55)) drop-shadow(0 2px 6px rgba(16, 185, 129, 0.3))",
        ...style,
      }}
    >
      <defs>
        {/* Subtle Banknote Engraving Pattern (Guilloche) */}
        <pattern id="guilloche-waves" width="24" height="24" patternUnits="userSpaceOnUse">
          <path
            d="M 0 12 Q 6 4, 12 12 T 24 12 M 0 6 Q 6 14, 12 6 T 24 6 M 0 18 Q 6 26, 12 18 T 24 18"
            fill="none"
            stroke="#a3e635"
            strokeWidth="0.65"
            opacity="0.16"
          />
        </pattern>

        {/* Outer Banknote Gradient */}
        <linearGradient id="bill-base-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2e6822" />
          <stop offset="35%" stopColor="#1e4d17" />
          <stop offset="70%" stopColor="#163c10" />
          <stop offset="100%" stopColor="#0f2b0a" />
        </linearGradient>

        {/* Gold Border Foil Gradient */}
        <linearGradient id="gold-foil" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="30%" stopColor="#eab308" />
          <stop offset="70%" stopColor="#ca8a04" />
          <stop offset="100%" stopColor="#fef08a" />
        </linearGradient>

        {/* Inner Emerald Vignette Gradient */}
        <linearGradient id="inner-emerald" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1c4715" />
          <stop offset="100%" stopColor="#0b2408" />
        </linearGradient>

        {/* Center Seal Gradient */}
        <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2a661f" />
          <stop offset="75%" stopColor="#143b0e" />
          <stop offset="100%" stopColor="#0a2207" />
        </radialGradient>

        {/* Gold Text Gradient */}
        <linearGradient id="shiny-gold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#fef08a" />
          <stop offset="70%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#a16207" />
        </linearGradient>
      </defs>

      {/* 1. Outer Paper Base */}
      <rect
        x="12"
        y="12"
        width="516"
        height="286"
        rx="18"
        ry="18"
        fill="url(#bill-base-grad)"
        stroke="url(#gold-foil)"
        strokeWidth="2.5"
      />

      {/* 2. Guilloche Security Engraving Texture */}
      <rect
        x="16"
        y="16"
        width="508"
        height="278"
        rx="14"
        ry="14"
        fill="url(#guilloche-waves)"
      />

      {/* 3. Ornamental Filigree Border */}
      <rect
        x="32"
        y="28"
        width="476"
        height="254"
        rx="10"
        ry="10"
        fill="url(#inner-emerald)"
        stroke="#4ade80"
        strokeWidth="1.2"
        strokeDasharray="8 4"
        opacity="0.85"
      />

      {/* Corner Rosettes ($ Symbols & Geometric Emblems) */}
      <g fill="url(#shiny-gold)" fontFamily="'Inter', system-ui, sans-serif" fontWeight="900" fontSize="24">
        {/* Top-Left */}
        <text x="48" y="62" textAnchor="middle">$</text>
        <circle cx="48" cy="54" r="18" fill="none" stroke="url(#gold-foil)" strokeWidth="1.5" opacity="0.6" />

        {/* Top-Right */}
        <text x="492" y="62" textAnchor="middle">$</text>
        <circle cx="492" cy="54" r="18" fill="none" stroke="url(#gold-foil)" strokeWidth="1.5" opacity="0.6" />

        {/* Bottom-Left */}
        <text x="48" y="262" textAnchor="middle">$</text>
        <circle cx="48" cy="254" r="18" fill="none" stroke="url(#gold-foil)" strokeWidth="1.5" opacity="0.6" />

        {/* Bottom-Right */}
        <text x="492" y="262" textAnchor="middle">$</text>
        <circle cx="492" cy="254" r="18" fill="none" stroke="url(#gold-foil)" strokeWidth="1.5" opacity="0.6" />
      </g>

      {/* Side Decorative Medallions */}
      <circle cx="130" cy="155" r="28" fill="url(#center-glow)" stroke="url(#gold-foil)" strokeWidth="1.5" />
      <circle cx="130" cy="155" r="21" fill="none" stroke="#86efac" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
      <text x="130" y="161" fill="#86efac" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">2FGT</text>

      <circle cx="410" cy="155" r="28" fill="url(#center-glow)" stroke="url(#gold-foil)" strokeWidth="1.5" />
      <circle cx="410" cy="155" r="21" fill="none" stroke="#86efac" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
      <text x="410" y="161" fill="#86efac" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">VIP</text>

      {/* Center Oval Emblem Frame */}
      <ellipse
        cx="270"
        cy="155"
        rx="80"
        ry="95"
        fill="url(#center-glow)"
        stroke="url(#gold-foil)"
        strokeWidth="3.5"
      />
      <ellipse
        cx="270"
        cy="155"
        rx="72"
        ry="87"
        fill="none"
        stroke="#86efac"
        strokeWidth="1.5"
        strokeDasharray="6 4"
        opacity="0.8"
      />

      {/* Big Center Golden Currency Symbol ($) */}
      <g filter="drop-shadow(0 2px 8px rgba(0, 0, 0, 0.7))">
        {/* Vertical Bars */}
        <rect x="264" y="92" width="12" height="126" rx="6" fill="url(#shiny-gold)" />
        {/* S Path */}
        <path
          d="
            M 302 126
            C 302 108 288 98 270 98
            C 250 98 236 109 236 127
            C 236 148 252 156 278 162
            C 300 167 312 176 312 192
            C 312 211 294 222 270 222
            C 246 222 230 209 228 190
          "
          fill="none"
          stroke="url(#shiny-gold)"
          strokeWidth="18"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Top Banknote Header Text */}
      <text
        x="270"
        y="50"
        textAnchor="middle"
        fill="url(#shiny-gold)"
        fontSize="12"
        fontWeight="800"
        letterSpacing="3"
        fontFamily="sans-serif"
        opacity="0.95"
      >
        ★ 2FGT CASINO RESERVE NOTE ★
      </text>

      {/* Serial Number (Red Authentic Stamp Style) */}
      <text
        x="90"
        y="85"
        fill="#f87171"
        fontSize="10"
        fontWeight="700"
        fontFamily="monospace"
        letterSpacing="1.2"
        opacity="0.85"
      >
        № 777-WIN-FGT
      </text>

      <text
        x="375"
        y="235"
        fill="#f87171"
        fontSize="10"
        fontWeight="700"
        fontFamily="monospace"
        letterSpacing="1.2"
        opacity="0.85"
      >
        SERIES 2026
      </text>

      {/* Bottom Subtitle */}
      <text
        x="270"
        y="272"
        textAnchor="middle"
        fill="#86efac"
        fontSize="11"
        fontWeight="700"
        letterSpacing="2"
        fontFamily="sans-serif"
        opacity="0.85"
      >
        IN LUCK WE TRUST
      </text>

      {/* Glass Light Reflection Sheen */}
      <path
        d="M 16 16 L 360 16 L 240 294 L 16 294 Z"
        fill="url(#gold-foil)"
        opacity="0.04"
      />
    </svg>
  );
}

export default BanknoteSvg;
