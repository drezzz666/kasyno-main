"use client";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  useMemo,
} from "react";
import { AuthUser } from "@/lib/auth";
import {
  CircleUserRound,
  Gift,
  History,
  Home,
  Info,
  LogOut,
  Medal,
  Pickaxe,
  Spade,
  Target,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast, Toaster } from "sonner";
declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: Record<string, boolean>;
          execute: (input: any) => unknown | Promise<unknown>;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}
type Player = {
  nick: string;
  balance: number;
  xp: number;
  level: number;
  streak: number;
  last_bonus_day: string | null;
};
type Round = {
  id: string;
  game: string;
  state: string;
  bet: number;
  payout?: number;
  result?: string;
  payload: any;
};
export type HistoryEntry = {
  id: string;
  type: string;
  amount: number;
  balanceAfter?: number;
  createdAt?: number;
  created_at?: number;
  game?: string | null;
  result?: string | null;
  bet?: number | null;
  payout?: number | null;
};
type State = {
  player: Player;
  active: Round | null;
  history: HistoryEntry[];
  hasMoreHistory?: boolean;
  roundsToday?: number;
  missionClaimed?: boolean;
  missionReward?: number;
  missionTarget?: number;
  leaders: any[];
  today: string;
};
const format = (n: number) => new Intl.NumberFormat("pl-PL").format(n);
const money = (n: number) => `${format(n)} $FGT`;
const dailyBonus = (streak: number) => Math.min(100 + streak * 50, 1000);
const gameNames: { [k: string]: string } = {
  roulette: "Ruletka Europejska",
  blackjack: "Blackjack",
  mines: "Mines",
  slots: "Midnight 2fgt",
};

function getHistoryDetails(item: HistoryEntry) {
  if (item.type === "daily_bonus") {
    return {
      title: "Bonus dzienny",
      subtitle: "Nagroda za logowanie",
    };
  }
  if (item.type === "daily_mission") {
    return {
      title: "Misja dzienna",
      subtitle: "Stały bywalec (+250 $FGT)",
    };
  }
  if (item.type === "welcome_bonus" || item.type === "starter_bonus") {
    return {
      title: "Bonus powitalny",
      subtitle: "Startowy pakiet żetonów",
    };
  }
  if (item.type === "grant") {
    return {
      title: "Przyznanie środków",
      subtitle: item.result || "Doładowanie konta",
    };
  }
  if (item.type === "fraud_penalty") {
    return {
      title: "Kara anty-fraud",
      subtitle: item.result || "Wyzerowanie salda za naruszenie zasad",
    };
  }
  if (item.type === "fraud_restoration") {
    return {
      title: "Zwrot po audycie",
      subtitle: item.result || "Przywrócenie salda (anty-fraud)",
    };
  }
  const gName = (item.game && gameNames[item.game]) || (item.game ? item.game.toUpperCase() : "Gra");
  if (item.type === "round") {
    return {
      title: gName,
      subtitle: item.result || "Wynik rundy",
    };
  }
  if (item.type === "bet") {
    return {
      title: `${gName} · Zakład`,
      subtitle: "Postawienie stawki",
    };
  }
  if (item.type === "double") {
    return {
      title: `${gName} · Podwojenie`,
      subtitle: "Podwojenie stawki",
    };
  }
  if (item.type === "payout") {
    return {
      title: `${gName} · Wypłata`,
      subtitle: item.result || "Rozliczenie",
    };
  }
  return {
    title: "Operacja konta",
    subtitle: item.result || item.type,
  };
}

function formatHistoryTime(timestamp?: number) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
const wheelOrder = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const redNumbers = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const rouletteSectorAngle = 360 / wheelOrder.length;
const rouletteStops = wheelOrder
  .map(
    (n, i) =>
      `${n === 0 ? "#116344" : redNumbers.has(n) ? "#8f292f" : "#111714"} ${i * rouletteSectorAngle}deg ${(i + 1) * rouletteSectorAngle}deg`,
  )
  .join(",");
