import React from "react";
import { History, LogOut, X, Trophy } from "lucide-react";
import { format, money } from "../lib/formatters";

export function ProfileModal({
  open,
  onClose,
  player,
  stats,
  userNick,
  onOpenHistory,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog profile-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="profile-modal-avatar-wrap">
              {player?.avatar ? (
                <img src={player.avatar} alt={userNick} className="profile-modal-avatar-img" />
              ) : (
                <div className="profile-modal-avatar-fallback">{userNick.slice(0, 2).toUpperCase()}</div>
              )}
            </div>
            <div>
              <h3>Konto gracza</h3>
              <p>Poziom {player?.level || 1} · {format(player?.xp || 0)} XP (Nagroda za poziom: +50 $FGT)</p>
            </div>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Zamknij">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="profile-field">
            <span className="profile-field-label">Nick / Identyfikator</span>
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

          {/* Osobiste Rekordy */}
          <div className="profile-records-section">
            <div className="profile-records-header">
              <Trophy size={14} className="text-amber-400" />
              <span>Twoje rekordy i statystyki</span>
            </div>
            <div className="profile-records-grid">
              <div className="record-item">
                <span className="record-label">Najwyższa wygrana</span>
                <span className="record-val text-emerald-400">
                  {stats?.biggestWin ? `+${money(stats.biggestWin)}` : "—"}
                </span>
              </div>

              <div className="record-item">
                <span className="record-label">Maks. mnożnik</span>
                <span className="record-val text-amber-400">
                  {stats?.maxMultiplier ? `×${stats.maxMultiplier}` : "—"}
                </span>
              </div>

              <div className="record-item">
                <span className="record-label">Ulubiona gra</span>
                <span className="record-val text-slate-200 capitalize">
                  {stats?.favoriteGame || "—"}
                </span>
              </div>

              <div className="record-item">
                <span className="record-label">Łączny obrót</span>
                <span className="record-val text-slate-300">
                  {stats?.totalWagered ? money(stats.totalWagered) : "0 $FGT"}
                </span>
              </div>
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

