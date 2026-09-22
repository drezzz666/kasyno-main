import React from "react";
import { formatHistoryTime, getHistoryDetails, money } from "../lib/formatters";
import { X } from "lucide-react";

export function HistoryModal({
  open,
  onClose,
  history = [],
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Dziennik operacji</h3>
            <p>Historia gier, bonusów i rozliczeń konta</p>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Zamknij">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {history.length ? (
            <>
              <div className="history-list">
                {history.map((r) => {
                  const details = getHistoryDetails(r);
                  const timeStr = formatHistoryTime(r.createdAt || r.created_at);
                  const isPositive = r.amount > 0;
                  const isNegative = r.amount < 0;

                  return (
                    <div key={r.id} className="history-row">
                      <div className="history-main">
                        <span className="history-title">{details.title}</span>
                        <small className="history-sub">{details.subtitle}</small>
                      </div>
                      <div className="history-meta">
                        <b className={isPositive ? "win" : isNegative ? "loss" : "neutral"}>
                          {isPositive ? "+" : ""}
                          {money(r.amount)}
                        </b>
                        {timeStr && <time className="history-time">{timeStr}</time>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasMore ? (
                <div className="history-actions">
                  <button
                    type="button"
                    className="btn-history-more"
                    onClick={onLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Wczytywanie..." : "Wczytaj starsze wpisy"}
                  </button>
                </div>
              ) : (
                <p className="history-modal-end">Koniec historii wpisów.</p>
              )}
            </>
          ) : (
            <p className="empty">Brak zarejestrowanych operacji.</p>
          )}
        </div>
      </div>
    </div>
  );
}