function RouletteWheelVisual({
  mustStartSpinning,
  prizeNumber,
  onStopSpinning,
}: {
  mustStartSpinning: boolean;
  prizeNumber: number;
  onStopSpinning: () => void;
}) {
  const [rotation, setRotation] = useState(0),
    runningRef = useRef(false),
    timerRef = useRef<number | null>(null),
    stopRef = useRef(onStopSpinning),
    finishRef = useRef<() => void>(() => {});
  stopRef.current = onStopSpinning;
  finishRef.current = () => {
    if (!runningRef.current) return;
    runningRef.current = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    stopRef.current();
  };
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!mustStartSpinning || runningRef.current) return;
    runningRef.current = true;
    const targetRotation =
      ((-(prizeNumber * rouletteSectorAngle) % 360) + 360) % 360;
    setRotation((previous) => {
      const current = ((previous % 360) + 360) % 360;
      const delta = 4 * 360 + ((targetRotation - current + 360) % 360);
      return previous + delta;
    });
    timerRef.current = window.setTimeout(() => finishRef.current(), 6420);
  }, [mustStartSpinning, prizeNumber]);
  return (
    <div className="roulette-custom" aria-label="Koło ruletki">
      <div className="roulette-pointer" aria-hidden="true" />
      <div
        className="roulette-dial"
        style={{
          transform: `rotate(${rotation}deg)`,
          background: `conic-gradient(from ${-rouletteSectorAngle / 2}deg,${rouletteStops})`,
        }}
        onTransitionEnd={(e) => {
          if (e.propertyName === "transform") finishRef.current();
        }}
      >
        <div className="roulette-labels">
          {wheelOrder.map((n, i) => (
            <span
              className="roulette-spoke"
              style={{ transform: `rotate(${i * rouletteSectorAngle}deg)` }}
              key={n}
            >
              <b
                style={{
                  transform: `translateX(-50%) rotate(${-i * rouletteSectorAngle}deg)`,
                }}
              >
                {n}
              </b>
            </span>
          ))}
        </div>
        <div className="roulette-inner-ring">
          <div className="roulette-hub" />
        </div>
      </div>
    </div>
  );
}
export default function CasinoApp({
  initialUser,
}: {
  initialUser: AuthUser;
}) {
  const [user, setUser] = useState<AuthUser>(initialUser);
  const [data, setData] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [muted, setMuted] = useState(false),
    [volume, setVolume] = useState(0.2),
    [game, setGame] = useState<string | null>(null),
    [tableBusy, setTableBusy] = useState(false),
    [bet, setBet] = useState(5),
    [choice, setChoice] = useState("red"),
    [mineCount, setMineCount] = useState(5),
    [last, setLast] = useState<Round | null>(null),
    [profileOpen, setProfileOpen] = useState(false),
    [infoOpen, setInfoOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [loadingMoreHistory, setLoadingMoreHistory] = useState(false),
    [hasMoreHistory, setHasMoreHistory] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPostingRef = useRef(false);

  useEffect(() => {
    if (!user) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      return;
    }

    const audio = new Audio("/audio/bgm.m4a");
    audio.loop = true;
    audio.volume = muted ? 0 : volume;
    audioRef.current = audio;

    const startAudio = () => {
      if (user && !muted && volume > 0 && audio.paused) {
        audio.play().catch(() => {});
      }
    };

    window.addEventListener("click", startAudio, { once: true });
    window.addEventListener("keydown", startAudio, { once: true });

    if (!muted && volume > 0) {
      audio.play().catch(() => {});
    }

    return () => {
      window.removeEventListener("click", startAudio);
      window.removeEventListener("keydown", startAudio);
      audio.pause();
      audio.src = "";
    };
  }, [user]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = muted ? 0 : volume;
    if (!user || muted || volume === 0) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  }, [user, muted, volume]);

  const isAnimatingRef = useRef(false);

  const syncBalance = useCallback((newBalance: number) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            player: {
              ...prev.player,
              balance: newBalance,
            },
          }
        : prev,
    );
  }, []);

  const load = useCallback(async (isPolling = false) => {
    if (isPolling && isAnimatingRef.current) return;
    try {
      const r = await fetch("/api/casino", { cache: "no-store" });
      if (r.status === 401) {
        window.location.href = "/api/auth/login";
        return;
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData((prev) => {
        const nextHistory = j.history || [];
        let combinedHistory = nextHistory;
        if (prev && prev.history && prev.history.length > nextHistory.length) {
          const freshIds = new Set(nextHistory.map((h: HistoryEntry) => h.id));
          const older = prev.history.filter((h: HistoryEntry) => !freshIds.has(h.id));
          combinedHistory = [...nextHistory, ...older];
        }
        if (isPolling && isAnimatingRef.current && prev) {
          return {
            ...j,
            history: combinedHistory,
            player: {
              ...j.player,
              balance: prev.player.balance,
            },
          };
        }
        return {
          ...j,
          history: combinedHistory,
        };
      });
      if (typeof j.hasMoreHistory === "boolean") {
        setHasMoreHistory(j.hasMoreHistory);
      }
      if (j.active) setGame(j.active.game);
    } catch (e) {
      if (!isPolling) {
        toast.error(
          e instanceof Error ? e.message : "Nie udało się pobrać danych",
        );
      }
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, []);

  const loadMoreHistory = async () => {
    if (loadingMoreHistory || !data?.history?.length) return;
    setLoadingMoreHistory(true);
    try {
      const res = await fetch(
        `/api/casino/history?offset=${data.history.length}&limit=10`,
        { cache: "no-store" },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Błąd pobierania historii");
      if (j.entries) {
        setData((prev) => {
          if (!prev) return prev;
          const currentIds = new Set(prev.history.map((h) => h.id));
          const uniqueEntries = j.entries.filter(
            (h: HistoryEntry) => !currentIds.has(h.id),
          );
          return {
            ...prev,
            history: [...prev.history, ...uniqueEntries],
          };
        });
        setHasMoreHistory(Boolean(j.hasMore));
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Nie udało się pobrać kolejnych wpisów",
      );
    } finally {
      setLoadingMoreHistory(false);
    }
  };
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden && !isAnimatingRef.current) {
        void load(true);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);
  const post = async (
    body: Record<string, unknown>,
    opts?: { deferRefresh?: boolean; deferBalance?: boolean; deductBet?: number },
  ) => {
    if (!user) {
      window.location.href = "/api/auth/login";
      return null;
    }
    if (isPostingRef.current) return null;
    isPostingRef.current = true;
    setLoading(true);
    try {
      const r = await fetch("/api/casino", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status === 401) {
        window.location.href = "/api/auth/login";
        return null;
      }
      let j: any = null;
      try {
        j = await r.json();
      } catch {
        throw new Error(r.ok ? "Błąd odpowiedzi serwera" : `Błąd serwera (${r.status})`);
      }
      if (!r.ok) throw new Error(j?.error || `Błąd operacji (${r.status})`);
      if (j.round) {
        if (!opts?.deferBalance) {
          setLast(j.round);
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
            : prev,
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
      toast.error(
        e instanceof Error ? e.message : "Nie udało się wykonać akcji",
      );
      setLoading(false);
      return null;
    } finally {
      isPostingRef.current = false;
    }
  };
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool(
        {
          name: "read_2fgt_player_state",
          title: "Odczytaj stan gracza 2fgt",
          description:
            "Zwraca bieżące saldo, poziom, serię bonusu i liczbę zapisanych rund.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: async () => ({
            nick: data?.player.nick,
            balance: data?.player.balance,
            level: data?.player.level,
            bonusStreak: data?.player.streak,
            rounds:
              typeof data?.roundsToday === "number"
                ? data.roundsToday
                : data?.history?.filter((h) => h.game).length || 0,
          }),
        },
        { signal: lifecycle.signal },
      );
      await context.registerTool(
        {
          name: "play_2fgt_instant_game",
          title: "Rozegraj szybką rundę 2fgt",
          description:
            "Rozgrywa jedną rundę ruletki lub automatu za wirtualne tokeny $FGT i odświeża widoczny stan.",
          inputSchema: {
            type: "object",
            properties: {
              game: { type: "string", enum: ["roulette", "slots"] },
              bet: { type: "integer", minimum: 1, maximum: 5000 },
              choice: {
                type: "string",
                description: "Dla ruletki: red, black albo numer 0–36.",
              },
            },
            required: ["game", "bet"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: async (input: any) => {
            if (
              !["roulette", "slots"].includes(input.game) ||
              !Number.isInteger(input.bet) ||
              input.bet < 1 ||
              input.bet > 5000
            )
              throw new Error("Nieprawidłowe parametry gry");
            const r = await fetch("/api/casino", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                game: input.game,
                bet: input.bet,
                choice: input.choice || "red",
              }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error);
            setLast(j.round);
            await load();
            return {
              game: j.round.game,
              result: j.round.result,
              payout: j.round.payout,
              balance: j.balance,
            };
          },
        },
        { signal: lifecycle.signal },
      );
    };
    void register().catch(() => {});
    return () => lifecycle.abort();
  }, [data, load]);
  const play = async () => {
    if (!user) {
      window.location.href = "/api/auth/login";
      return;
    }
    if (game === "roulette") await post({ game, bet, choice });
    if (game === "slots") await post({ game, bet });
    if (game === "blackjack") await post({ action: "deal_blackjack", bet });
    if (game === "mines")
      await post({ action: "start_mines", bet, mines: mineCount });
  };
  const active = data?.active,
    isBusy = Boolean(active || tableBusy || isAnimatingRef.current),
    bonusAvailable = !!data && data.player.last_bonus_day !== data.today,
    xpPercent = data ? Math.min(100, (data.player.xp % 500) / 5) : 0;
  const userNick =
    data?.player?.nick ||
    user?.displayName ||
    "Gracz";
  return (
    <div className="app-shell">
      <Toaster theme="dark" position="bottom-right" richColors />
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            if (!isBusy) setGame(null);
          }}
          aria-label="Przejdź do lobby"
        >
          <i>2</i>fgt
        </button>
        <nav>
          <button className="active">Lobby</button>
          <button
            onClick={() => document.querySelector("#games")?.scrollIntoView()}
          >
            Gry
          </button>
          <button
            onClick={() => document.querySelector("#ranking")?.scrollIntoView()}
          >
            Ranking
          </button>
          <button
            onClick={() =>
              document.querySelector("#missions")?.scrollIntoView()
            }
          >
            Misje
          </button>
          <button onClick={() => setInfoOpen(true)}>Informacje</button>
        </nav>
        <div className="account">
          {user && (
            <div className="volume-wrap">
              <button
                className="icon"
                onClick={() => setMuted(!muted)}
                aria-label={muted || volume === 0 ? "Włącz dźwięk" : "Wycisz dźwięk"}
              >
                {muted || volume === 0 ? (
                  <VolumeX />
                ) : volume < 0.4 ? (
                  <Volume1 />
                ) : (
                  <Volume2 />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setVolume(val);
                  if (val > 0 && muted) setMuted(false);
                  if (val === 0 && !muted) setMuted(true);
                }}
                className="volume-slider"
                aria-label="Głośność muzyki"
                title={`Głośność: ${Math.round((muted ? 0 : volume) * 100)}%`}
              />
            </div>
          )}
          <div className="balance">
            <FgtChip />
            <strong>{data ? money(data.player.balance) : "—"}</strong>
          </div>
          <button className="avatar" onClick={() => setProfileOpen(true)}>
            {userNick.slice(0, 2).toUpperCase()}
          </button>
        </div>
      </header>
      <main>
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <section className="welcome">
              <div>
                <h1>Dobry wieczór, {userNick}.</h1>
              </div>
              <div className="level">
                <span>Poziom {data?.player.level || 1}</span>
                <div>
                  <i style={{ width: `${xpPercent}%` }} />
                </div>
                <small>{(data?.player.xp || 0) % 500} / 500 XP</small>
              </div>
            </section>
            <section
              className={`daily-card ${bonusAvailable ? "" : "claimed"}`}
            >
              <div className="daily-copy">
                <span className="pill">
                  <Gift /> CODZIENNY BONUS
                </span>
                <h2>
                  {bonusAvailable ? (
                    <>
                      Odbierz{" "}
                      <em>{money(dailyBonus(data!.player.streak + 1))}</em>
                    </>
                  ) : (
                    "Dzisiejszy bonus odebrany"
                  )}
                </h2>
                <p>
                  {bonusAvailable
                    ? `Kontynuuj serię ${data?.player.streak || 0} dni.`
                    : `Seria: ${data?.player?.streak || 0} dni. Wróć jutro po kolejną nagrodę.`}
                </p>
                <button
                  disabled={!bonusAvailable || loading}
                  className="primary"
                  onClick={async () => {
                    const j = await post({ action: "bonus" });
                    if (j) toast.success(`Dodano ${money(j.amount)}`);
                  }}
                >
                  {bonusAvailable ? "Odbierz bonus" : "Odebrano"} <span>→</span>
                </button>
              </div>
              <div className="bonus-orb">
                <FgtChip />
                <b>2fgt</b>
              </div>
            </section>
            <section className="section" id="games">
              <header className="section-head">
                <div>
                  <p className="eyebrow">WYBRANE DLA CIEBIE</p>
                  <h2>Wieczorny stolik</h2>
                </div>
              </header>
              <article className="hero-game">
                <img src="/roulette-hero.webp" alt="Koło europejskiej ruletki" />
                <div className="hero-shade" />
                <div className="hero-copy">
                  <p>KLASYKA STOŁU</p>
                  <h3>Ruletka Europejska</h3>
                  <div className="meta">
                    <span>Min. 1 $FGT</span>
                    <span>Poziom 1+</span>
                    <span>Jedno zero (0–36)</span>
                  </div>
                  <div className="hero-game-guide">
                    <div className="guide-header">
                      <Info size={13} />
                      <span>Jak działa & mnożniki</span>
                    </div>
                    <p className="guide-desc">
                      Wybierz numer, kolor lub zakres i zakręć kołem. Kulka wskazuje wylosowaną liczbę.
                    </p>
                    <div className="guide-multipliers">
                      <span className="multiplier-pill">
                        <span>Pojedynczy numer:</span> <b>×36</b>
                      </span>
                      <span className="multiplier-pill">
                        <span>Tuzin (1–12, 13–24, 25–36):</span> <b>×3</b>
                      </span>
                      <span className="multiplier-pill">
                        <span>Czerwone / Czarne / Parz. / 1–18:</span> <b>×2</b>
                      </span>
                    </div>
                  </div>
                  <button
                    className="primary"
                    onClick={() => {
                      if (!user) {
                        window.location.href = "/api/auth/login";
                        return;
                      }
                      setGame("roulette");
                      setLast(null);
                    }}
                  >
                    Zagraj teraz <span>→</span>
                  </button>
                </div>
              </article>
            </section>
            <section className="section">
              <header className="section-head">
                <div>
                  <p className="eyebrow">STOLIKI I AUTOMATY</p>
                  <h2>Wybierz swój stolik</h2>
                </div>
              </header>
              <div className="game-grid">
                <GameCard
                  kind="mines"
                  title="Mines"
                  label="SZYBKA GRA"
                  badge="Siatka 5×5"
                  image="/mines-hero.webp"
                  icon={<Pickaxe />}
                  howItWorks="Wybierz 2–12 min i odkrywaj kryształy (◆). Mnożnik rośnie z każdym krokiem. Odbierz zysk zanim trafisz minę (✹)."
                  multipliers={[
                    { label: "Odkryty kryształ:", mult: "Dynamiczny ×" },
                    { label: "Cash-out:", mult: "Wypłata zysku" },
                    { label: "Trafienie miny:", mult: "0 $FGT" },
                  ]}
                  onClick={() => {
                    if (!user) {
                      window.location.href = "/api/auth/login";
                      return;
                    }
                    setGame("mines");
                    setLast(null);
                  }}
                />
                <GameCard
                  kind="blackjack"
                  title="Blackjack"
                  label="GRA STOŁOWA"
                  badge="Stół 3:2"
                  image="/blackjack-hero.webp"
                  icon={<Spade />}
                  howItWorks="Zbliż się do 21 pkt i pokonaj krupiera (dobiera do min. 17). Opcje: Dobierz, Pas, Podwój stawkę."
                  multipliers={[
                    { label: "Blackjack (21 z 2 kart):", mult: "×2.5 (3:2)" },
                    { label: "Zwykła wygrana:", mult: "×2.0 (1:1)" },
                    { label: "Remis (Push):", mult: "×1.0 (zwrot)" },
                  ]}
                  onClick={() => {
                    if (!user) {
                      window.location.href = "/api/auth/login";
                      return;
                    }
                    setGame("blackjack");
                    setLast(null);
                  }}
                />
                <GameCard
                  kind="slots"
                  title="Midnight 2fgt"
                  label="AUTOMAT 5×3"
                  badge="5 bębnów"
                  image="/slot-hero.webp"
                  icon={<span className="slot-glyph">2F</span>}
                  howItWorks="Losuje 5 bębnów z symbolami (2, F, G, T, ◆, ♛). Wygrywają układy identycznych symboli na poziomej linii środkowej."
                  multipliers={[
                    { label: "5 tych samych:", mult: "×12" },
                    { label: "4 te same:", mult: "×6" },
                    { label: "3 te same:", mult: "×2" },
                  ]}
                  onClick={() => {
                    if (!user) {
                      window.location.href = "/api/auth/login";
                      return;
                    }
                    setGame("slots");
                    setLast(null);
                  }}
                />
              </div>
            </section>
            <section className="bottom-grid">
              <article className="panel" id="missions">
                <header className="section-head">
                  <div>
                    <p className="eyebrow">MISJA DZIENNA</p>
                    <h2>Stały bywalec</h2>
                  </div>
                  <span className="reward">+250 $FGT</span>
                </header>
                <p>Rozegraj 5 rund dowolnej gry</p>
                <div className="progress">
                  <i
                    style={{
                      width: `${Math.min(
                        100,
                        ((typeof data?.roundsToday === "number"
                          ? data.roundsToday
                          : data?.history?.filter((h) => h.game).length) || 0) * 20,
                      )}%`,
                    }}
                  />
                </div>
                <div className="mission-footer">
                  <small>
                    {Math.min(
                      5,
                      (typeof data?.roundsToday === "number"
                        ? data.roundsToday
                        : data?.history?.filter((h) => h.game).length) || 0,
                    )}{" "}
                    z 5 ukończone
                  </small>
                  {data?.missionClaimed ? (
                    <span className="mission-claimed-tag">✓ Odebrano (+250 $FGT)</span>
                  ) : (
                    <button
                      className="primary mission-claim-btn"
                      disabled={
                        ((typeof data?.roundsToday === "number"
                          ? data.roundsToday
                          : data?.history?.filter((h) => h.game).length) || 0) < 5 ||
                        loading
                      }
                      onClick={async () => {
                        const j = await post({ action: "claim_mission" });
                        if (j?.ok) {
                          toast.success("Odebrano 250 $FGT za misję dzienną!");
                          void load();
                        }
                      }}
                    >
                      {((typeof data?.roundsToday === "number"
                        ? data.roundsToday
                        : data?.history?.filter((h) => h.game).length) || 0) >= 5
                        ? "Odbierz 250 $FGT"
                        : "W trakcie"}
                    </button>
                  )}
                </div>
              </article>
              <article className="panel" id="ranking">
                <header className="section-head">
                  <div>
                    <p className="eyebrow">RANKING KLUBU</p>
                    <h2>Najwyższe salda</h2>
                  </div>
                  <Medal className="gold-icon" />
                </header>
                <ol className="leaders">
                  {data?.leaders?.map((p: any, i: number) => (
                    <li key={p.nick || i}>
                      <b>{i + 1}</b>
                      <span className="mini-avatar">
                        {(p.nick || "G").slice(0, 2).toUpperCase()}
                      </span>
                      <span>{p.nick || "Gracz"}</span>
                      <strong>{money(p.balance)}</strong>
                    </li>
                  ))}
                </ol>
              </article>
            </section>
            <section className="section history" id="history">
              <header className="section-head">
                <div>
                  <p className="eyebrow">DZIENNIK ZMIAN</p>
                  <h2>Historia konta</h2>
                </div>
              </header>
              {data?.history?.length ? (
                <>
                  <div className="history-list">
                    {data.history.slice(0, 6).map((r) => {
                      const details = getHistoryDetails(r);
                      const timeStr = formatHistoryTime(
                        r.createdAt || r.created_at,
                      );
                      return (
                        <div key={r.id} className="history-row">
                          <div className="history-main">
                            <span className="history-title">{details.title}</span>
                            <small className="history-sub">
                              {details.subtitle}
                            </small>
                          </div>
                          <div className="history-meta">
                            <b
                              className={
                                r.amount > 0
                                  ? "win"
                                  : r.amount < 0
                                    ? "loss"
                                    : "neutral"
                              }
                            >
                              {r.amount > 0 ? "+" : ""}
                              {money(r.amount)}
                            </b>
                            {timeStr && (
                              <time className="history-time">{timeStr}</time>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="history-actions">
                    <button
                      type="button"
                      className="btn-history-more"
                      onClick={() => setHistoryOpen(true)}
                    >
                      Więcej historii
                    </button>
                  </div>
                </>
              ) : (
                <p className="empty">
                  {user
                    ? "Brak zarejestrowanych operacji na koncie."
                    : "Zaloguj się, aby zobaczyć historię swojego konta."}
                </p>
              )}
            </section>
            <section className="info-panel section" id="info">
              <div className="info-panel-head">
                <div className="info-panel-icon">
                  <Info />
                </div>
                <div>
                  <p className="eyebrow">JASNE ZASADY</p>
                  <h2>Wirtualne żetony $FGT, bez realnych pieniędzy</h2>
                  <p>
                    Nowe konto startuje ze 1000 $FGT, a saldo i stawki są
                    wyłącznie punktami do gry w klubie 2fgt.
                  </p>
                </div>
                <button className="secondary" onClick={() => setInfoOpen(true)}>
                  Otwórz informacje
                </button>
              </div>
              <div className="info-points">
                <div>
                  <strong>Brak wpłat</strong>
                  <span>Nie ma wpłat, depozytów ani mikropłatności.</span>
                </div>
                <div>
                  <strong>Brak wypłat</strong>
                  <span>
                    Tokeny $FGT nie mogą być wymienione na gotówkę ani waluty
                    fiducjarne.
                  </span>
                </div>
                <div>
                  <strong>Tylko zabawa</strong>
                  <span>
                    Rozgrywka służy czystej rozrywce społecznościowej.
                  </span>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
      <nav className="mobile-nav">
        <button>
          <Home />
          Lobby
        </button>
        <button
          onClick={() => document.querySelector("#games")?.scrollIntoView()}
        >
          <Spade />
          Gry
        </button>
        <button
          onClick={() => document.querySelector("#ranking")?.scrollIntoView()}
        >
          <Medal />
          Ranking
        </button>
        <button
          onClick={() => document.querySelector("#missions")?.scrollIntoView()}
        >
          <Target />
          Misje
        </button>
        <button onClick={() => setInfoOpen(true)}>
          <Info />
          Info
        </button>
        <button onClick={() => setProfileOpen(true)}>
          <CircleUserRound />
          Profil
        </button>
      </nav>
      <Dialog
        open={!!game}
        onOpenChange={(o) => {
          if (!o && !isBusy) setGame(null);
        }}
      >
        <DialogContent
          className="game-dialog"
          showCloseButton={!isBusy}
          onPointerDownOutside={(e) => {
            if (isBusy) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (isBusy) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{game ? gameNames[game] : "Gra"}</DialogTitle>
            <DialogDescription>
              Wirtualna waluta $FGT bez wpłat, wypłat ani wartości pieniężnej.
            </DialogDescription>
          </DialogHeader>
          {game && (
            <GameTable
              game={game}
              bet={bet}
              setBet={setBet}
              choice={choice}
              setChoice={setChoice}
              mineCount={mineCount}
              setMineCount={setMineCount}
              active={active}
              last={last}
              setLast={setLast}
              loading={loading}
              play={play}
              post={post}
              load={load}
              syncBalance={syncBalance}
              balance={data?.player?.balance ?? 0}
              animatingRef={isAnimatingRef}
              onBusyChange={setTableBusy}
              close={() => {
                if (!isBusy) setGame(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="game-dialog info-dialog">
          <DialogHeader>
            <DialogTitle>Informacje i zasady</DialogTitle>
            <DialogDescription>
              Prywatny klub gier z wirtualną walutą $FGT.
            </DialogDescription>
          </DialogHeader>
          <div className="info-dialog-body">
            <div className="info-notice">
              <Info />
              <div>
                <strong>Zasady gier i tabele mnożników</strong>
                <p style={{ marginTop: "8px", lineHeight: "1.5" }}>
                  <b>1. Midnight 2fgt (Automat 5×3)</b>: 5 bębnów, 6 symboli (2, F, G, T, ◆, ♛). Rozliczana linia środkowa: 3 symbole = <b>×2</b> · 4 symbole = <b>×6</b> · 5 symboli = <b>×12</b>.
                  <br /><br />
                  <b>2. Ruletka Europejska</b>: Koło z 37 liczbami (0–36, 1 zero). Numer = <b>×36</b> · Tuzin (1–12, 13–24, 25–36) = <b>×3</b> · Czerwone/Czarne/Parzyste/1–18 = <b>×2</b>.
                  <br /><br />
                  <b>3. Blackjack</b>: Pokonaj krupiera (dobiera do min. 17), nie przekraczając 21 pkt. Blackjack (21 z 2 kart) = <b>×2.5</b> (3:2) · Wygrana = <b>×2.0</b> (1:1) · Remis = zwrot (<b>×1.0</b>).
                  <br /><br />
                  <b>4. Mines (Saper)</b>: Plansza 5×5 (25 pól) i 2–12 min. Odkrywaj diamenty (◆) podnoszące mnożnik rundy i kliknij „Odbierz” przed trafieniem miny (✹).
                </p>
              </div>
            </div>
            <div className="info-points">
              <div>
                <strong>Wirtualne tokeny $FGT</strong>
                <span>
                  Nowe konto zaczyna ze 1000 $FGT. Punkty służą wyłącznie do
                  zabawy.
                </span>
              </div>
              <div>
                <strong>Brak wpłat</strong>
                <span>Nie przyjmujemy płatności ani depozytów.</span>
              </div>
              <div>
                <strong>Brak wypłat</strong>
                <span>
                  Salda $FGT nie można wypłacić ani wymienić na pieniądze.
                </span>
              </div>
            </div>
            <p className="info-footnote">
              Korzystając z serwisu, potwierdzasz, że rozumiesz wirtualny
              charakter tokenów $FGT.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="game-dialog">
          <DialogHeader>
            <DialogTitle>Profil gracza</DialogTitle>
            <DialogDescription>
              Poziom {data?.player.level || 1} · {format(data?.player.xp || 0)}{" "}
              XP
            </DialogDescription>
          </DialogHeader>
          <div className="profile-form">
            <label>
              Pseudonim (username z Authentik)
              <input
                name="nick"
                value={userNick}
                readOnly
                disabled
                style={{ opacity: 0.85, cursor: "not-allowed" }}
              />
            </label>
            <div className="profile-stats">
              <div>
                <small>Saldo</small>
                <b>{money(data?.player.balance || 0)}</b>
              </div>
              <div>
                <small>Seria bonusu</small>
                <b>{data?.player.streak || 0} dni</b>
              </div>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setProfileOpen(false);
                setHistoryOpen(true);
              }}
              style={{
                width: "100%",
                padding: "10px 14px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginTop: "12px",
                borderRadius: "8px",
                cursor: "pointer",
                background: "rgba(214, 224, 239, 0.08)",
                border: "1px solid rgba(214, 224, 239, 0.16)",
                color: "#d6e0ef",
                fontSize: "0.88rem",
                fontWeight: 500,
              }}
            >
              <History size={16} /> Historia konta
            </button>
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                marginTop: "10px",
              }}
            >
              <a
                href="/api/auth/logout"
                className="secondary"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  background: "rgba(220,53,69,0.15)",
                  color: "#ff6b6b",
                  border: "1px solid rgba(220,53,69,0.3)",
                }}
              >
                <LogOut size={15} /> Wyloguj
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="game-dialog history-dialog">
          <DialogHeader>
            <DialogTitle>Historia konta</DialogTitle>
            <DialogDescription>
              Rejestr wszystkich operacji, gier i bonusów $FGT
            </DialogDescription>
          </DialogHeader>
          <div className="history-modal-content">
            {data?.history?.length ? (
              <>
                <div className="history-list modal-history-list">
                  {data.history.map((r) => {
                    const details = getHistoryDetails(r);
                    const timeStr = formatHistoryTime(
                      r.createdAt || r.created_at,
                    );
                    return (
                      <div key={r.id} className="history-row">
                        <div className="history-main">
                          <span className="history-title">{details.title}</span>
                          <small className="history-sub">
                            {details.subtitle}
                          </small>
                        </div>
                        <div className="history-meta">
                          <b
                            className={
                              r.amount > 0
                                ? "win"
                                : r.amount < 0
                                  ? "loss"
                                  : "neutral"
                            }
                          >
                            {r.amount > 0 ? "+" : ""}
                            {money(r.amount)}
                          </b>
                          {timeStr && (
                            <time className="history-time">{timeStr}</time>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {hasMoreHistory ? (
                  <div className="history-actions" style={{ padding: "16px 0 6px" }}>
                    <button
                      type="button"
                      className="btn-history-more"
                      onClick={loadMoreHistory}
                      disabled={loadingMoreHistory}
                    >
                      {loadingMoreHistory
                        ? "Wczytywanie..."
                        : "Wczytaj starsze wpisy"}
                    </button>
                  </div>
                ) : (
                  <p className="history-modal-end">
                    To wszystkie zarejestrowane operacje.
                  </p>
                )}
              </>
            ) : (
              <p className="empty">
                {user
                  ? "Brak zarejestrowanych operacji na koncie."
                  : "Zaloguj się, aby zobaczyć historię swojego konta."}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function FgtChip({ small = false }: { small?: boolean }) {
  return (
    <span className={`fgt-chip ${small ? "small" : ""}`} aria-hidden="true" />
  );
}
function GameCard({
  kind,
  title,
  label,
  icon,
  image,
  badge,
  onClick,
  howItWorks,
  multipliers,
}: {
  kind: string;
  title: string;
  label: string;
  icon?: React.ReactNode;
  image?: string;
  badge?: string;
  onClick: () => void;
  howItWorks?: string;
  multipliers?: { label: string; mult: string }[];
}) {
  return (
    <article
      className={`game-card ${kind}`}
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
    >
      {image && (
        <div className="game-card-backdrop">
          <img src={image} alt={title} className="game-card-img" />
          <div className="game-card-shade" />
        </div>
      )}
      <div className="game-card-inner">
        <div className="game-card-top">
          <span className="tag">GRAJ</span>
          {badge && <span className="game-card-badge">{badge}</span>}
        </div>
        <div className="game-card-body">
          <div className="game-info">
            <div>
              <p>{label}</p>
              <h3>{title}</h3>
            </div>
            <button aria-label={`Zagraj w ${title}`}>→</button>
          </div>
          <div className="game-meta">
            <span>Min. 1 $FGT</span>
          </div>
          {howItWorks && (
            <div className="game-card-guide">
              <div className="guide-header">
                <Info size={13} />
                <span>Zasady & Mnożniki</span>
              </div>
              <p className="guide-desc">{howItWorks}</p>
              {multipliers && (
                <div className="guide-multipliers">
                  {multipliers.map((m, idx) => (
                    <span className="multiplier-pill" key={idx}>
                      <span>{m.label}</span>
                      <b>{m.mult}</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
function BetControl({
  bet,
  setBet,
}: {
  bet: number;
  setBet: (n: number) => void;
}) {
  return (
    <div className="bet-control">
      <label>
        <FgtChip small />
        Stawka · $FGT
      </label>
      <div>
        <button
          aria-label="Zmniejsz stawkę o połowę"
          onClick={() => setBet(Math.max(1, Math.floor(bet / 2)))}
        >
          ½
        </button>
        <input
          aria-label="Stawka w tokenach $FGT"
          type="number"
          min="1"
          value={bet}
          onChange={(e) =>
            setBet(Math.max(1, Number(e.target.value)))
          }
        />
        <button
          aria-label="Podwój stawkę"
          onClick={() => setBet(bet * 2)}
        >
          2×
        </button>
      </div>
    </div>
  );
}
function GameTable({
  game,
  bet,
  setBet,
  choice,
  setChoice,
  mineCount,
  setMineCount,
  active,
  last,
  setLast,
  loading,
  play,
  post,
  load,
  syncBalance,
  balance,
  animatingRef,
  close,
  onBusyChange,
}: any) {
  const round = active?.game === game ? active : null,
    [spinning, setSpinning] = useState(false),
    [slotsSpinning, setSlotsSpinning] = useState(false),
    [rouletteWaiting, setRouletteWaiting] = useState(false),
    [spinResult, setSpinResult] = useState<any>(null),
    [pendingSpin, setPendingSpin] = useState<{ round: any; balance: number } | null>(null),
    [pendingMine, setPendingMine] = useState<number | null>(null),
    [blackjackPreview, setBlackjackPreview] = useState<any>(null);

  const isBusy = Boolean(
    loading ||
    round ||
    spinning ||
    slotsSpinning ||
    rouletteWaiting ||
    blackjackPreview ||
    pendingMine !== null ||
    pendingSpin ||
    animatingRef?.current
  );

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => {
    return () => {
      onBusyChange?.(false);
    };
  }, [onBusyChange]);
  const shownRound = blackjackPreview || round;
  const showSettledBlackjack = async (move: string) => {
    if (!round || loading) return;
    if (animatingRef) animatingRef.current = true;
    const j = await post(
      { action: "blackjack", roundId: round.id, move },
      { deferRefresh: true, deferBalance: true },
    );
    if (j?.round?.state === "settled") {
      setBlackjackPreview({ ...j.round, state: "settled" });
      window.setTimeout(() => {
        setBlackjackPreview(null);
        setLast(j.round);
        if (typeof j.balance === "number") syncBalance(j.balance);
        if (animatingRef) animatingRef.current = false;
        void load();
      }, 2500);
    } else {
      if (animatingRef) animatingRef.current = false;
    }
  };
  const start = async () => {
    if (game === "slots") {
      if (animatingRef) animatingRef.current = true;
      setSlotsSpinning(true);
      const j = await post(
        { game, bet },
        { deferBalance: true, deferRefresh: true, deductBet: bet },
      );
      if (j) {
        window.setTimeout(() => {
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          setSlotsSpinning(false);
          if (animatingRef) animatingRef.current = false;
          void load();
        }, 1200);
      } else {
        setSlotsSpinning(false);
        if (animatingRef) animatingRef.current = false;
      }
      return;
    }
    if (game !== "roulette") {
      await play();
      return;
    }
    if (animatingRef) animatingRef.current = true;
    setRouletteWaiting(true);
    const j = await post(
      { game, bet, choice },
      { deferBalance: true, deferRefresh: true, deductBet: bet },
    );
    if (j) {
      setSpinResult(j.round);
      setPendingSpin({ round: j.round, balance: j.balance });
      setRouletteWaiting(false);
      setSpinning(true);
    } else {
      setRouletteWaiting(false);
      if (animatingRef) animatingRef.current = false;
    }
  };
  const winningNumber =
    spinResult?.payload?.number ?? last?.payload?.number ?? 0;
  const prize = Math.max(0, wheelOrder.indexOf(winningNumber));
  return (
    <div className="table">
      <div className={`table-visual ${game}`}>
        {game === "roulette" && (
          <>
            <div
              className={`roulette-live ${spinning ? "is-spinning" : ""} ${rouletteWaiting ? "waiting" : ""}`}
            >
              <RouletteWheelVisual
                mustStartSpinning={spinning}
                prizeNumber={prize}
                onStopSpinning={() => {
                  setSpinning(false);
                  if (pendingSpin) {
                    setLast(pendingSpin.round);
                    if (typeof pendingSpin.balance === "number") syncBalance(pendingSpin.balance);
                    setPendingSpin(null);
                    void load();
                  }
                  if (animatingRef) animatingRef.current = false;
                }}
              />
              {spinResult && !spinning && !rouletteWaiting && (
                <div className="roulette-result" aria-live="polite">
                  <strong>{winningNumber}</strong>
                </div>
              )}
            </div>
            <RouletteBets choice={choice} setChoice={setChoice} />
          </>
        )}
        {game === "slots" && (
          <div
            className={`reels ${loading || slotsSpinning ? "rolling" : ""}`}
            key={last?.id || (slotsSpinning ? "spinning" : "idle")}
          >
            {[0, 1, 2, 3, 4].map((x) => (
              <div key={x}>
                {[0, 1, 2].map((y) => (
                  <span
                    key={y}
                    style={{ animationDelay: `${x * 0.09 + y * 0.045}s` }}
                  >
                    {last?.payload?.reels?.[x]?.[y] || ["2", "F", "G"][y]}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
        {game === "blackjack" && <Blackjack round={shownRound} last={last} />}{" "}
        {game === "mines" && (
          <Mines
            round={round}
            last={last}
            post={post}
            loading={loading}
            pendingMine={pendingMine}
            onPending={setPendingMine}
          />
        )}
      </div>
      {last && !shownRound && !blackjackPreview && !spinning && !slotsSpinning && (
        <div
          className={`result ${last.payout && last.payout > last.bet ? "winner" : ""}`}
        >
          <b>{last.result}</b>
          <span>
            {last.payout ? `Wypłata: ${money(last.payout)}` : "Bez wypłaty"}
          </span>
        </div>
      )}
      {!round && !blackjackPreview && (
        <>
          <BetControl bet={bet} setBet={setBet} />
          {game === "mines" && (
            <label className="number-choice">
              Liczba min
              <input
                type="range"
                min="2"
                max="12"
                value={mineCount}
                onChange={(e) => setMineCount(Number(e.target.value))}
              />
              <b>{mineCount}</b>
            </label>
          )}
          <button
            className="primary wide"
            disabled={loading || spinning || slotsSpinning}
            onClick={start}
          >
            {spinning
              ? "Koło się kręci…"
              : slotsSpinning
                ? "Bębny w ruchu…"
                : loading
                  ? "Rozliczanie…"
                  : last
                    ? "Zagraj ponownie"
                    : "Rozpocznij rundę"}
          </button>
        </>
      )}
      {round?.game === "blackjack" && !blackjackPreview && (
        <div className={`actions ${round.payload.cards?.length === 2 ? "three" : ""}`}>
          <button
            className="secondary"
            disabled={loading}
            onClick={() => showSettledBlackjack("stand")}
          >
            Pas
          </button>
          {round.payload.cards?.length === 2 && (
            <button
              className="secondary"
              disabled={loading || (typeof balance === "number" ? balance < round.bet : false)}
              onClick={() => showSettledBlackjack("double")}
            >
              Podwój
            </button>
          )}
          <button
            className="primary"
            disabled={loading}
            onClick={() => showSettledBlackjack("hit")}
          >
            Dobierz
          </button>
        </div>
      )}
      {round?.game === "mines" && (
        <button
          className="primary wide"
          disabled={loading || !round.payload.revealed?.length}
          onClick={() =>
            post({ action: "mines", roundId: round.id, move: "cashout" })
          }
        >
          Odbierz ×{round.payload.multiplier?.toFixed(2)}
        </button>
      )}
      <GamePaytable game={game} />
      <button
        className="rules-link"
        disabled={isBusy}
        onClick={() => {
          if (!isBusy) close();
        }}
        title={isBusy ? "Dokończ trwającą rundę lub poczekaj na koniec animacji" : undefined}
      >
        Wróć do lobby
      </button>
    </div>
  );
}
function GamePaytable({ game }: { game: string }) {
  if (game === "slots") {
    return (
      <div className="table-paytable">
        <div className="table-paytable-head">
          <Info size={14} />
          <span>Tabela wypłat i zasady (Midnight 2fgt)</span>
        </div>
        <div className="table-paytable-content">
          <p>
            Automat 5×3. Rozliczana jest <b>pozioma linia środkowa</b> (5 środkowych symboli z bębnów). Symbole: 2, F, G, T, ◆, ♛.
          </p>
          <div className="paytable-grid">
            <div className="paytable-tile">
              <span className="paytable-tile-mult">×12</span>
              <span className="paytable-tile-desc">5 identycznych symboli na linii</span>
            </div>
            <div className="paytable-tile">
              <span className="paytable-tile-mult">×6</span>
              <span className="paytable-tile-desc">4 identyczne symbole na linii</span>
            </div>
            <div className="paytable-tile">
              <span className="paytable-tile-mult">×2</span>
              <span className="paytable-tile-desc">3 identyczne symbole na linii</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (game === "roulette") {
    return (
      <div className="table-paytable">
        <div className="table-paytable-head">
          <Info size={14} />
          <span>Mnożniki i zasady Ruletki Europejskiej</span>
        </div>
        <div className="table-paytable-content">
          <p>
            Koło zawiera 37 liczb (0–36, jedno zielone zero). Wybierz zakład na stole i zakręć kołem.
          </p>
          <div className="paytable-grid">
            <div className="paytable-tile">
              <span className="paytable-tile-mult">×36</span>
              <span className="paytable-tile-desc">Pojedynczy numer (0–36)</span>
            </div>
            <div className="paytable-tile">
              <span className="paytable-tile-mult">×3</span>
              <span className="paytable-tile-desc">Tuziny (1–12, 13–24, 25–36)</span>
            </div>
            <div className="paytable-tile">
              <span className="paytable-tile-mult">×2</span>
              <span className="paytable-tile-desc">Czerwone / Czarne / Parz. / 1–18 / 19–36</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (game === "blackjack") {
    return (
      <div className="table-paytable">
        <div className="table-paytable-head">
          <Info size={14} />
          <span>Zasady i wypłaty Blackjacka</span>
        </div>
        <div className="table-paytable-content">
          <p>
            Zbliż się do 21 punktów, nie przekraczając. Krupier dobiera karty do sumy min. 17 pkt. As = 1/11, Figury (J, Q, K) = 10.
          </p>
          <div className="paytable-grid">
            <div className="paytable-tile">
              <span className="paytable-tile-mult">×2.5 (3:2)</span>
              <span className="paytable-tile-desc">Naturalny Blackjack (21 z 2 kart)</span>
            </div>
            <div className="paytable-tile">
              <span className="paytable-tile-mult">×2.0 (1:1)</span>
              <span className="paytable-tile-desc">Wyższa suma lub krupier fura (&gt;21)</span>
            </div>
            <div className="paytable-tile">
              <span className="paytable-tile-mult">×1.0</span>
              <span className="paytable-tile-desc">Remis (Push) – zwrot stawki</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (game === "mines") {
    return (
      <div className="table-paytable">
        <div className="table-paytable-head">
          <Info size={14} />
          <span>Zasady i mnożniki gry Mines (Saper)</span>
        </div>
        <div className="table-paytable-content">
          <p>
            Siatka 5×5 (25 pól) z wybraną liczbą ukrytych min (2–12). Odkrywaj diamenty (◆) – każde bezpieczne pole podnosi mnożnik rundy.
          </p>
          <div className="paytable-grid">
            <div className="paytable-tile">
              <span className="paytable-tile-mult">Dynamiczny ×</span>
              <span className="paytable-tile-desc">Rośnie z każdym odkrytym diamentem</span>
            </div>
            <div className="paytable-tile">
              <span className="paytable-tile-mult">Cash-out</span>
              <span className="paytable-tile-desc">Odbierz wygraną w dowolnym momencie</span>
            </div>
            <div className="paytable-tile">
              <span className="paytable-tile-mult">0 $FGT</span>
              <span className="paytable-tile-desc">Trafienie miny (✹) kończy rundę</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
function RouletteBets({
  choice,
  setChoice,
}: {
  choice: string;
  setChoice: (v: string) => void;
}) {
  const pick = (v: string, label: string, cls = "") => (
    <button
      className={`${cls} ${choice === v ? "selected" : ""}`}
      onClick={() => setChoice(v)}
    >
      {label}
    </button>
  );
  return (
    <div className="roulette-table">
      <div className="number-grid">
        {pick("0", "0", "zero span-zero")}
        {Array.from({ length: 36 }, (_, i) => {
          const n = i + 1;
          return pick(
            String(n),
            String(n),
            redNumbers.has(n) ? "red" : "black",
          );
        })}
      </div>
      <div className="outside-bets">
        {pick("dozen1", "1–12")}
        {pick("dozen2", "13–24")}
        {pick("dozen3", "25–36")}
        {pick("low", "1–18")}
        {pick("even", "PARZYSTE")}
        {pick("red", "CZERWONE", "red")}
        {pick("black", "CZARNE", "black")}
        {pick("odd", "NIEPARZYSTE")}
        {pick("high", "19–36")}
      </div>
    </div>
  );
}
function Blackjack({
  round,
  last,
  revealDealer = false,
}: {
  round: any;
  last: any;
  revealDealer?: boolean;
}) {
  const r = round || last,
    p = r?.payload;
  const val = (cards: any[] = []) => {
    let n = 0,
      a = 0;
    cards.forEach((c) => {
      if (c.rank === "A") {
        n += 11;
        a++;
      } else n += ["J", "Q", "K"].includes(c.rank) ? 10 : Number(c.rank);
    });
    while (n > 21 && a) {
      n -= 10;
      a--;
    }
    return n;
  };
  const settled = r?.state === "settled";
  const shouldRevealDealer = revealDealer || settled;
  const dealerCards =
    !shouldRevealDealer && p?.dealer?.length > 1
      ? [p.dealer[0], { rank: "?", suit: "" }]
      : p?.dealer || [];
  const dealerTotal = p
    ? shouldRevealDealer
      ? val(p.dealer)
      : val([p.dealer[0]])
    : 0;
  const natural =
    !!p?.cards?.length && p.cards.length === 2 && val(p.cards) === 21;
  const outcomeClass = settled
    ? (r?.payout || 0) > (r?.bet || 0)
      ? "winner"
      : (r?.payout || 0) === (r?.bet || 0)
        ? "push"
        : "loser"
    : "";
  const payoutText = settled
    ? r?.payout
      ? `Wypłata: ${money(r.payout)}`
      : "Bez wypłaty"
    : "";
  return (
    <div className="hands">
      <div>
        <small>
          DEALER ·{" "}
          {round && !shouldRevealDealer ? `${dealerTotal} + ?` : dealerTotal}
        </small>
        <div className="cards">
          {dealerCards.map((c: any, i: number) => (
            <span
              className={`playing-card blackjack-card dealer ${c.rank === "?" ? "card-back" : ""}`}
              style={{ "--card-index": i } as React.CSSProperties}
              key={`${c.rank}-${c.suit}-${i}`}
            >
              {c.rank}
              <b>{c.suit}</b>
            </span>
          ))}
        </div>
      </div>
      <div>
        <small>
          TY · {p ? val(p.cards) : 0} {natural && <em>BLACKJACK 3:2</em>}
        </small>
        <div className="cards">
          {p?.cards?.map((c: any, i: number) => (
            <span
              className="playing-card blackjack-card player"
              style={{ "--card-index": i } as React.CSSProperties}
              key={`${c.rank}-${c.suit}-${i}`}
            >
              {c.rank}
              <b>{c.suit}</b>
            </span>
          ))}
        </div>
      </div>
      {settled && (
        <div
          className={`blackjack-outcome ${outcomeClass}`}
          style={
            {
              "--outcome-delay": `${Math.max(0.15, (dealerCards.length - 1) * 0.23 + 0.15)}s`,
            } as React.CSSProperties
          }
          aria-live="polite"
        >
          <strong>{r?.result || "Runda zakończona"}</strong>
          <span>{payoutText}</span>
        </div>
      )}
    </div>
  );
}
function Mines({
  round,
  last,
  post,
  loading,
  pendingMine,
  onPending,
}: {
  round: any;
  last: any;
  post: any;
  loading: boolean;
  pendingMine: number | null;
  onPending: (n: number | null) => void;
}) {
  const r = round || last,
    p = r?.payload || {},
    revealed: number[] = p.revealed || [],
    allMines: number[] = last?.state === "settled" ? p.mines || [] : [];
  return (
    <div className="mine-board">
      {Array.from({ length: 25 }, (_, i) => (
        <button
          key={i}
          disabled={!round || loading || revealed.includes(i)}
          className={`${allMines.includes(i) ? "bomb" : revealed.includes(i) ? "safe" : ""} ${pendingMine === i ? "pending" : ""}`}
          onClick={() => {
            onPending(i);
            void post({
              action: "mines",
              roundId: round.id,
              move: "reveal",
              tile: i,
            }).then(() => onPending(null));
          }}
        >
          {allMines.includes(i) ? "✹" : revealed.includes(i) ? "◆" : ""}
        </button>
      ))}
    </div>
  );
}
function Loading() {
  return (
    <div className="loading">
      <span />
      <p>Otwieramy stoliki…</p>
    </div>
  );
}
