import React, { useState, useEffect, useRef } from "react";
import { Package, Sparkles, Gift, Crown, Trophy } from "lucide-react";
import { toast } from "sonner";
import { postCasinoAction } from "../lib/api";
import { CaseSpinner } from "./CaseSpinner";

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
    description: "Dla graczy z grubszym portfelem. Szansa na zwrot, mnożniki i Główny Jackpot!",
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

export function MusorDropMinigame({ syncBalance, currentBalance, onClose, setModalLocked }) {
  const [state, setState] = useState({
    plebsUsed: 0,
    plebsLimit: 5,
    arystokracjaUsed: 0,
    arystokracjaLimit: 5,
    arystokracjaCost: 500,
    lepszaBoxes: 0,
  });
  const [loading, setLoading] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [activeSpinnerBox, setActiveSpinnerBox] = useState(null);
  const [activeSpinnerOutcome, setActiveSpinnerOutcome] = useState(null);
  const [activeBoxIndex, setActiveBoxIndex] = useState(0);
  const carouselRef = useRef(null);

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
    return () => {
      if (setModalLocked) setModalLocked(false);
    };
  }, [setModalLocked]);

  useEffect(() => {
    if (setModalLocked) {
      setModalLocked(isSpinning || loading);
    }
  }, [isSpinning, loading, setModalLocked]);

  const scrollToBox = (idx) => {
    setActiveBoxIndex(idx);
    if (!carouselRef.current) return;
    const cards = carouselRef.current.children;
    if (cards && cards[idx]) {
      cards[idx].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  };

  const handleScroll = (e) => {
    const container = e.currentTarget;
    if (!container || !container.children.length) return;
    const center = container.scrollLeft + container.offsetWidth / 2;
    let closestIdx = 0;
    let minDiff = Infinity;
    Array.from(container.children).forEach((child, idx) => {
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const diff = Math.abs(center - childCenter);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    if (closestIdx !== activeBoxIndex) {
      setActiveBoxIndex(closestIdx);
    }
  };

  const handleOpen = async (boxId) => {
    if (loading || isSpinning) return;

    const cfg = BOXES_CONFIG.find((b) => b.id === boxId);
    if (!cfg) return;

    const cfgIdx = BOXES_CONFIG.findIndex((b) => b.id === boxId);
    if (cfgIdx !== -1) setActiveBoxIndex(cfgIdx);

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
    setIsSpinning(true);

    try {
      const res = await postCasinoAction(
        {
          action: "musor_drop_open",
          box_type: boxId,
        },
        { silent: true }
      );

      if (res && res.outcome) {
        const out = res.outcome;
        setActiveSpinnerBox(cfg);
        setActiveSpinnerOutcome(out);
      } else {
        setIsSpinning(false);
      }
    } catch (err) {
      toast.error(err.message || "Błąd otwierania skrzynki");
      setIsSpinning(false);
      refreshStatus();
    } finally {
      setLoading(false);
    }
  };

  const handleSpinnerComplete = (out) => {
    setIsSpinning(false);
    if (out && out.state) {
      setState(out.state);
    }
    if (out && typeof out.balance === "number" && syncBalance) {
      syncBalance(out.balance);
    }
  };

  // Check if currently active box in spinner can be reopened
  let canReopen = false;
  let reopenBtnText = "Otwórz kolejną";
  if (activeSpinnerBox) {
    if (activeSpinnerBox.id === "plebs") {
      canReopen = state.plebsUsed < state.plebsLimit;
      reopenBtnText = `Otwórz za darmo (${Math.max(0, state.plebsLimit - state.plebsUsed)}/5)`;
    } else if (activeSpinnerBox.id === "arystokracja") {
      const hasFunds = typeof currentBalance === "number" ? currentBalance >= 500 : true;
      canReopen = state.arystokracjaUsed < state.arystokracjaLimit && hasFunds;
      reopenBtnText = `Kup kolejną (500 ₽)`;
    } else if (activeSpinnerBox.id === "lepsza") {
      canReopen = state.lepszaBoxes > 0;
      reopenBtnText = `Otwórz kolejną (Masz: ${state.lepszaBoxes})`;
    }
  }

  return (
    <div className="musor-drop-container space-y-4 w-full">
      {/* Active Horizontal CS:GO Case Opening Carousel */}
      {activeSpinnerBox && activeSpinnerOutcome ? (
        <CaseSpinner
          boxConfig={activeSpinnerBox}
          outcome={activeSpinnerOutcome}
          onComplete={handleSpinnerComplete}
          onBack={() => {
            setIsSpinning(false);
            setActiveSpinnerBox(null);
            setActiveSpinnerOutcome(null);
            refreshStatus();
          }}
          onReopen={() => {
            handleOpen(activeSpinnerBox.id);
          }}
          canReopen={canReopen}
          reopenButtonText={reopenBtnText}
        />
      ) : (
        <div className="flex flex-col space-y-3 w-full">
          {/* Mobile Box Switcher Tabs (Hidden on Desktop) */}
          <div className="flex md:hidden items-center gap-1.5 p-1 bg-slate-950/70 rounded-xl border border-slate-800/80">
            {BOXES_CONFIG.map((box, idx) => {
              const IconComp = box.icon;
              const isActive = activeBoxIndex === idx;

              let tabStatus = "";
              if (box.id === "plebs") {
                tabStatus = `${Math.max(0, state.plebsLimit - state.plebsUsed)}/5`;
              } else if (box.id === "arystokracja") {
                tabStatus = "500 ₽";
              } else if (box.id === "lepsza") {
                tabStatus = `${state.lepszaBoxes} szt.`;
              }

              return (
                <button
                  key={box.id}
                  type="button"
                  onClick={() => scrollToBox(idx)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-lg text-xs font-bold transition-all ${
                    isActive
                      ? `${box.badgeColor} bg-slate-800/90 shadow-md border`
                      : "text-slate-400 hover:text-slate-200 border border-transparent hover:bg-slate-900/60"
                  }`}
                >
                  <IconComp size={13} className={isActive ? box.iconColor : "text-slate-400"} />
                  <span className="truncate text-[11px] font-bold">{box.name}</span>
                  <span
                    className={`text-[9px] px-1 py-0.5 rounded font-mono font-bold leading-none ${
                      isActive ? "bg-slate-900/80 text-white" : "text-slate-400 bg-slate-800/60"
                    }`}
                  >
                    {tabStatus}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 3 Boxes: Horizontal Swipeable on Mobile, 3-Col Grid on Desktop */}
          <div
            ref={carouselRef}
            onScroll={handleScroll}
            className="flex md:grid md:grid-cols-3 gap-3.5 sm:gap-6 overflow-x-auto md:overflow-visible snap-x snap-mandatory scroll-smooth no-scrollbar pb-1 px-1 sm:px-0"
          >
            {BOXES_CONFIG.map((box, idx) => {
              const IconComponent = box.icon;

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

              const isCurrentActive = activeBoxIndex === idx;

              return (
                <div
                  key={box.id}
                  className={`relative rounded-2xl bg-gradient-to-b ${box.themeBg} bg-slate-900/90 border ${
                    box.themeBorder
                  } p-4 sm:p-5 flex flex-col justify-between transition-all duration-300 shadow-xl w-[85vw] max-w-[340px] sm:w-[320px] md:w-auto shrink-0 snap-center ${
                    isCurrentActive ? "ring-1 ring-amber-400/40 md:ring-0" : "opacity-95 md:opacity-100"
                  }`}
                >
                  {/* Card Top */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2.5 sm:mb-3">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full border ${box.badgeColor}`}
                      >
                        {box.badge}
                      </span>
                      <span className="text-[11px] sm:text-xs font-bold text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-700/60">
                        {box.costLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 my-2.5 sm:my-3">
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center shadow-inner shrink-0">
                        <IconComponent size={22} className={box.iconColor} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base sm:text-lg font-bold text-white leading-tight truncate">{box.name}</h3>
                        <p className="text-xs text-slate-400">
                          {box.id === "lepsza"
                            ? `Posiadane: ${remainingCount} szt.`
                            : `Dostępne dziś: ${remainingCount}/5`}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 mb-3 sm:mb-4 min-h-[32px] sm:min-h-[36px] line-clamp-2 sm:line-clamp-none">
                      {box.description}
                    </p>
                  </div>

                  {/* Card Bottom: Max Win Highlight & Button */}
                  <div className="space-y-2.5 sm:space-y-3 pt-2.5 sm:pt-3 border-t border-slate-800/80">
                    <div className="flex items-center justify-center gap-1.5 py-1.5 sm:py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-bold tracking-wide shadow-sm">
                      <Trophy size={14} className="text-amber-400 shrink-0" />
                      <span>Do wygrania aż <strong className="text-white font-extrabold">{box.maxWin}</strong>!</span>
                    </div>

                    <button
                      type="button"
                      disabled={!isAvailable || loading}
                      onClick={() => handleOpen(box.id)}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 ${
                        isAvailable && !loading
                          ? box.btnColor
                          : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/40"
                      }`}
                    >
                      {loading ? (
                        <>
                          <Sparkles size={14} className="animate-spin" />
                          Ładowanie...
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

          {/* Mobile Carousel Indicator Dots (Hidden on Desktop) */}
          <div className="flex md:hidden items-center justify-center gap-2 pt-1 pb-0.5">
            {BOXES_CONFIG.map((box, idx) => (
              <button
                key={box.id}
                type="button"
                onClick={() => scrollToBox(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  activeBoxIndex === idx
                    ? "w-6 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]"
                    : "w-1.5 bg-slate-700/80 hover:bg-slate-600"
                }`}
                aria-label={`Przejdź do skrzynki ${box.name}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
