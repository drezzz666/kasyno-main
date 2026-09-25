import React, { useState } from "react";
import { Gamepad2, X } from "lucide-react";
import { getMinigameById } from "./registry";
import { FgtChip } from "../components/BetControls";
import { money } from "../lib/formatters";

export function MinigamesModal({ isOpen, onClose, syncBalance, currentBalance, initialGame = "captcha" }) {
  const [selectedGameId, setSelectedGameId] = useState(initialGame);

  if (!isOpen) return null;

  const activeGameMeta = getMinigameById(selectedGameId);
  const ActiveComponent = activeGameMeta?.component;
  const ActiveIcon = activeGameMeta?.icon || Gamepad2;

  return (
    <div className="modal-backdrop captcha-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-dialog captcha-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="captcha-modal-header">
          <div className="captcha-header-title">
            <div className="captcha-icon-wrap">
              <ActiveIcon size={20} className={activeGameMeta?.iconColor || "text-amber-400"} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {activeGameMeta?.name || "Minigry"}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {typeof currentBalance === "number" && (
              <div className="balance-chip" title="Stan Twojego portfela">
                <FgtChip small />
                <span className="balance-val">{money(currentBalance)}</span>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="captcha-close-btn"
              aria-label="Zamknij"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Active Mini-Game View */}
        {ActiveComponent ? (
          <ActiveComponent
            syncBalance={syncBalance}
            currentBalance={currentBalance}
            onClose={onClose}
          />
        ) : (
          <div className="p-6 text-center text-slate-400 text-sm">
            Wybierz minigrę z listy powyżej.
          </div>
        )}
      </div>
    </div>
  );
}
