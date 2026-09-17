"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthUser } from "./chatgpt-auth";
import {
  CircleUserRound,
  Gift,
  Home,
  Info,
  LogIn,
  LogOut,
  Medal,
  Pickaxe,
  Spade,
  Target,
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
type State = {
  player: Player;
  active: Round | null;
  history: any[];
  leaders: any[];
  today: string;
};
const format = (n: number) => new Intl.NumberFormat("pl-PL").format(n);
const money = (n: number) => `${format(n)} $FGT`;
const dailyBonus = (streak: number) => Math.min(10 + streak * 5, 100);
const gameNames: { [k: string]: string } = {
  roulette: "Ruletka Europejska",
  blackjack: "Blackjack",
  mines: "Mines",
  slots: "Midnight 2fgt",
};
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
  initialUser?: AuthUser | null;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser || null);
  const [data, setData] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [muted, setMuted] = useState(false),
    [game, setGame] = useState<string | null>(null),
    [bet, setBet] = useState(5),
    [choice, setChoice] = useState("red"),
    [mineCount, setMineCount] = useState(5),
    [last, setLast] = useState<Round | null>(null),
    [profileOpen, setProfileOpen] = useState(false),
    [infoOpen, setInfoOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/casino", { cache: "no-store" });
      if (r.status === 401) {
        setUser(null);
        setData(null);
        return;
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
      if (j.active) setGame(j.active.game);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Nie udało się pobrać danych",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const post = async (
    body: Record<string, unknown>,
    opts?: { deferRefresh?: boolean },
  ) => {
    if (!user) {
      window.location.href = "/api/auth/login";
      return null;
    }
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
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (j.round) {
        setLast(j.round);
        setData((prev) =>
          prev
            ? {
                ...prev,
                player: {
                  ...prev.player,
                  balance:
                    typeof j.balance === "number"
                      ? j.balance
                      : prev.player.balance,
                },
                active: j.round.state === "active" ? j.round : null,
              }
            : prev,
        );
        setLoading(false);
        if (j.round.state !== "active" && !opts?.deferRefresh) void load();
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
            rounds: data?.history.length,
          }),
        },
        { signal: lifecycle.signal },
      );
      await context.registerTool(
        {
          name: "play_2fgt_instant_game",
          title: "Rozegraj szybką rundę 2fgt",
          description:
            "Rozgrywa jedną serwerowo rozliczaną rundę ruletki lub automatu za wirtualne tokeny $FGT i odświeża widoczny stan.",
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
    bonusAvailable = !!data && data.player.last_bonus_day !== data.today,
    xpPercent = data ? Math.min(100, (data.player.xp % 500) / 5) : 0;
  const firstName =
    user?.firstName ||
    (user?.fullName ? user.fullName.trim().split(/\s+/)[0] : null) ||
    data?.player?.nick ||
    user?.displayName ||
    "Gracz";
  return (
    <div className="app-shell">
      <Toaster theme="dark" position="bottom-right" richColors />
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setGame(null)}
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
          <button
            className="icon"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Włącz dźwięk" : "Wycisz dźwięk"}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <div className="balance">
            <FgtChip />
            <strong>{data ? money(data.player.balance) : "—"}</strong>
          </div>
          {user ? (
            <button className="avatar" onClick={() => setProfileOpen(true)}>
              {firstName.slice(0, 2).toUpperCase()}
            </button>
          ) : (
            <a
              className="primary"
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                textDecoration: "none",
              }}
              href="/api/auth/login"
            >
              <LogIn size={15} /> Zaloguj
            </a>
          )}
        </div>
      </header>
      <main>
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <section className="welcome">
              <div>
                <h1>
                  {user
                    ? `Dobry wieczór, ${firstName}.`
                    : "Witaj w klubie 2fgt"}
                </h1>
              </div>
              {user ? (
                <div className="level">
                  <span>Poziom {data?.player.level || 1}</span>
                  <div>
                    <i style={{ width: `${xpPercent}%` }} />
                  </div>
                  <small>{(data?.player.xp || 0) % 500} / 500 XP</small>
                </div>
              ) : (
                <a
                  href="/api/auth/login"
                  className="primary"
                  style={{
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 18px",
                  }}
                >
                  Zaloguj przez Authentik <span>→</span>
                </a>
              )}
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
                  disabled={!bonusAvailable || loading || !user}
                  className="primary"
                  onClick={async () => {
                    if (!user) {
                      window.location.href = "/api/auth/login";
                      return;
                    }
                    const j = await post({ action: "bonus" });
                    if (j) toast.success(`Dodano ${money(j.amount)}`);
                  }}
                >
                  {user
                    ? bonusAvailable
                      ? "Odbierz bonus"
                      : "Odebrano"
                    : "Zaloguj, aby odebrać"}{" "}
                  <span>→</span>
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
                <img src="/roulette-hero.png" alt="Koło europejskiej ruletki" />
                <div className="hero-shade" />
                <div className="hero-copy">
                  <p>KLASYKA STOŁU</p>
                  <h3>Ruletka Europejska</h3>
                  <div className="meta">
                    <span>Min. 1 $FGT</span>
                    <span>Poziom 1+</span>
                    <span>Jedno zero</span>
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
                  <p className="eyebrow">GRY MVP</p>
                  <h2>Wybierz swój stolik</h2>
                </div>
              </header>
              <div className="game-grid">
                <GameCard
                  kind="mines"
                  title="Mines"
                  label="SZYBKA GRA"
                  icon={<Pickaxe />}
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
                  icon={<Spade />}
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
                  icon={<span className="slot-glyph">2F</span>}
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
                  <span className="reward">+25 $FGT</span>
                </header>
                <p>Rozegraj 5 rund dowolnej gry</p>
                <div className="progress">
                  <i
                    style={{
                      width: `${Math.min(100, (data?.history.length || 0) * 20)}%`,
                    }}
                  />
                </div>
                <small>
                  {Math.min(5, data?.history.length || 0)} z 5 ukończone
                </small>
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
                    <li key={p.nick}>
                      <b>{i + 1}</b>
                      <span className="mini-avatar">
                        {p.nick.slice(0, 1).toUpperCase()}
                      </span>
                      <span>{p.nick}</span>
                      <strong>{money(p.balance)}</strong>
                    </li>
                  ))}
                </ol>
              </article>
            </section>
            <section className="section history">
              <header className="section-head">
                <div>
                  <p className="eyebrow">HISTORIA</p>
                  <h2>Ostatnie rundy</h2>
                </div>
              </header>
              {data?.history?.length ? (
                <div className="history-list">
                  {data.history.map((r) => (
                    <div key={r.id}>
                      <span>{gameNames[r.game]}</span>
                      <small>{r.result}</small>
                      <b className={r.payout > r.bet ? "win" : "loss"}>
                        {r.payout - r.bet >= 0 ? "+" : ""}
                        {money(r.payout - r.bet)}
                      </b>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">
                  {user
                    ? "Pierwsza runda dopiero czeka."
                    : "Zaloguj się, aby zobaczyć historię swoich gier."}
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
                    Nowe konto startuje ze 100 $FGT, a saldo i stawki są
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
        <button
          onClick={() => {
            if (user) setProfileOpen(true);
            else window.location.href = "/api/auth/login";
          }}
        >
          <CircleUserRound />
          {user ? "Profil" : "Logowanie"}
        </button>
      </nav>
      <Dialog
        open={!!game}
        onOpenChange={(o) => {
          if (!o && !active) setGame(null);
        }}
      >
        <DialogContent className="game-dialog">
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
              loading={loading}
              play={play}
              post={post}
              load={load}
              close={() => setGame(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="game-dialog info-dialog">
          <DialogHeader>
            <DialogTitle>Informacje i zasady 2fgt</DialogTitle>
            <DialogDescription>
              Społecznościowa gra demonstracyjna z walutą $FGT.
            </DialogDescription>
          </DialogHeader>
          <div className="info-dialog-body">
            <div className="info-notice">
              <Info />
              <div>
                <strong>Zasady automatu Midnight 2fgt</strong>
                <p style={{ marginTop: "6px", lineHeight: "1.5" }}>
                  • Siatka 5 bębnów × 3 rzędy z 6 symbolami: 2, F, G, T, ◆, ♛
                  <br />• Rozliczana jest <b>linia środkowa</b> (środkowe
                  symbole z 5 bębnów)
                  <br />• 3 identyczne symbole = wygrana <b>×2</b> stawki
                  <br />• 4 identyczne symbole = wygrana <b>×6</b> stawki
                  <br />• 5 identycznych symboli = wygrana <b>×12</b> stawki
                </p>
              </div>
            </div>
            <div className="info-points">
              <div>
                <strong>Wirtualne tokeny $FGT</strong>
                <span>
                  Nowe konto zaczyna ze 100 $FGT. Punkty służą wyłącznie do
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
              Imię gracza (z Authentik)
              <input
                name="nick"
                value={data?.player.nick || firstName}
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
  onClick,
}: {
  kind: string;
  title: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
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
      <div className="game-art">
        {icon}
        <span className="tag">GRAJ</span>
      </div>
      <div className="game-info">
        <div>
          <p>{label}</p>
          <h3>{title}</h3>
        </div>
        <button aria-label={`Zagraj w ${title}`}>→</button>
      </div>
      <div className="game-meta">
        <span>Min. 1 $FGT</span>
        <span>Serwerowy wynik</span>
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
          max="5000"
          value={bet}
          onChange={(e) =>
            setBet(Math.max(1, Math.min(5000, Number(e.target.value))))
          }
        />
        <button
          aria-label="Podwój stawkę"
          onClick={() => setBet(Math.min(5000, bet * 2))}
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
  loading,
  play,
  post,
  load,
  close,
}: any) {
  const round = active?.game === game ? active : null,
    [spinning, setSpinning] = useState(false),
    [rouletteWaiting, setRouletteWaiting] = useState(false),
    [spinResult, setSpinResult] = useState<any>(null),
    [pendingMine, setPendingMine] = useState<number | null>(null),
    [blackjackPreview, setBlackjackPreview] = useState<any>(null);
  const shownRound = blackjackPreview || round;
  const showSettledBlackjack = async (move: string) => {
    if (!round || loading) return;
    const j = await post(
      { action: "blackjack", roundId: round.id, move },
      { deferRefresh: true },
    );
    if (j?.round?.state === "settled") {
      setBlackjackPreview({ ...j.round, state: "settled" });
      window.setTimeout(() => {
        setBlackjackPreview(null);
        void load();
      }, 3000);
    }
  };
  const start = async () => {
    if (game !== "roulette") {
      await play();
      return;
    }
    setRouletteWaiting(true);
    const j = await post({ game, bet, choice });
    if (j) {
      setSpinResult(j.round);
      setRouletteWaiting(false);
      setSpinning(true);
    } else setRouletteWaiting(false);
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
                onStopSpinning={() => setSpinning(false)}
              />
              {spinResult && !spinning && !rouletteWaiting && (
                <div className="roulette-result" aria-live="polite">
                  <span>WYGRANA LICZBA</span>
                  <strong>{winningNumber}</strong>
                </div>
              )}
            </div>
            <RouletteBets choice={choice} setChoice={setChoice} />
          </>
        )}
        {game === "slots" && (
          <div
            className={`reels ${loading ? "rolling" : ""}`}
            key={last?.id || "idle"}
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
      {last && !shownRound && !blackjackPreview && !spinning && (
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
            disabled={loading || spinning}
            onClick={start}
          >
            {spinning
              ? "Koło się kręci…"
              : loading
                ? "Rozliczanie…"
                : last
                  ? "Zagraj ponownie"
                  : "Rozpocznij rundę"}
          </button>
        </>
      )}
      {round?.game === "blackjack" && !blackjackPreview && (
        <div className="actions three">
          <button
            className="secondary"
            disabled={loading}
            onClick={() => showSettledBlackjack("stand")}
          >
            Pas
          </button>
          <button
            className="secondary"
            disabled={loading || round.payload.cards.length !== 2}
            onClick={() => showSettledBlackjack("double")}
          >
            Podwój
          </button>
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
      {game === "blackjack" && (
        <div className="payout-note">
          Blackjack 3:2 · zwykła wygrana 1:1 · waluta $FGT
        </div>
      )}
      {game === "slots" && (
        <div className="payout-note">
          Środkowa linia: 3 te same = ×2 · 4 = ×6 · 5 = ×12 (symbole: 2, F, G,
          T, ◆, ♛)
        </div>
      )}
      <button className="rules-link" onClick={close}>
        Wróć do lobby
      </button>
    </div>
  );
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
