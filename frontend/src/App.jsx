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
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { fetchCasinoState, postCasinoAction, fetchHistoryEntries } from "./lib/api";
import { money, dailyBonus, formatHistoryTime, getHistoryDetails, format } from "./lib/formatters";
import { FgtChip } from "./components/BetControls";
import { GameTableDialog } from "./components/GameTableDialog";
import { HistoryModal } from "./components/HistoryModal";
import { ProfileModal } from "./components/ProfileModal";
import { InfoModal } from "./components/InfoModal";
import { LiveTicker } from "./components/LiveTicker";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAudio } from "./hooks/useAudio";

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeGame, setActiveGame] = useState(null);
  const [activeTab, setActiveTab] = useState("games"); // "games" | "missions" | "ranking" | "history"

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
        } catch {}
        return next;
      });
    },
    [activeGame]
  );

  const [choice, setChoice] = useState("red");
  const [mineCount, setMineCount] = useState(5);
  const [lastRound, setLastRound] = useState(null);

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

  useWebSocket({
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
    setLoading(true);
    try {
      const j = await postCasinoAction(body);
      if (!j) {
        setLoading(false);
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
        setLoading(false);
        if (j.round.state !== "active" && !opts?.deferRefresh && !opts?.deferBalance) {
          void load();
        }
        return j;
      }
      await load();
      return j;
    } catch (e) {
      toast.error(e.message || "Błąd operacji");
      setLoading(false);
      return null;
    }
  };

  const userNick = data?.player?.nick || "Gracz";
  const bonusAvailable = Boolean(data && data.player.last_bonus_day !== data.today);
  const xpCurrent = (data?.player?.xp || 0) % 500;
  const xpProgress = Math.min(100, (xpCurrent / 500) * 100);

  const missions = data?.missions || [];
  const readyMissionsCount = missions.filter((m) => m.ready).length;
  const claimedMissionsCount = missions.filter((m) => m.claimed).length;
  const totalMissionsCount = missions.length || 6;

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
      name: "Crash (Aviator)",
      badge: "RTP 99.0%",
      mult: "Do ×1000+",
      desc: "Obserwuj rosnący mnożnik rakiety w czasie rzeczywistym. Wypłać wygraną, zanim nastąpi Crash!",
      img: "/crash-hero.webp",
    },
    {
      id: "limbo",
      name: "Limbo Multiplier",
      badge: "RTP 99.0%",
      mult: "Do ×10000",
      desc: "Ustaw docelowy mnożnik i obstaw wynik wyższy od celu. Prosta, dynamiczna gra wysokich wygranych.",
      img: "/limbo-hero.webp",
    },
    {
      id: "plinko",
      name: "Plinko Stake",
      badge: "Do ×1000",
      mult: "Fizyka kołków",
      desc: "Upuszczaj kule przez piramidę kołków. Konfiguruj 8–16 rzędów i 3 poziomy ryzyka wygranych.",
      img: "/plinko-hero.webp",
    },
    {
      id: "mines",
      name: "Mines (Saper)",
      badge: "RTP 97.0%",
      mult: "Do ×100+",
      desc: "Odkrywaj diamenty na siatce 5×5. Ty decydujesz, kiedy zabezpieczyć zysk i wypłacić stawkę.",
      img: "/mines-hero.webp",
    },
    {
      id: "coinflip",
      name: "Coin Flip",
      badge: "RTP 99.0%",
      mult: "Mnożnik ×1.98",
      desc: "Szybki rzut monetą 3D. Wybierz Orła lub Reszkę i podwajaj stawkę w ułamku sekundy.",
      img: "/coinflip-hero.webp",
    },
    {
      id: "rps",
      name: "Kamień Papier Nożyce",
      badge: "PvE Duel",
      mult: "Mnożnik ×1.98",
      desc: "Klasyczny pojedynek z krupierem. Kamień bije nożyce, nożyce papier, papier kamień.",
      img: "/rps-hero.webp",
    },
    {
      id: "roulette",
      name: "Ruletka Europejska",
      badge: "RTP 97.3%",
      mult: "×36 / ×3 / ×2",
      desc: "Autentyczne koło z pojedynczym zerem (0). Stawiaj na konkretne numery, kolory, tuziny i parzystość.",
      img: "/roulette-hero.webp",
    },
    {
      id: "blackjack",
      name: "Blackjack 21",
      badge: "Wypłata 3:2",
      mult: "Blackjack 3:2",
      desc: "Graj przeciwko krupierowi. Dobieraj karty do 21 punktów, podwajaj stawki i wygrywaj.",
      img: "/blackjack-hero.webp",
    },
    {
      id: "slots",
      name: "Midnight 2FGT",
      badge: "5 Bębnów",
      mult: "Do ×12",
      desc: "Klasyczny automat owocowo-neonowy. Trafiaj linie 3, 4 lub 5 symboli na środkowej linii.",
      img: "/slot-hero.webp",
    },
  ];

  return (
    <div className="app-shell">
      <Toaster theme="dark" position="bottom-right" richColors />

      {/* Clean Top Header */}
      <header className="topbar">
        <button className="brand" onClick={() => { setActiveGame(null); setActiveTab("games"); }}>
          <div className="brand-logo">2F</div>
          <span className="brand-name">KASYNO</span>
        </button>

        {/* Desktop Segmented Navigation */}
        <nav className="desktop-nav" aria-label="Nawigacja główna">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "games" ? "active" : ""}`}
            onClick={() => setActiveTab("games")}
          >
            <Spade size={15} />
            <span>Gry</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "missions" ? "active" : ""}`}
            onClick={() => setActiveTab("missions")}
          >
            <Target size={15} />
            <span>Misje</span>
            {readyMissionsCount > 0 ? (
              <span className="nav-badge ready">{readyMissionsCount}</span>
            ) : (
              <span className="nav-badge">{claimedMissionsCount}/{totalMissionsCount}</span>
            )}
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "ranking" ? "active" : ""}`}
            onClick={() => setActiveTab("ranking")}
          >
            <Trophy size={15} />
            <span>Ranking</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <History size={15} />
            <span>Historia</span>
          </button>

          <button
            type="button"
            className="nav-tab-btn-secondary"
            onClick={() => setInfoOpen(true)}
          >
            <Info size={14} />
            <span>Zasady</span>
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
            {userNick.slice(0, 2).toUpperCase()}
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

            {/* Mobile Tab Pill Switcher */}
            <div className="mobile-pill-switcher">
              <button
                type="button"
                className={`pill-btn ${activeTab === "games" ? "active" : ""}`}
                onClick={() => setActiveTab("games")}
              >
                Gry
              </button>
              <button
                type="button"
                className={`pill-btn ${activeTab === "missions" ? "active" : ""}`}
                onClick={() => setActiveTab("missions")}
              >
                Misje {readyMissionsCount > 0 ? `(${readyMissionsCount}!)` : `(${claimedMissionsCount}/${totalMissionsCount})`}
              </button>
              <button
                type="button"
                className={`pill-btn ${activeTab === "ranking" ? "active" : ""}`}
                onClick={() => setActiveTab("ranking")}
              >
                Ranking
              </button>
              <button
                type="button"
                className={`pill-btn ${activeTab === "history" ? "active" : ""}`}
                onClick={() => setActiveTab("history")}
              >
                Historia
              </button>
            </div>

            {/* View Tab 1: Games Grid */}
            {activeTab === "games" && (
              <section className="games-section">
                <div className="games-grid">
                  {gamesList.map((g) => (
                    <div
                      key={g.id}
                      className="game-card"
                      onClick={() => {
                        setActiveGame(g.id);
                        setLastRound(null);
                      }}
                    >
                      <div className="game-card-media">
                        <img src={g.img} alt={g.name} className="game-card-img" />
                        <div className="game-card-gradient" />
                        <span className="tag-badge">{g.badge}</span>
                      </div>
                      <div className="game-card-info">
                        <div className="game-card-title-row">
                          <h3 className="game-card-title">{g.name}</h3>
                          <span className="game-card-mult">{g.mult}</span>
                        </div>
                        <p className="game-card-desc">{g.desc}</p>
                        <button type="button" className="btn-play-game">
                          Zagraj <ChevronRight size={13} />
                        </button>
                      </div>
                    </div>
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
                      Wykonuj zadania w grach, zdobywaj darmowe żetony $FGT i punkty XP. Pula misji odnawia się automatycznie co 6 godzin.
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
                              className={`mission-progress-bar-fill ${
                                m.claimed ? "bg-slate-600" : m.ready ? "bg-emerald-500" : "bg-amber-500"
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
                <div className="panel-box">
                  <div className="panel-box-header">
                    <div>
                      <span className="sub-label">TABELA WYNIKÓW</span>
                      <h3>Najbogatsi gracze</h3>
                    </div>
                    <Trophy size={16} className="text-amber-400" />
                  </div>
                  <div className="ranking-list">
                    {data?.leaders?.map((l, idx) => (
                      <div key={l.nick || idx} className="ranking-row">
                        <div className="ranking-left">
                          <span className={`rank-place place-${idx + 1}`}>#{idx + 1}</span>
                          <div className="flex flex-col">
                            <span className="rank-name">{l.nick || "Gracz"}</span>
                            {l.level && <span className="text-[10px] text-slate-500 font-mono">Poziom {l.level}</span>}
                          </div>
                        </div>
                        <span className="rank-balance">{money(l.balance)}</span>
                      </div>
                    ))}
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

        <button
          className="mobile-tab-item"
          onClick={() => setProfileOpen(true)}
        >
          <User size={19} />
          <span>Konto</span>
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
        userNick={userNick}
        onOpenHistory={() => {
          setProfileOpen(false);
          setActiveTab("history");
        }}
      />

      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}
