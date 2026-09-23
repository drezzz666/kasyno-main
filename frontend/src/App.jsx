import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Volume2,
  VolumeX,
  Flame,
  Pickaxe,
  Spade,
  Trophy,
  Target,
  History,
  User,
  Info,
  ChevronRight,
  Sparkles,
  Zap,
  Dices,
  CheckCircle2,
  Clock,
  Gift,
  ArrowRight,
  Coins,
  Scissors,
  CircleDot,
  Crown,
  Rocket,
  TrendingUp,
  Scale,
  FileText,
  Award,
  Star,
  Gamepad2,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { fetchCasinoState, postCasinoAction, fetchHistoryEntries } from "./lib/api";
import { money, dailyBonus, formatHistoryTime, getHistoryDetails, format } from "./lib/formatters";
import { FgtChip } from "./components/BetControls";
import { GameTableDialog } from "./components/GameTableDialog";
import { HistoryModal } from "./components/HistoryModal";
import { ProfileModal } from "./components/ProfileModal";
import { InfoModal } from "./components/InfoModal";
import { TosPage } from "./components/TosPage";
import { TosAcceptModal } from "./components/TosAcceptModal";
import { WinCelebrationModal } from "./components/WinCelebrationModal";
import { MinigamesModal, MINIGAMES } from "./minigames";
import { LiveTicker } from "./components/LiveTicker";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAudio } from "./hooks/useAudio";
import confetti from "canvas-confetti";

