import React, { useState } from "react";
import { ShieldAlert, CheckCircle2, ChevronRight, Scale, AlertTriangle, Coins } from "lucide-react";

export function TosAcceptModal({ open, onAccept, onReadMore }) {
  const [agreed18, setAgreed18] = useState(false);
  const [agreedVirtual, setAgreedVirtual] = useState(false);
  const [agreedFair, setAgreedFair] = useState(false);

  if (!open) return null;

  const allAgreed = agreed18 && agreedVirtual && agreedFair;

  const handleQuickAcceptAll = () => {
    setAgreed18(true);
    setAgreedVirtual(true);
    setAgreedFair(true);
    onAccept();
  };

  const handleConfirm = () => {
    if (allAgreed) {
      onAccept();
    }
  };

  return (
    <div className="modal-backdrop tos-backdrop" role="presentation">
      <div
        className="modal-dialog tos-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tos-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tos-header">
          <div className="tos-badge-pill">
            <Scale size={14} className="text-amber-400" />
            <span>Regulamin i Warunki Serwisu</span>
          </div>
          <h2 id="tos-modal-title" className="tos-title">
            Witaj w Kasynie 2FGT
          </h2>
          <p className="tos-subtitle">
            Przed rozpoczęciem gry prosimy o zapoznanie się z kluczowymi zasadami platformy rozrywkowej.
          </p>
        </div>

        <div className="tos-highlights-grid">
          <div className="tos-highlight-card">
            <div className="tos-highlight-icon bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <ShieldAlert size={20} />
            </div>
            <div>
              <span className="tos-highlight-title">Wymóg 18+</span>
              <p className="tos-highlight-desc">Platforma przeznaczona wyłącznie dla osób pełnoletnich.</p>
            </div>
          </div>

          <div className="tos-highlight-card">
            <div className="tos-highlight-icon bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Coins size={20} />
            </div>
            <div>
              <span className="tos-highlight-title">0 PLN Wartości</span>
              <p className="tos-highlight-desc">Żetony $FGT są w 100% wirtualne i nie podlegają wypłatom.</p>
            </div>
          </div>

          <div className="tos-highlight-card">
            <div className="tos-highlight-icon bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <span className="tos-highlight-title">Provably Fair & Anti-Cheat</span>
              <p className="tos-highlight-desc">Kryptograficzny RNG oraz ochrona przed botami i skryptami.</p>
            </div>
          </div>
        </div>

        <div className="tos-checkboxes-box">
          <label className="tos-check-item">
            <input
              type="checkbox"
              checked={agreed18}
              onChange={(e) => setAgreed18(e.target.checked)}
              className="tos-check-input"
            />
            <span className="tos-check-label">
              Oświadczam, że mam <strong>ukończone 18 lat</strong>.
            </span>
          </label>

          <label className="tos-check-item">
            <input
              type="checkbox"
              checked={agreedVirtual}
              onChange={(e) => setAgreedVirtual(e.target.checked)}
              className="tos-check-input"
            />
            <span className="tos-check-label">
              Rozumiem, że gry mają charakter <strong>czysto rozrywkowy</strong>, a żetony $FGT nie mają wartości pieniężnej.
            </span>
          </label>

          <label className="tos-check-item">
            <input
              type="checkbox"
              checked={agreedFair}
              onChange={(e) => setAgreedFair(e.target.checked)}
              className="tos-check-input"
            />
            <span className="tos-check-label">
              Zobowiązuję się do <strong>uczciwej gry</strong> (zakaz botów, automatyzacji i nadużywania API).
            </span>
          </label>
        </div>

        <div className="tos-actions-row">
          <button
            type="button"
            className="btn-tos-readmore"
            onClick={onReadMore}
          >
            <span>Pełny Regulamin (ToS)</span>
            <ChevronRight size={15} />
          </button>

          <div className="tos-primary-actions">
            <button
              type="button"
              className="btn-tos-accept"
              disabled={!allAgreed}
              onClick={handleConfirm}
            >
              <CheckCircle2 size={16} />
              <span>Akceptuję i wchodzę do gry</span>
            </button>
          </div>
        </div>

        <div className="tos-footer-hint">
          <button
            type="button"
            className="tos-quick-all-link"
            onClick={handleQuickAcceptAll}
          >
            Zaznacz wszystkie zgody i wejdź od razu
          </button>
        </div>
      </div>
    </div>
  );
}
