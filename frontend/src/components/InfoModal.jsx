import React from "react";
import { ShieldCheck, Zap, X, FileText, ChevronRight, Scale, Lock } from "lucide-react";

export function InfoModal({ open, onClose, onOpenTos }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-dialog info-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3 id="info-dialog-title">Zasady i Mnożniki Gier</h3>
            <p>Zasady 9 gier klubowych kasyna $FGT</p>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Zamknij okno zasad" autoFocus>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Rules Grid Covering All 9 Games */}
          <div className="info-rules-grid">
            <div className="rule-card">
              <div className="rule-card-header">
                <b>1. Ruletka</b>
                <span className="badge-mult">Do ×36</span>
              </div>
              <p>
                Europejskie koło z 37 numerami (0–36, 1 zielone zero). Pojedynczy numer płaci <b>×36</b>, tuziny i kolumny: <b>×3</b>, kolory (czerwone/czarne) oraz parzystość: <b>×2</b>.
              </p>
            </div>

            <div className="rule-card">
              <div className="rule-card-header">
                <b>2. Blackjack</b>
                <span className="badge-mult">3:2 (×1.5)</span>
              </div>
              <p>
                Zbliż się do 21 pkt i pokonaj krupiera (krupier dobiera do min. 17). Naturalny Blackjack płaci <b>3:2</b>, zwykła wygrana <b>1:1</b>, remis (push) zwraca stawkę.
              </p>
            </div>

            <div className="rule-card">
              <div className="rule-card-header">
                <b>3. Mines</b>
                <span className="badge-mult">RTP 97%</span>
              </div>
              <p>
                Siatka 5×5 (25 kafelków) z 2–24 minami. Każdy odkryty diament zwiększa mnożnik wygranej. Możesz wypłacić zysk (Cash-out) w dowolnej chwili.
              </p>
            </div>

            <div className="rule-card">
              <div className="rule-card-header">
                <b>4. Slots</b>
                <span className="badge-mult">Do ×12</span>
              </div>
              <p>
                5 bębnów, linia środkowa. 3 identyczne symbole = <b>×2</b>, 4 symbole = <b>×6</b>, 5 symboli = <b>×12</b> stawki zakładu.
              </p>
            </div>

            <div className="rule-card">
              <div className="rule-card-header">
                <b>5. Coinflip</b>
                <span className="badge-mult">×1.98</span>
              </div>
              <p>
                Klasyczny rzut monetą 3D. Wybierz Orła lub Reszkę — prawidłowy typ podwaja stawkę z mnożnikiem <b>×1.98</b> (RTP 99%).
              </p>
            </div>

            <div className="rule-card">
              <div className="rule-card-header">
                <b>6. Kamień Papier Nożyce</b>
                <span className="badge-mult">×1.98</span>
              </div>
              <p>
                Pojedynek z krupierem: Kamień bije nożyce, nożyce papier, papier kamień. Wygrana = <b>×1.98</b>, remis = zwrot stawki.
              </p>
            </div>

            <div className="rule-card">
              <div className="rule-card-header">
                <b>7. Plinko</b>
                <span className="badge-mult">Do ×1000</span>
              </div>
              <p>
                Kule spadają przez piramidę kołków. Konfiguracja 8–16 rzędów oraz 3 poziomy ryzyka (Low, Medium, High). Zewnętrzne sloty dają najwyższe mnożniki.
              </p>
            </div>

            <div className="rule-card">
              <div className="rule-card-header">
                <b>8. Limbo</b>
                <span className="badge-mult">Do ×10000</span>
              </div>
              <p>
                Ustaw cel mnożnika (1.01× – 10,000×). Jeśli wylosowany mnożnik serwera jest równy lub wyższy od Twojego celu — zgarniasz pełną pulę.
              </p>
            </div>

            <div className="rule-card">
              <div className="rule-card-header">
                <b>9. Crash</b>
                <span className="badge-mult">Do ×1000</span>
              </div>
              <p>
                Rakieta wznosi się ze stale rosnącym mnożnikiem. Ustaw automatyczny Cash-out lub wypłać ręcznie zanim rakieta eksploduje.
              </p>
            </div>
          </div>

          {/* Key Platform Points */}
          <div className="info-points-simple">
            <div className="point-item">
              <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
              <span>Tokeny $FGT są wyłącznie wirtualną walutą klubową (0 PLN). Brak wpłat i wypłat.</span>
            </div>
            <div className="point-item">
              <Lock size={18} className="text-cyan-400 shrink-0" />
              <span>Wszystkie wyniki gier są generowane serwerowo przez kryptograficzny silnik Provably Fair.</span>
            </div>
            <div className="point-item">
              <Zap size={18} className="text-amber-400 shrink-0" />
              <span>Bonus dzienny rośnie z każdym dniem serii logowań (streak). Misje rotują co 6 godzin.</span>
            </div>
          </div>

          {/* Prominent Link to Full ToS Page */}
          <div className="info-tos-callout">
            <div className="info-tos-callout-text">
              <div className="flex items-center gap-1.5 font-bold text-amber-400 text-xs uppercase tracking-wider">
                <Scale size={14} />
                <span>Dokumentacja Prawna</span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Pełny regulamin platformy, polityka 18+, zasady antybotowe oraz status waluty $FGT.
              </p>
            </div>
            <button
              type="button"
              className="btn-open-tos-page"
              onClick={() => {
                onClose();
                if (onOpenTos) onOpenTos();
              }}
            >
              <span>Pełny Regulamin (ToS)</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
