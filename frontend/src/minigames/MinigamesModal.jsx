import React, { useState } from "react";
import { Gamepad2, X, ChevronRight, Sparkles } from "lucide-react";
import { MINIGAMES, getMinigameById } from "./registry";

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
                {activeGameMeta?.name || "Minigry Kasyna"}
              </h2>
              <span className="text-xs text-slate-400 font-medium">
                {activeGameMeta?.desc || "Darmowe żetony i nagrody"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="captcha-close-btn"
            aria-label="Zamknij"
          >
            <X size={18} />
          </button>
        </div>

        {/* Multi-minigame selector tabs (if more than 1 minigame exists) */}
        {MINIGAMES.length > 1 && (
          <div className="minigames-tabs-bar flex items-center gap-1.5 p-1 bg-slate-900/60 rounded-lg border border-slate-800/80 mb-3">
            {MINIGAMES.map((mg) => {
              const Icon = mg.icon;
              const isSelected = mg.id === selectedGameId;
              return (
                <button
                  key={mg.id}
                  type="button"
                  disabled={mg.comingSoon}
                  onClick={() => setSelectedGameId(mg.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    isSelected
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  } ${mg.comingSoon ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <Icon size={14} className={isSelected ? "text-amber-400" : "text-slate-400"} />
                  <span>{mg.shortName || mg.name}</span>
                  {mg.badge && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 ml-1">
                      {mg.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

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