export default function App() {

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeGame, setActiveGame] = useState(null);
  const [selectedMinigameId, setSelectedMinigameId] = useState("captcha");
  const [rankingType, setRankingType] = useState("balance"); // "balance" | "level"
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const p = window.location.pathname.toLowerCase();
      if (p === "/tos" || p === "/regulamin") return "tos";
      if (p === "/minigry" || p === "/minigames") return "minigames";
      if (p === "/misje" || p === "/missions") return "missions";
      if (p === "/ranking") return "ranking";
      if (p === "/historia" || p === "/history") return "history";
    }
    return "games";
  }); // "games" | "minigames" | "missions" | "ranking" | "history" | "tos"

  // ToS Consent State
  const [tosAccepted, setTosAccepted] = useState(() => {
    try {
      return localStorage.getItem("kasyno_tos_accepted_v2") === "true";
    } catch {
      return false;
    }
  });

  const [tosModalOpen, setTosModalOpen] = useState(() => {
    try {
      return localStorage.getItem("kasyno_tos_accepted_v2") !== "true";
    } catch {
      return true;
    }
  });

  const [captchaOpen, setCaptchaOpen] = useState(false);

  const handleAcceptTos = useCallback(() => {
    try {
      localStorage.setItem("kasyno_tos_accepted_v2", "true");
    } catch { }
    setTosAccepted(true);
    setTosModalOpen(false);
    toast.success("Regulamin zaakceptowany. Witamy w grze!");
  }, []);

  // Per-game bet memory with default 50 $FGT for every game
  const [gameBets, setGameBets] = useState(() => {
    try {
      const saved = localStorage.getItem("fgt_game_bets");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const activeBet = activeGame ? (gameBets[activeGame] ?? 50) : 50;

  const setActiveBet = useCallback(
    (val) => {
      if (!activeGame) return;
      setGameBets((prev) => {
        const prevBet = prev[activeGame] ?? 50;
        const nextVal = typeof val === "function" ? val(prevBet) : val;
        const next = { ...prev, [activeGame]: nextVal };
        try {
          localStorage.setItem("fgt_game_bets", JSON.stringify(next));
        } catch { }
        return next;
      });
    },
    [activeGame]
  );

  const [choice, setChoice] = useState(null);
  const [mineCount, setMineCount] = useState(5);
  const [lastRound, setLastRound] = useState(null);

  const handleOpenGame = useCallback((gameId) => {
    if (!tosAccepted) {
      setTosModalOpen(true);
      toast.error("Musisz zaakceptować regulamin, aby rozpocząć grę.");
      return;
    }
    setActiveGame(gameId);
    setLastRound(null);
    setChoice(null);
  }, [tosAccepted]);

  // Turbo Mode
  const [turbo, setTurbo] = useState(() => {
    try {
      return localStorage.getItem("fgt_turbo_mode") === "true";
    } catch {
      return false;
    }
  });

  const handleSetTurbo = useCallback((val) => {
    setTurbo((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      try {
        localStorage.setItem("fgt_turbo_mode", String(next));
      } catch { }
      return next;
    });
  }, []);


  // Modals
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);

  // Live WebSocket Ticker
  const [recentWins, setRecentWins] = useState([]);

  const isAnimatingRef = useRef(false);
  const { muted, toggleMute } = useAudio();

  const syncBalance = useCallback((newBal) => {
    setData((prev) =>
      prev
        ? {
          ...prev,
          player: { ...prev.player, balance: newBal },
        }
        : prev
    );
  }, []);

  const handleGlobalWin = useCallback((winEvent) => {
    setRecentWins((prev) => {
      const key = winEvent.id || `${winEvent.nick}-${winEvent.payout}-${winEvent.game}`;
      const exists = prev.some((w) => (w.id && winEvent.id && w.id === winEvent.id) || `${w.nick}-${w.payout}-${w.game}` === key);
      if (exists) return prev;
      return [winEvent, ...prev.slice(0, 14)];
    });
  }, []);

  const { connected } = useWebSocket({
    onBalanceUpdate: (payload) => {
      if (typeof payload.balance === "number") {
        syncBalance(payload.balance);
      }
    },
    onGlobalWin: handleGlobalWin,
  });

  const load = useCallback(async (isPolling = false) => {
    if (isPolling && isAnimatingRef.current) return;
    try {
      const j = await fetchCasinoState();
      if (!j) return;

      if (j.recentWins && Array.isArray(j.recentWins)) {
        setRecentWins((prev) => {
          if (prev.length === 0) return j.recentWins;
          const seen = new Set();
          const combined = [];
          [...prev, ...j.recentWins].forEach((item) => {
            const key = item.id || `${item.nick}-${item.payout}-${item.game}-${item.settled_at || ""}`;
            if (!seen.has(key)) {
              seen.add(key);
              combined.push(item);
            }
          });
          return combined.slice(0, 15);
        });
      }

      setData((prev) => {
        const nextHistory = j.history || [];
        let combined = nextHistory;
        if (prev?.history && prev.history.length > nextHistory.length) {
          const ids = new Set(nextHistory.map((h) => h.id));
          const older = prev.history.filter((h) => !ids.has(h.id));
          combined = [...nextHistory, ...older];
        }
        return {
          ...j,
          history: combined,
          player:
            isPolling && isAnimatingRef.current && prev
              ? { ...j.player, balance: prev.player.balance }
              : j.player,
        };
      });
      if (typeof j.hasMoreHistory === "boolean") {
        setHasMoreHistory(j.hasMoreHistory);
      }
      if (j.active) setActiveGame(j.active.game);
    } catch (e) {
      if (!isPolling) {
        toast.error(e.message || "Błąd pobierania danych kasyna");
      }
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [syncBalance]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      if (!document.hidden && !isAnimatingRef.current) {
        void load(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const loadMoreHistory = async () => {
    if (loadingMoreHistory || !data?.history?.length) return;
    setLoadingMoreHistory(true);
    try {
      const res = await fetchHistoryEntries(data.history.length, 10);
      if (res?.entries) {
        setData((prev) => {
          if (!prev) return prev;
          const currentIds = new Set(prev.history.map((h) => h.id));
          const newEntries = res.entries.filter((h) => !currentIds.has(h.id));
          return {
            ...prev,
            history: [...prev.history, ...newEntries],
          };
        });
        setHasMoreHistory(Boolean(res.hasMore));
      }
    } catch (e) {
      toast.error(e.message || "Nie udało się pobrać kolejnych wpisów");
    } finally {
      setLoadingMoreHistory(false);
    }
  };

  const post = async (body, opts) => {
    if (!tosAccepted) {
      setTosModalOpen(true);
      toast.error("Musisz zaakceptować regulamin, aby zagrać.");
      return null;
    }
    const isSilent = Boolean(opts?.silent);
    if (!isSilent) {
      setLoading(true);
    }
    try {
      const j = await postCasinoAction(body);
      if (!j) {
        if (!isSilent) setLoading(false);
        return null;
      }

      if (j.round) {
        if (!opts?.deferBalance) {
          setLastRound(j.round);
        }
        setData((prev) =>
          prev
            ? {
              ...prev,
              player: {
                ...prev.player,
                balance: opts?.deferBalance
                  ? typeof opts.deductBet === "number"
                    ? Math.max(0, prev.player.balance - opts.deductBet)
                    : prev.player.balance
                  : typeof j.balance === "number"
                    ? j.balance
                    : prev.player.balance,
              },
              roundsToday:
                typeof j.roundsToday === "number"
                  ? j.roundsToday
                  : prev.roundsToday,
              active: j.round.state === "active" ? j.round : null,
            }
            : prev
        );
        if (!isSilent) setLoading(false);
        if (j.leveledUp && j.levelUpBonus) {
          try {
            confetti({
              particleCount: 90,
              spread: 80,
              origin: { y: 0.6 },
              colors: ["#f59e0b", "#fbbf24", "#10b981", "#ffffff"],
            });
          } catch { }
          toast.success(`🎉 AWANS NA POZIOM ${j.level}!`, {
            description: `Otrzymujesz nagrodę +${money(j.levelUpBonus)} w darmowych żetonach!`,
            duration: 6000,
          });
        }
        if (j.round.state !== "active" && !opts?.deferRefresh && !opts?.deferBalance) {
          void load();
        }
        return j;
      }
      await load();
      return j;
    } catch (e) {
      toast.error(e.message || "Błąd wykonania akcji");
      void load();
      return null;
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const userNick = data?.player?.nick || "Gracz";
  const bonusAvailable = Boolean(data && data.player.last_bonus_day !== data.today);
  const xpCurrent = (data?.player?.xp || 0) % 500;
  const xpProgress = Math.min(100, (xpCurrent / 500) * 100);

  const missions = data?.missions || [];
  const readyMissionsCount = missions.filter((m) => m.ready).length;
  const claimedMissionsCount = missions.filter((m) => m.claimed).length;
  const totalMissionsCount = missions.length || 4;

  // Dynamic remaining time countdown for 6-hour mission resets
  const [missionCountdown, setMissionCountdown] = useState("");

  useEffect(() => {
    const updateCountdown = () => {
      const nextReset =
        data?.missionNextReset ||
        Math.ceil(Date.now() / (6 * 3600 * 1000)) * (6 * 3600 * 1000);
      const diff = Math.max(0, nextReset - Date.now());

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const pad = (n) => String(n).padStart(2, "0");
      setMissionCountdown(`${hours}h ${pad(minutes)}m ${pad(seconds)}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [data?.missionNextReset]);

  const getMissionIcon = (iconName) => {
    switch (iconName) {
      case "roulette":
        return <Dices size={18} className="text-amber-400" />;
      case "pickaxe":
      case "mines":
        return <Pickaxe size={18} className="text-emerald-400" />;
      case "spade":
      case "blackjack":
        return <Spade size={18} className="text-purple-400" />;
      case "zap":
      case "slots":
        return <Zap size={18} className="text-yellow-400" />;
      case "coin":
      case "coinflip":
      case "coins":
        return <Coins size={18} className="text-amber-400" />;
      case "rps":
        return <Scissors size={18} className="text-pink-400" />;
      case "plinko":
        return <CircleDot size={18} className="text-blue-400" />;
      case "crash":
      case "rocket":
        return <Rocket size={18} className="text-rose-400" />;
      case "limbo":
      case "trending":
        return <TrendingUp size={18} className="text-emerald-400" />;
      case "crown":
        return <Crown size={18} className="text-amber-300" />;
      case "trophy":
      case "wager":
        return <Trophy size={18} className="text-amber-400" />;
      case "sparkles":
        return <Sparkles size={18} className="text-teal-400" />;
      default:
        return <Flame size={18} className="text-orange-400" />;
    }
  };

  const getMissionGameId = (m) => {
    if (m.id.includes("crash")) return "crash";
    if (m.id.includes("limbo")) return "limbo";
    if (m.id.includes("plinko")) return "plinko";
    if (m.id.includes("roulette")) return "roulette";
    if (m.id.includes("mines")) return "mines";
    if (m.id.includes("blackjack")) return "blackjack";
    if (m.id.includes("slots")) return "slots";
    if (m.id.includes("coinflip")) return "coinflip";
    if (m.id.includes("rps")) return "rps";
    return null;
  };

  const gamesList = [
    {
      id: "crash",
      name: "Crash",
      badge: "RTP 99%",
      mult: "Do ×1000",
      desc: "Obserwuj rosnący mnożnik. Wypłać zanim nastąpi crash.",
      img: "/crash-hero.webp",
    },
    {
      id: "limbo",
      name: "Limbo",
      badge: "RTP 99%",
      mult: "Do ×10000",
      desc: "Ustaw docelowy mnożnik i obstaw wynik wyższy od celu.",
      img: "/limbo-hero.webp",
    },
    {
      id: "plinko",
      name: "Plinko",
      badge: "Do ×1000",
      mult: "8–16 rzędów",
      desc: "Upuszczaj kule przez piramidę kołków. Trzy poziomy ryzyka.",
      img: "/plinko-hero.webp",
    },
    {
      id: "mines",
      name: "Mines",
      badge: "RTP 97%",
      mult: "Do ×100",
      desc: "Odkrywaj diamenty na siatce 5×5. Wypłać kiedy chcesz.",
      img: "/mines-hero.webp",
    },
    {
      id: "coinflip",
      name: "Coinflip",
      badge: "RTP 99%",
      mult: "×1.98",
      desc: "Rzut monetą. Wybierz Orła lub Reszkę.",
      img: "/coinflip-hero.webp",
    },
    {
      id: "rps",
      name: "Kamień Papier Nożyce",
      badge: "PvE",
      mult: "×1.98",
      desc: "Klasyczny pojedynek z krupierem.",
      img: "/rps-hero.webp",
    },
    {
      id: "roulette",
      name: "Ruletka",
      badge: "RTP 97.3%",
      mult: "Do ×36",
      desc: "Europejska ruletka z pojedynczym zerem. Numery, kolory, tuziny.",
      img: "/roulette-hero.webp",
    },
    {
      id: "blackjack",
      name: "Blackjack",
      badge: "Wypłata 3:2",
      mult: "×1.5",
      desc: "Graj przeciwko krupierowi. Dobieraj karty do 21.",
      img: "/blackjack-hero.webp",
    },
    {
      id: "slots",
      name: "Slots",
      badge: "5 bębnów",
      mult: "Do ×12",
      desc: "Klasyczny automat. Trafiaj linie 3, 4 lub 5 symboli.",
      img: "/slot-hero.webp",
    },
  ];

  return (
    <div className="app-shell">
      <Toaster theme="dark" position="bottom-right" richColors />

      {/* Clean Top Header */}
      <header className="topbar">
        <button className="brand" onClick={() => { setActiveGame(null); setActiveTab("games"); }} aria-label="Strona główna">
          <img src="/logo.svg" alt="2fgt Kasyno" className="brand-logo-img" />
        </button>

        {/* Desktop Navigation Tabs */}
        <nav className="topbar-nav" aria-label="Nawigacja główna">
          <button
            type="button"
            className={`topbar-nav-btn ${activeTab === "games" ? "active" : ""}`}
            onClick={() => { setActiveTab("games"); setActiveGame(null); }}
          >
            <Spade size={15} />
            <span>Gry</span>
          </button>
          <button
            type="button"
            className={`topbar-nav-btn ${activeTab === "minigames" ? "active" : ""}`}
            onClick={() => { setActiveTab("minigames"); setActiveGame(null); }}
          >
            <Gamepad2 size={15} />
            <span>Minigry</span>
          </button>
          <button
            type="button"
            className={`topbar-nav-btn ${activeTab === "missions" ? "active" : ""}`}
            onClick={() => { setActiveTab("missions"); setActiveGame(null); }}
          >
            <Target size={15} />
            <span>Misje</span>
            {readyMissionsCount > 0 && <span className="topbar-badge">{readyMissionsCount}</span>}
          </button>
          <button
            type="button"
            className={`topbar-nav-btn ${activeTab === "ranking" ? "active" : ""}`}
            onClick={() => { setActiveTab("ranking"); setActiveGame(null); }}
          >
            <Trophy size={15} />
            <span>Ranking</span>
          </button>
          <button
            type="button"
            className={`topbar-nav-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => { setActiveTab("history"); setActiveGame(null); }}
          >
            <History size={15} />
            <span>Historia</span>
          </button>
        </nav>

        {/* Right Actions: Audio, Balance, Avatar */}
        <div className="topbar-actions">

          <button
            type="button"
            className="icon-btn"
            onClick={toggleMute}
            title={muted ? "Włącz dźwięk" : "Wycisz"}
            aria-label="Dźwięk"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          <div className="balance-chip" title="Stan Twojego portfela">
            <FgtChip small />
            <span className="balance-val">{data ? money(data.player.balance) : "—"}</span>
          </div>

          <button
            type="button"
            className="user-btn"
            onClick={() => setProfileOpen(true)}
            title={`Profil: ${userNick}`}
          >
            {data?.player?.avatar ? (
              <img src={data.player.avatar} alt={userNick} className="user-btn-avatar" />
            ) : (
              userNick.slice(0, 2).toUpperCase()
            )}
          </button>
        </div>
      </header>

      {/* Live Wins Ticker */}
      <LiveTicker wins={recentWins} />

      {/* Main Content Area */}
      <main className="main-content">
        {loading && !data ? (
          <div className="loading-box">
            <div className="spinner" />
            <span>Ładowanie kasyna...</span>
          </div>
        ) : (
          <>
            {/* Player Utility Strip */}
            <section className="player-summary-card">
              <div className="player-summary-left">
                <div className="player-strip-avatar-wrap">
                  {data?.player?.avatar ? (
                    <img src={data.player.avatar} alt={userNick} className="player-strip-avatar" />
                  ) : (
                    <div className="player-strip-avatar-fallback">{userNick.slice(0, 2).toUpperCase()}</div>
                  )}
                </div>
                <div className="flex flex-col">
                  <div className="player-nick-row">
                    <span className="player-name">{userNick}</span>
                    <span className="level-pill">POZIOM {data?.player?.level || 1}</span>
                  </div>
                  <div className="xp-wrap">
                    <div className="xp-meter">
                      <div className="xp-fill" style={{ width: `${xpProgress}%` }} />
                    </div>
                    <span className="xp-text">{xpCurrent} / 500 XP</span>
                  </div>
                </div>
              </div>

              <div className="player-summary-right">
                <button
                  type="button"
                  disabled={!bonusAvailable || loading}
                  className={`streak-bonus-btn ${bonusAvailable ? "ready" : "done"}`}
                  onClick={async () => {
                    const j = await post({ action: "bonus" });
                    if (j?.amount) toast.success(`Odebrano +${money(j.amount)} do salda!`);
                  }}
                >
                  <Flame size={14} className={bonusAvailable ? "text-amber-400" : "text-slate-500"} />
                  <span>
                    {bonusAvailable
                      ? `Odbierz +${money(dailyBonus((data?.player?.streak || 0) + 1))}`
                      : `Seria: ${data?.player?.streak || 0} dni`}
                  </span>
                </button>
              </div>
            </section>

            {/* View Tab: Dedicated Terms of Service Page */}
            {activeTab === "tos" && (
              <TosPage
                onBack={() => setActiveTab("games")}
                onAccept={handleAcceptTos}
                accepted={tosAccepted}
              />
            )}

            {/* View Tab 1: Games Grid */}
            {activeTab === "games" && (
              <section className="games-section">
                <div className="games-grid">
                  {gamesList.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="game-card"
                      aria-label={`Zagraj w ${g.name}`}
                      onClick={() => handleOpenGame(g.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleOpenGame(g.id);
                        }
                      }}
                    >
                      <div className="game-card-media">
                        <img src={g.img} alt="" className="game-card-img" aria-hidden="true" />
                        <div className="game-card-gradient" />
                        <span className="tag-badge">{g.badge}</span>
                      </div>
                      <div className="game-card-info">
                        <div className="game-card-title-row">
                          <h3 className="game-card-title">{g.name}</h3>
                          <span className="game-card-mult">{g.mult}</span>
                        </div>
                        <p className="game-card-desc">{g.desc}</p>
                        <span className="btn-play-game" aria-hidden="true">
                          Zagraj <ChevronRight size={13} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* View Tab: Minigames Grid */}
            {activeTab === "minigames" && (
              <section className="games-section">
                <div className="games-grid">
                  {MINIGAMES.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={`game-card ${!g.active ? "opacity-60 cursor-not-allowed" : ""}`}
                      aria-label={`Zagraj w ${g.name}`}
                      onClick={() => {
                        if (g.active) {
                          setSelectedMinigameId(g.id);
                          setCaptchaOpen(true);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (g.active) {
                            setSelectedMinigameId(g.id);
                            setCaptchaOpen(true);
                          }
                        }
                      }}
                    >
                      <div className="game-card-media">
                        <img src={g.img} alt="" className="game-card-img" aria-hidden="true" />
                        <div className="game-card-gradient" />
                        <span className="tag-badge gold">{g.badge}</span>
                      </div>
                      <div className="game-card-info">
                        <div className="game-card-title-row">
                          <h3 className="game-card-title">{g.name}</h3>
                          <span className="game-card-mult text-emerald-400">{g.reward}</span>
                        </div>
                        <p className="game-card-desc">{g.desc}</p>
                        <span className="btn-play-game" aria-hidden="true">
                          {g.active ? (
                            <>
                              Zagraj <ChevronRight size={13} />
                            </>
                          ) : (
                            "Wkrótce"
                          )}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* View Tab 2: Expanded Missions Hub */}
            {activeTab === "missions" && (
              <section className="tab-section">
                {/* Missions Header Hub */}
                <div className="missions-hub-banner">
                  <div className="missions-hub-info">
                    <div className="flex items-center gap-2">
                      <Target size={18} className="text-amber-400" />
                      <h2 className="missions-hub-title">Misje Kasyna (Co 6h)</h2>
                    </div>
                    <p className="missions-hub-subtitle">
                      Wykonuj zadania w grach (min. stawka 50 $FGT), zdobywaj żetony $FGT i punkty XP. Pula 4 misji odnawia się automatycznie co 6 godzin.
                    </p>
                  </div>
                  <div className="missions-hub-stats">
                    <div className="missions-stat-box">
                      <span className="missions-stat-label">Ukończono</span>
                      <span className="missions-stat-val text-amber-400">{claimedMissionsCount} / {totalMissionsCount}</span>
                    </div>
                    <div className="missions-stat-box">
                      <span className="missions-stat-label">Pozostały czas</span>
                      <span className="missions-stat-val text-amber-300 font-mono flex items-center gap-1.5">
                        <Clock size={13} className="text-amber-400 animate-pulse" />
                        {missionCountdown || "Obliczanie..."}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Missions Cards Grid */}
                <div className="missions-grid">
                  {missions.map((m) => {
                    const gameId = getMissionGameId(m);
                    const progressPercent = Math.min(100, Math.round((m.current / m.target) * 100));

                    return (
                      <div
                        key={m.id}
                        className={`mission-card ${m.claimed ? "claimed" : m.ready ? "ready" : ""}`}
                      >
                        <div className="mission-card-top">
                          <div className="mission-card-icon-wrap">
                            {getMissionIcon(m.icon)}
                          </div>
                          <div className="mission-card-main-info">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <span className="mission-category-pill">{m.category}</span>
                              <span className="mission-reward-pill">+{format(m.reward)} $FGT</span>
                              <span className="mission-xp-pill">+{m.xp_reward} XP</span>
                            </div>
                            <h3 className="mission-title">{m.title}</h3>
                            <p className="mission-desc">{m.description}</p>
                          </div>
                        </div>

                        {/* Progress Section */}
                        <div className="mission-progress-section">
                          <div className="mission-progress-bar-bg">
                            <div
                              className={`mission-progress-bar-fill ${m.claimed ? "bg-slate-600" : m.ready ? "bg-emerald-500" : "bg-amber-500"
                                }`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <div className="mission-progress-text-row">
                            <span className="mission-progress-count">
                              {m.id === "daily_wager_1000"
                                ? `${format(m.current)} / ${format(m.target)} $FGT`
                                : `${m.current} / ${m.target}`}
                            </span>
                            <span className="mission-progress-percent">{progressPercent}%</span>
                          </div>
                        </div>

                        {/* Card Action */}
                        <div className="mission-card-action">
                          {m.claimed ? (
                            <div className="mission-status-claimed">
                              <CheckCircle2 size={14} />
                              <span>Odebrano</span>
                            </div>
                          ) : m.ready ? (
                            <button
                              type="button"
                              disabled={loading}
                              className="btn-mission-claim"
                              onClick={async () => {
                                const j = await post({ action: "claim_mission", mission_id: m.id });
                                if (j?.ok) {
                                  toast.success(`Odebrano nagrodę +${money(j.amount)} & +${j.xp} XP!`);
                                }
                              }}
                            >
                              <Sparkles size={14} />
                              <span>Odbierz +{format(m.reward)} $FGT</span>
                            </button>
                          ) : (
                            <div className="mission-in-progress-row">
                              <span className="mission-in-progress-label">W toku</span>
                              {gameId && (
                                <button
                                  type="button"
                                  className="btn-mission-quickplay"
                                  onClick={() => {
                                    setActiveGame(gameId);
                                    setLastRound(null);
                                  }}
                                >
                                  Zagraj <ChevronRight size={12} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* View Tab 3: Ranking */}
            {activeTab === "ranking" && (
              <section className="tab-section">
                <div className="panel-box ranking-panel">
                  <div className="panel-box-header">
                    <div>
                      <span className="sub-label">TABELA WYNIKÓW</span>
                      <h3>Ranking graczy</h3>
                    </div>
                    {rankingType === "level" ? (
                      <Star size={18} className="text-amber-400 fill-amber-400/20" />
                    ) : (
                      <Trophy size={18} className="text-amber-400" />
                    )}
                  </div>

                  {/* Subtab Switcher: Bogactwo vs Poziom */}
                  <div className="ranking-subtabs">
                    <button
                      className={`ranking-subtab-btn ${rankingType === "balance" ? "active" : ""}`}
                      onClick={() => setRankingType("balance")}
                    >
                      <Coins size={14} />
                      <span>Bogactwo ($FGT)</span>
                    </button>
                    <button
                      className={`ranking-subtab-btn ${rankingType === "level" ? "active" : ""}`}
                      onClick={() => setRankingType("level")}
                    >
                      <Award size={14} />
                      <span>Poziom (LVL / XP)</span>
                    </button>
                  </div>

                  {/* Pinned Current User Card at Top */}
                  {data?.player && (
                    <div className="ranking-pinned-user">
                      <div className="ranking-left">
                        {rankingType === "level" ? (
                          <span className={`rank-place-badge ${data?.playerLevelRank <= 3 ? `place-${data.playerLevelRank}` : ""}`}>
                            #{data?.playerLevelRank || 1}
                          </span>
                        ) : (
                          <span className={`rank-place-badge ${data?.playerRank <= 3 ? `place-${data.playerRank}` : ""}`}>
                            #{data?.playerRank || 1}
                          </span>
                        )}
                        <div className="ranking-user-avatar">
                          {data?.player?.avatar ? (
                            <img src={data.player.avatar} alt={userNick} className="ranking-avatar-img" />
                          ) : (
                            userNick.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="rank-name font-bold text-slate-100">{userNick}</span>
                            <span className="rank-you-badge">Ty</span>
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {rankingType === "level"
                              ? `Stan konta: ${money(data.player.balance)}`
                              : `Poziom ${data.player.level || 1} • ${data.player.xp || 0} XP`}
                          </span>
                        </div>
                      </div>
                      <div className="ranking-right">
                        {rankingType === "level" ? (
                          <div className="flex flex-col items-end">
                            <span className="rank-level-badge pinned">
                              LVL {data.player.level || 1}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono font-bold mt-0.5">
                              {data.player.xp || 0} XP
                            </span>
                          </div>
                        ) : (
                          <span className="rank-balance font-mono font-bold text-amber-400">
                            {money(data.player.balance)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Divider / Przedziałka */}
                  <div className="ranking-divider">
                    <span className="ranking-divider-line" />
                    <span className="ranking-divider-text">
                      {rankingType === "level" ? "NAJWYŻSZE POZIOMY (XP)" : "TOPKA KASYNA ($FGT)"}
                    </span>
                    <span className="ranking-divider-line" />
                  </div>

                  {/* Scrollable Leaderboard List */}
                  <div className="ranking-list-scrollable">
                    {(() => {
                      const leadersList = rankingType === "level" ? data?.levelLeaders : data?.leaders;
                      if (!leadersList || leadersList.length === 0) {
                        return <p className="empty-text">Brak danych w rankingu.</p>;
                      }
                      return leadersList.map((l, idx) => {
                        const isMe = l.nick === userNick;
                        const rankNum = idx + 1;
                        return (
                          <div
                            key={l.nick || idx}
                            className={`ranking-row ${isMe ? "ranking-row-me" : ""}`}
                          >
                            <div className="ranking-left">
                              <span className={`rank-place place-${rankNum}`}>
                                #{rankNum}
                              </span>
                              <div className="ranking-row-avatar">
                                {l.avatar ? (
                                  <img src={l.avatar} alt={l.nick} className="ranking-avatar-img" />
                                ) : (
                                  (l.nick || "G").slice(0, 2).toUpperCase()
                                )}
                              </div>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                  <span className="rank-name">{l.nick || "Gracz"}</span>
                                  {isMe && <span className="rank-you-pill">Ty</span>}
                                </div>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {rankingType === "level"
                                    ? `Konto: ${money(l.balance)}`
                                    : `Poziom ${l.level || 1}`}
                                </span>
                              </div>
                            </div>
                            {rankingType === "level" ? (
                              <div className="flex flex-col items-end">
                                <span className="rank-level-badge">LVL {l.level || 1}</span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {l.xp || 0} XP
                                </span>
                              </div>
                            ) : (
                              <span className="rank-balance">{money(l.balance)}</span>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </section>
            )}

            {/* View Tab 4: History */}
            {activeTab === "history" && (
              <section className="tab-section">
                <div className="panel-box">
                  <div className="panel-box-header">
                    <div>
                      <span className="sub-label">DZIENNIK ROZLICZEŃ</span>
                      <h3>Historia Twojego konta</h3>
                    </div>
                  </div>

                  {data?.history?.length ? (
                    <div className="history-stream">
                      {data.history.map((r) => {
                        const details = getHistoryDetails(r);
                        const timeStr = formatHistoryTime(r.createdAt || r.created_at);
                        const isPositive = r.amount > 0;
                        const isNegative = r.amount < 0;

                        return (
                          <div key={r.id} className="history-stream-row">
                            <div className="history-stream-info">
                              <span className="history-stream-title">{details.title}</span>
                              <span className="history-stream-sub">{details.subtitle}</span>
                            </div>
                            <div className="history-stream-amount">
                              <b className={isPositive ? "win" : isNegative ? "loss" : "neutral"}>
                                {isPositive ? "+" : ""}{money(r.amount)}
                              </b>
                              {timeStr && <span className="history-stream-time">{timeStr}</span>}
                            </div>
                          </div>
                        );
                      })}

                      {hasMoreHistory && (
                        <button
                          type="button"
                          className="btn-more-history"
                          onClick={loadMoreHistory}
                          disabled={loadingMoreHistory}
                        >
                          {loadingMoreHistory ? "Wczytywanie..." : "Pokaż starsze wpisy"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="empty-text">Brak historii gier.</p>
                  )}
                </div>
              </section>
            )}

            {/* Casino Footer with Links */}
            <footer className="casino-footer">
              <div className="casino-footer-inner">
                <div className="casino-footer-brand">
                  <div className="flex items-center gap-2">
                    <img src="/logo.svg" alt="2fgt Kasyno" className="brand-logo-img small" />
                    <span className="font-extrabold text-sm tracking-wider text-slate-200">KASYNO</span>
                  </div>
                  <p className="casino-footer-tagline">
                    Niekomercyjna platforma rozrywkowa społeczności 2FGT.
                  </p>
                </div>

                <div className="casino-footer-links">
                  <button type="button" className="footer-link" onClick={() => setActiveTab("games")}>
                    <Spade size={13} /> Gry
                  </button>
                  <button type="button" className="footer-link" onClick={() => setActiveTab("minigames")}>
                    <Gamepad2 size={13} /> Minigry
                  </button>
                  <button type="button" className="footer-link" onClick={() => setActiveTab("missions")}>
                    <Target size={13} /> Misje
                  </button>
                  <button type="button" className="footer-link" onClick={() => setActiveTab("ranking")}>
                    <Trophy size={13} /> Ranking
                  </button>
                  <button type="button" className="footer-link" onClick={() => setActiveTab("history")}>
                    <History size={13} /> Dziennik
                  </button>
                  <button type="button" className="footer-link" onClick={() => setActiveTab("tos")}>
                    <Scale size={13} /> Regulamin i Zasady
                  </button>
                </div>
              </div>
            </footer>

          </>
        )}
      </main>


      {/* Mobile App Bottom Nav */}
      <nav className="mobile-tab-bar">
        <button
          className={`mobile-tab-item ${activeTab === "games" ? "active" : ""}`}
          onClick={() => { setActiveTab("games"); setActiveGame(null); }}
        >
          <Spade size={19} />
          <span>Gry</span>
        </button>

        <button
          className={`mobile-tab-item ${activeTab === "minigames" ? "active" : ""}`}
          onClick={() => { setActiveTab("minigames"); setActiveGame(null); }}
          title="Minigry i darmowe żetony"
        >
          <Gamepad2 size={19} />
          <span>Minigry</span>
        </button>

        <button
          className={`mobile-tab-item ${activeTab === "missions" ? "active" : ""}`}
          onClick={() => { setActiveTab("missions"); setActiveGame(null); }}
        >
          <div className="relative">
            <Target size={19} />
            {readyMissionsCount > 0 && <span className="mobile-tab-dot" />}
          </div>
          <span>Misje</span>
        </button>

        <button
          className={`mobile-tab-item ${activeTab === "ranking" ? "active" : ""}`}
          onClick={() => { setActiveTab("ranking"); setActiveGame(null); }}
        >
          <Trophy size={19} />
          <span>Ranking</span>
        </button>

        <button
          className={`mobile-tab-item ${activeTab === "history" ? "active" : ""}`}
          onClick={() => { setActiveTab("history"); setActiveGame(null); }}
        >
          <History size={19} />
          <span>Historia</span>
        </button>
      </nav>


      {/* Active Game Table Dialog */}
      {activeGame && (
        <GameTableDialog
          game={activeGame}
          onClose={() => setActiveGame(null)}
          data={data}
          bet={activeBet}
          setBet={setActiveBet}
          choice={choice}
          setChoice={setChoice}
          mineCount={mineCount}
          setMineCount={setMineCount}
          post={post}
          load={load}
          syncBalance={syncBalance}
          animatingRef={isAnimatingRef}
          last={lastRound}
          setLast={setLastRound}
          loading={loading}
          turbo={turbo}
          setTurbo={handleSetTurbo}
          tosAccepted={tosAccepted}
          onOpenTosModal={() => setTosModalOpen(true)}
        />
      )}

      {/* Modals */}
      <HistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={data?.history || []}
        hasMore={hasMoreHistory}
        loadingMore={loadingMoreHistory}
        onLoadMore={loadMoreHistory}
      />

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        player={data?.player}
        stats={data?.stats}
        userNick={userNick}
        onOpenHistory={() => {
          setProfileOpen(false);
          setActiveTab("history");
        }}
      />


      <InfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        onOpenTos={() => {
          setInfoOpen(false);
          setActiveTab("tos");
        }}
      />

      {/* Entry ToS Consent Modal */}
      <TosAcceptModal
        open={tosModalOpen}
        onAccept={handleAcceptTos}
        onReadMore={() => {
          setTosModalOpen(false);
          setActiveTab("tos");
        }}
      />

      {/* Mini-Games Hub Modal */}
      <MinigamesModal
        isOpen={captchaOpen}
        initialGame={selectedMinigameId}
        onClose={() => setCaptchaOpen(false)}
        syncBalance={syncBalance}
        currentBalance={data?.player?.balance}
      />

      {/* Full-Screen Centered Reconnecting Blur Overlay */}
      {!connected && (
        <div className="reconnecting-overlay" role="alert" aria-live="assertive">
          <div className="reconnecting-card">
            <div className="reconnecting-spinner-wrap">
              <div className="reconnecting-spinner" />
              <div className="reconnecting-pulse" />
            </div>
            <h2 className="reconnecting-title">Łączenie ponownie...</h2>
            <p className="reconnecting-subtitle">
              Utracono połączenie z serwerem kasyna. Trwa próba ponownego nawiązania sesji na żywo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
