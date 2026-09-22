import React from "react";
import { History, LogOut, X } from "lucide-react";
import { format, money } from "../lib/formatters";

export function ProfileModal({
  open,
  onClose,
  player,
  userNick,
  onOpenHistory,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog profile-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Konto gracza</h3>
            <p>Poziom {player?.level || 1} · {format(player?.xp || 0)} XP</p>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Zamknij">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="profile-field">
            <span className="profile-field-label">Nick / Identyfikator (Authentik)</span>
            <div className="profile-field-value">{userNick}</div>
          </div>

          <div className="profile-stats-grid">
            <div className="stat-card">
              <span className="stat-label">Saldo</span>
              <b className="stat-value gold">{money(player?.balance || 0)}</b>
            </div>
            <div className="stat-card">
              <span className="stat-label">Seria dni (Streak)</span>
              <b className="stat-value">{player?.streak || 0} dni</b>
            </div>
          </div>

          <div className="profile-actions-stack">
            <button
              type="button"
              className="btn-modal-action secondary"
              onClick={() => {
                onClose();
                onOpenHistory();
              }}
            >
              <History size={16} /> Historia konta
            </button>

            <a href="/api/auth/logout" className="btn-modal-action logout">
              <LogOut size={15} /> Wyloguj się
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
