import React, { useState, useEffect } from "react";
import { Package, Sparkles, Gift, Crown, Trophy, AlertCircle, CheckCircle2 } from "lucide-react";
import confetti from "canvas-confetti";
import { sounds } from "../lib/sounds";
import { toast } from "sonner";
import { postCasinoAction } from "../lib/api";
import { money } from "../lib/formatters";

const BOXES_CONFIG = [
  {
    id: "plebs",
    name: "Plebsowa",
    badge: "DARMOWA (5/dzień)",
    badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    themeBorder: "hover:border-emerald-500/40 border-slate-700/60",
    themeBg: "from-emerald-950/20 to-slate-900/40",
    btnColor: "bg-emerald-600 hover:bg-emerald-500 text-white",
    cost: 0,
    costLabel: "Za darmo",
    maxWin: "5 000 ₽",
    icon: Gift,
    iconColor: "text-emerald-400",
    description: "5 darmowych skrzynek każdego dnia. Otwieraj codziennie i odbieraj ruble!",
  },
  {
    id: "arystokracja",
    name: "Arystokracka",
    badge: "LIMIT 5/dzień",
    badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    themeBorder: "hover:border-amber-500/40 border-slate-700/60",
    themeBg: "from-amber-950/20 to-slate-900/40",
    btnColor: "bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold",
    cost: 500,
    costLabel: "500 ₽",
    maxWin: "50 000 ₽",
    icon: Crown,
    iconColor: "text-amber-400",
    description: "Dla graczy z grubszym portfelem. Szansa na natychmiastowe mnożniki i Jackpot!",
  },
  {
    id: "lepsza",
    name: "Lepsza",
    badge: "ZA AWANS POZIOMU",
    badgeColor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    themeBorder: "hover:border-purple-500/40 border-slate-700/60",
    themeBg: "from-purple-950/20 to-slate-900/40",
    btnColor: "bg-purple-600 hover:bg-purple-500 text-white font-bold",
    cost: 0,
    costLabel: "1 szt. z ekwipunku",
    maxWin: "100 000 ₽",
    icon: Trophy,
    iconColor: "text-purple-400",
    description: "Przyznawana automatycznie (+1 sztuka) przy każdym nowym poziomie. Nie do kupienia!",
  },
];

