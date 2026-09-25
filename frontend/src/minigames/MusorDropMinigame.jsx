import React, { useState, useEffect } from "react";
import { Package, Sparkles, Gift, Crown, Trophy, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from "lucide-react";
import confetti from "canvas-confetti";
import { sounds } from "../lib/sounds";
import { toast } from "sonner";
import { postCasinoAction, fetchCasinoState } from "../lib/api";
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
    icon: Gift,
    iconColor: "text-emerald-400",
    description: "5 darmowych skrzynek każdego dnia. Otwieraj codziennie i odbieraj ruble!",
    prizes: [
      { name: "Nic", chance: "55.0%", amount: 0 },
      { name: "100 ₽", chance: "25.0%", amount: 100 },
      { name: "500 ₽", chance: "12.0%", amount: 500 },
      { name: "1 500 ₽", chance: "6.0%", amount: 1500 },
      { name: "5 000 ₽ (Jackpot)", chance: "2.0%", amount: 5000, isJackpot: true },
    ],
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
    icon: Crown,
    iconColor: "text-amber-400",
    description: "Dla graczy z grubszym portfelem. Szansa na podwojenie stawki lub Główny Jackpot!",
    prizes: [
      { name: "Nic", chance: "60.0%", amount: 0 },
      { name: "250 ₽ (Zwrot 50%)", chance: "24.0%", amount: 250 },
      { name: "1 000 ₽ (Podwojenie)", chance: "11.0%", amount: 1000 },
      { name: "3 000 ₽", chance: "4.0%", amount: 3000 },
      { name: "10 000 ₽", chance: "0.8%", amount: 10000 },
      { name: "50 000 ₽ (Główny Jackpot)", chance: "0.2%", amount: 50000, isJackpot: true },
    ],
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
    icon: Trophy,
    iconColor: "text-purple-400",
    description: "Przyznawana automatycznie (+1 sztuka) przy każdym nowym poziomie. Nie do kupienia!",
    prizes: [
      { name: "Nic", chance: "52.5%", amount: 0 },
      { name: "1 000 ₽", chance: "25.0%", amount: 1000 },
      { name: "5 000 ₽", chance: "10.0%", amount: 5000 },
      { name: "10 000 ₽", chance: "5.0%", amount: 10000 },
      { name: "25 000 ₽", chance: "3.0%", amount: 25000 },
      { name: "50 000 ₽", chance: "2.0%", amount: 50000, isJackpot: true },
      { name: "100 000 ₽ (Główny Jackpot)", chance: "0.5%", amount: 100000, isJackpot: true },
    ],
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
  const [openChancesFor, setOpenChancesFor] = useState(null);
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
    <div className="musor-drop-container p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Hero Banner Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 p-5 sm:p-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-center gap-5 justify-between relative z-10">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <img
              src="/musor-drop-hero.webp"
              alt="Musor Drop Logo"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl shadow-lg border border-amber-500/30 object-cover shrink-0"
            />
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-1">
                <Sparkles size={12} />
                Nowość · Minigra Dropów
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide">
                Musor Drop
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-md">
                Otwieraj skrzynki dzienne, kupuj wersje arystokrackie i odbieraj skrzynki Lepsze za każdy awans poziomu!
              </p>
            </div>
          </div>

          {/* Quick Summary Chips */}
          <div className="flex flex-wrap sm:flex-col gap-2 shrink-0 text-xs">
            <div className="bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-xl flex items-center justify-between gap-3 text-slate-300">
              <span className="text-slate-400">Plebsowe:</span>
              <span className="font-bold text-emerald-400">
                {Math.max(0, state.plebsLimit - state.plebsUsed)} / {state.plebsLimit}
              </span>
            </div>
            <div className="bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-xl flex items-center justify-between gap-3 text-slate-300">
              <span className="text-slate-400">Arystokrackie:</span>
              <span className="font-bold text-amber-400">
                {Math.max(0, state.arystokracjaLimit - state.arystokracjaUsed)} / {state.arystokracjaLimit}
              </span>
            </div>
            <div className="bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-xl flex items-center justify-between gap-3 text-slate-300">
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

          const showChances = openChancesFor === box.id;

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

              {/* Card Actions & Probability Accordion */}
              <div className="space-y-3 pt-3 border-t border-slate-800/80">
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

                {/* Chances Dropdown Toggle */}
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenChancesFor(showChances ? null : box.id)}
                    className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 py-1"
                  >
                    <span>Szanse na nagrody ({box.prizes.length} pozycji)</span>
                    {showChances ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showChances && (
                    <div className="mt-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1 text-[11px] animate-in fade-in">
                      {box.prizes.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between text-slate-300">
                          <span
                            className={
                              p.isJackpot
                                ? "text-amber-400 font-bold"
                                : p.amount > 0
                                ? "text-slate-200 font-medium"
                                : "text-slate-400"
                            }
                          >
                            {p.name}
                          </span>
                          <span className="font-mono text-slate-400">{p.chance}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
