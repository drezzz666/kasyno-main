import React from "react";
import { ShieldCheck, Zap, X } from "lucide-react";

export function InfoModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog info-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Zasady i mnożniki</h3>
            <p>Zasady gier klubowych $FGT</p>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Zamknij">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="info-rules-grid">
            <div className="rule-card">
              <div className="rule-card-header">
                <b>1. Ruletka Europejska</b>
                <span className="badge-mult">×36 / ×3 / ×2</span>
              </div>
              <p>
                37 liczb (0–36, 1 zielone zero). Pojedynczy numer: <b>×36</b>, tuziny (1–12, 13–24, 25–36): <b>×3</b>, kolory i parzystość: <b>×2</b>.
              </p>
            </div>

            <div className="rule-card">
              <div className="rule-card-header">
                <b>2. Blackjack</b>
                <span className="badge-mult">3:2 (×2.5)</span>
              </div>
              <p>
                Zbliż się do 21 pkt i pokonaj krupiera (dobiera do min. 17). Naturalny Blackjack płaci <b>×2.5</b>, zwykła wygrana <b>×2.0</b>, remis zwraca stawkę (<b>×1.0</b>).
              </p>
            </div>

            <div className="rule-card">
              <div className="rule-card-header">
                <b>3. Mines (Saper)</b>
                <span className="badge-mult">RTP 97%</span>
              </div>
              <p>
                Siatka 5×5 (25 pól) z 2–24 minami. Każdy odkryty kryształ podnosi mnożnik rundy. Kliknij Cash-out w dowolnym momencie przed trafieniem miny.
              </p>
            </div>

            <div className="rule-card">
              <div className="rule-card-header">
                <b>4. Midnight 2fgt (Sloty)</b>
                <span className="badge-mult">do ×12</span>
              </div>
              <p>
                5 bębnów. Rozliczana jest linia środkowa: 3 identyczne symbole = <b>×2</b>, 4 symbole = <b>×6</b>, 5 symboli = <b>×12</b>.
              </p>
            </div>
          </div>

          <div className="info-points-simple">
            <div className="point-item">
              <ShieldCheck size={18} className="text-emerald-400" />
              <span>Tokeny $FGT służą wyłącznie do gry. Brak wpłat i wypłat pieniężnych.</span>
            </div>
            <div className="point-item">
              <Zap size={18} className="text-amber-400" />
              <span>Codzienny bonus rośnie wraz z kolejnymi dniami logowania (streak).</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