export function MusorDropMinigame({ syncBalance, currentBalance, onClose }) {
  const [state, setState] = useState({
    plebsUsed: 0,
    plebsLimit: 5,
    arystokracjaUsed: 0,
    arystokracjaLimit: 5,
    arystokracjaCost: 500,
    lepszaBoxes: 0,
  });
  const [openingBox, setOpeningBox] = useState(null);
  const [lastOutcome, setLastOutcome] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshStatus = async () => {
    try {
      const res = await postCasinoAction({ action: "musor_drop_status" }, { silent: true });
      if (res && res.state) {
        setState(res.state);
      }
    } catch (_) {}
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const handleOpen = async (boxId) => {
    if (loading || openingBox) return;

    const cfg = BOXES_CONFIG.find((b) => b.id === boxId);
    if (!cfg) return;

    if (boxId === "plebs" && state.plebsUsed >= state.plebsLimit) {
      toast.error("Osiągnięto dzienny limit 5 darmowych skrzynek Plebsowych.");
      return;
    }
    if (boxId === "arystokracja") {
      if (state.arystokracjaUsed >= state.arystokracjaLimit) {
        toast.error("Osiągnięto dzienny limit 5 skrzynek Arystokrackich.");
        return;
      }
      if (typeof currentBalance === "number" && currentBalance < 500) {
        toast.error("Niewystarczające saldo (wymagane 500 ₽).");
        return;
      }
    }
    if (boxId === "lepsza" && state.lepszaBoxes < 1) {
      toast.error("Brak skrzynek Lepszych w ekwipunku. Zdobywaj kolejne poziomy konta!");
      return;
    }

    setLoading(true);
    setOpeningBox(boxId);
    setLastOutcome(null);
    sounds.playClick();

    try {
      const res = await postCasinoAction(
        {
          action: "musor_drop_open",
          box_type: boxId,
        },
        { silent: true }
      );

      // Brief animation delay for anticipation
      await new Promise((r) => setTimeout(r, 900));

      if (res && res.outcome) {
        const out = res.outcome;
        setLastOutcome(out);
        if (out.state) {
          setState(out.state);
        }
        if (typeof out.balance === "number" && syncBalance) {
          syncBalance(out.balance);
        }

        if (out.prize > 0) {
          if (out.isJackpot || out.prize >= 10000) {
            sounds.playBigWin();
            confetti({
              particleCount: 120,
              spread: 90,
              origin: { y: 0.6 },
              colors: ["#F59E0B", "#10B981", "#38BDF8", "#EC4899"],
            });
            toast.success(`🔥 JACKPOT! Wygrałeś +${money(out.prize)}!`);
          } else {
            sounds.playCoins();
            confetti({
              particleCount: 60,
              spread: 60,
              origin: { y: 0.65 },
            });
            toast.success(`Wygrałeś +${money(out.prize)}!`);
          }
        } else {
          sounds.playLoss();
          toast.info("Pusta skrzynka. Spróbuj ponownie!");
        }
      }
    } catch (err) {
      toast.error(err.message || "Błąd otwierania skrzynki");
      refreshStatus();
    } finally {
      setLoading(false);
      setOpeningBox(null);
    }
  };

  return (
    <div className="musor-drop-container space-y-4 w-full">
      {/* Hero Banner Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-1.5">
              <Sparkles size={12} />
              Minigra Dropów
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide">
              Musor Drop
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-lg mt-0.5">
              Otwieraj darmowe skrzynki każdego dnia, kupuj wersje arystokrackie i odbieraj skrzynki Lepsze za każdy awans poziomu!
            </p>
          </div>

          {/* Quick Summary Chips */}
          <div className="flex flex-wrap sm:flex-nowrap gap-2 shrink-0 text-xs w-full sm:w-auto">
            <div className="bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-xl flex items-center justify-between gap-3 text-slate-300 flex-1 sm:flex-initial">
              <span className="text-slate-400">Plebsowe:</span>
              <span className="font-bold text-emerald-400">
                {Math.max(0, state.plebsLimit - state.plebsUsed)} / {state.plebsLimit}
              </span>
            </div>
            <div className="bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-xl flex items-center justify-between gap-3 text-slate-300 flex-1 sm:flex-initial">
              <span className="text-slate-400">Arystokrackie:</span>
              <span className="font-bold text-amber-400">
                {Math.max(0, state.arystokracjaLimit - state.arystokracjaUsed)} / {state.arystokracjaLimit}
              </span>
            </div>
            <div className="bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-xl flex items-center justify-between gap-3 text-slate-300 flex-1 sm:flex-initial">
              <span className="text-slate-400">Lepsze:</span>
              <span className="font-bold text-purple-400">
                {state.lepszaBoxes} szt.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Outcome Reveal Banner */}
      {lastOutcome && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-4 transition-all duration-300 animate-in fade-in zoom-in-95 ${
            lastOutcome.prize > 0
              ? lastOutcome.isJackpot
                ? "bg-amber-950/40 border-amber-500/60 text-amber-200"
                : "bg-emerald-950/40 border-emerald-500/60 text-emerald-200"
              : "bg-slate-800/80 border-slate-700 text-slate-300"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                lastOutcome.prize > 0
                  ? lastOutcome.isJackpot
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-emerald-500/20 text-emerald-400"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              {lastOutcome.prize > 0 ? (
                lastOutcome.isJackpot ? <Trophy size={24} /> : <CheckCircle2 size={24} />
              ) : (
                <Package size={24} />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider opacity-75">
                Wynik ostatniego otwarcia ({lastOutcome.boxType})
              </p>
              <h4 className="text-base sm:text-lg font-black leading-tight">
                {lastOutcome.prize > 0 ? (
                  <span>
                    🎉 Wygrano: <strong className="text-white">{money(lastOutcome.prize)}</strong>{" "}
                    {lastOutcome.isJackpot && <span className="text-amber-400 font-bold ml-1">🔥 JACKPOT!</span>}
                  </span>
                ) : (
                  <span>Pusta skrzynka (Brak wygranej)</span>
                )}
              </h4>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLastOutcome(null)}
            className="text-xs text-slate-400 hover:text-white px-2 py-1"
          >
            Zamknij
          </button>
        </div>
      )}

      {/* 3 Boxes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {BOXES_CONFIG.map((box) => {
          const IconComponent = box.icon;
          const isOpening = openingBox === box.id;

          let remainingCount = 0;
          let isAvailable = true;
          let btnText = "Otwórz skrzynkę";

          if (box.id === "plebs") {
            remainingCount = Math.max(0, state.plebsLimit - state.plebsUsed);
            isAvailable = remainingCount > 0;
            btnText = isAvailable ? `Otwórz za darmo (${remainingCount}/5)` : "Limit wyczerpany (5/5)";
          } else if (box.id === "arystokracja") {
            remainingCount = Math.max(0, state.arystokracjaLimit - state.arystokracjaUsed);
            const hasFunds = typeof currentBalance === "number" ? currentBalance >= 500 : true;
            isAvailable = remainingCount > 0 && hasFunds;
            if (remainingCount <= 0) {
              btnText = "Limit dzienny 5/5 osiągnięty";
            } else if (!hasFunds) {
              btnText = "Brak środków (500 ₽)";
            } else {
              btnText = `Kup i otwórz (500 ₽) [${remainingCount}/5]`;
            }
          } else if (box.id === "lepsza") {
            remainingCount = state.lepszaBoxes;
            isAvailable = remainingCount > 0;
            btnText = isAvailable
              ? `Otwórz skrzynkę (Masz: ${remainingCount})`
              : "Brak w ekwipunku (Wbij lvl)";
          }

          return (
            <div
              key={box.id}
              className={`relative rounded-2xl bg-gradient-to-b ${box.themeBg} bg-slate-900/90 border ${box.themeBorder} p-5 flex flex-col justify-between transition-all duration-300 shadow-xl ${
                isOpening ? "animate-pulse ring-2 ring-amber-400/50 scale-[1.02]" : ""
              }`}
            >
              {/* Card Top */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${box.badgeColor}`}
                  >
                    {box.badge}
                  </span>
                  <span className="text-xs font-bold text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-700/60">
                    {box.costLabel}
                  </span>
                </div>

                <div className="flex items-center gap-3 my-3">
                  <div
                    className={`w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center shadow-inner ${
                      isOpening ? "animate-bounce" : ""
                    }`}
                  >
                    <IconComponent size={24} className={box.iconColor} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight">{box.name}</h3>
                    <p className="text-xs text-slate-400">
                      {box.id === "lepsza"
                        ? `Posiadane: ${remainingCount} szt.`
                        : `Dostępne dziś: ${remainingCount}/5`}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-300 mb-4 min-h-[36px]">{box.description}</p>
              </div>

              {/* Card Bottom: Max Win Highlight & Button */}
              <div className="space-y-3 pt-3 border-t border-slate-800/80">
                {/* Highlight Max Win */}
                <div className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-bold tracking-wide shadow-sm">
                  <Trophy size={14} className="text-amber-400 shrink-0" />
                  <span>Do wygrania aż <strong className="text-white font-extrabold">{box.maxWin}</strong>!</span>
                </div>

                <button
                  type="button"
                  disabled={!isAvailable || loading}
                  onClick={() => handleOpen(box.id)}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 ${
                    isAvailable && !loading
                      ? box.btnColor
                      : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/40"
                  }`}
                >
                  {isOpening ? (
                    <>
                      <Sparkles size={14} className="animate-spin" />
                      Losowanie nagrody...
                    </>
                  ) : (
                    <>
                      <Package size={14} />
                      {btnText}
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
