import React, { useState } from "react";
import {
  ArrowLeft,
  Scale,
  ShieldCheck,
  Coins,
  AlertTriangle,
  Flame,
  Bot,
  Lock,
  CheckCircle2,
} from "lucide-react";

export function TosPage({ onBack, onAccept, accepted }) {
  const [activeSection, setActiveSection] = useState("general");

  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="tos-page-wrapper">
      {/* Top Breadcrumb & Navigation Bar */}
      <div className="tos-page-nav">
        <button type="button" className="btn-tos-back" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Wróć do kasyna</span>
        </button>
        <div className="tos-page-meta">
          <span className="tos-status-pill">
            Wersja 2.1 · Obowiązujący
          </span>
          <span className="tos-date-text">Aktualizacja: 22.09.2026</span>
        </div>
      </div>

      {/* Hero Header */}
      <header className="tos-hero-banner">
        <div className="tos-hero-badge">
          <Scale size={16} className="text-amber-400" />
          <span>DOKUMENTACJA PRAWNA & REGULAMIN</span>
        </div>
        <h1 className="tos-hero-title">Regulamin Kasyna Klubowego 2FGT</h1>
        <p className="tos-hero-desc">
          Zasady korzystania z platformy rozrywkowej, mechanizmy Provably Fair, polityka antybotowa
          oraz warunki posługiwania się wirtualnymi rublami (₽).
        </p>
      </header>

      {/* Main Grid: Sidebar TOC + Content */}
      <div className="tos-grid-layout">
        {/* Sticky Table of Contents */}
        <aside className="tos-toc-sidebar">
          <div className="tos-toc-card">
            <span className="tos-toc-title">Spis treści</span>
            <nav className="tos-toc-nav" aria-label="Nawigacja spisu treści">
              <button
                type="button"
                className={`tos-toc-link ${activeSection === "general" ? "active" : ""}`}
                onClick={() => scrollTo("general")}
              >
                1. Postanowienia ogólne
              </button>
              <button
                type="button"
                className={`tos-toc-link ${activeSection === "age" ? "active" : ""}`}
                onClick={() => scrollTo("age")}
              >
                2. Odpowiedzialna Rozrywka
              </button>
              <button
                type="button"
                className={`tos-toc-link ${activeSection === "currency" ? "active" : ""}`}
                onClick={() => scrollTo("currency")}
              >
                3. Wirtualne Ruble (₽)
              </button>
              <button
                type="button"
                className={`tos-toc-link ${activeSection === "provably-fair" ? "active" : ""}`}
                onClick={() => scrollTo("provably-fair")}
              >
                4. Zasady Gier & Provably Fair
              </button>
              <button
                type="button"
                className={`tos-toc-link ${activeSection === "anticheat" ? "active" : ""}`}
                onClick={() => scrollTo("anticheat")}
              >
                5. Anti-Cheat i Rate Limiting
              </button>
              <button
                type="button"
                className={`tos-toc-link ${activeSection === "missions" ? "active" : ""}`}
                onClick={() => scrollTo("missions")}
              >
                6. Misje i Bonusy
              </button>
              <button
                type="button"
                className={`tos-toc-link ${activeSection === "security" ? "active" : ""}`}
                onClick={() => scrollTo("security")}
              >
                7. Bezpieczeństwo i SSO
              </button>
              <button
                type="button"
                className={`tos-toc-link ${activeSection === "liability" ? "active" : ""}`}
                onClick={() => scrollTo("liability")}
              >
                8. Wyłączenie Odpowiedzialności
              </button>
            </nav>
          </div>
        </aside>

        {/* Content Body */}
        <main className="tos-content-body">
          {/* Section 1 */}
          <section id="general" className="tos-section-card">
            <div className="tos-section-header">
              <div className="tos-section-num">01</div>
              <div>
                <h2>Postanowienia Ogólne i Charakter Serwisu</h2>
                <p className="tos-section-lead">Podstawowe założenia platformy rozrywkowej 2FGT</p>
              </div>
            </div>
            <div className="tos-section-text">
              <p>
                Platforma <strong>Kasyno 2FGT</strong> (dostępna pod adresem <code>drezzz.tech</code>) jest
                niekomercyjnym serwisem rozrywkowym o charakterze zamkniętym i klubowym, stworzonym w celach
                pokazowych i hobbystycznych.
              </p>
              <p>
                Serwis <strong>nie prowadzi działalności hazardowej</strong> w rozumieniu Ustawy o grach
                hazardowych. Na platformie nie występują żadne płatności rzeczywiste, transakcje FIAT, depozyty,
                ani możliwość wypłaty wygranych w realnej walucie lub kryptowalutach.
              </p>
            </div>
          </section>

          {/* Section 2 */}
          <section id="age" className="tos-section-card">
            <div className="tos-section-header">
              <div className="tos-section-num">02</div>
              <div>
                <h2>Odpowiedzialna Rozrywka i Higiena Cyfrowa</h2>
                <p className="tos-section-lead">Zasady dostępu, zdrowy balans i kontrola czasu gry</p>
              </div>
            </div>
            <div className="tos-section-text">
              <div className="tos-callout warning">
                <AlertTriangle size={20} className="text-amber-400 shrink-0" />
                <div>
                  <strong>Zasady bezpiecznej rozgrywki</strong>
                  <p>
                    Rozgrywka ma charakter czysto symulacyjny. Wszystkie punkty i żetony generowane są wirtualnie.
                  </p>
                </div>
              </div>
              <p>
                Mimo że gry symulacyjne nie operują realnymi pieniędzmi, przypominamy o zasadach higieny cyfrowej:
              </p>
              <ul className="tos-bullet-list">
                <li>Traktuj rozgrywkę jako formę relaksu i eksperymentu z algorytmami statystycznymi.</li>
                <li>Rób regularne przerwy w sesjach gry.</li>
                <li>Pamiętaj, że wygrane w walucie wirtualnej nie odzwierciedlają szans w komercyjnych grach losowych.</li>
              </ul>
            </div>
          </section>

          {/* Section 3 */}
          <section id="currency" className="tos-section-card">
            <div className="tos-section-header">
              <div className="tos-section-num">03</div>
              <div>
                <h2>Status Wirtualnych Rubli (₽)</h2>
                <p className="tos-section-lead">Brak wartości materialnej i reguły dystrybucji</p>
              </div>
            </div>
            <div className="tos-section-text">
              <p>
                Wirtualne <strong>ruble (₽)</strong> są wewnętrznym punktem symulacyjnym, generowanym
                automatycznie przez serwer.
              </p>
              <div className="tos-key-facts-grid">
                <div className="tos-fact-box">
                  <Coins size={20} className="text-amber-400" />
                  <b>0 PLN wartości</b>
                  <span>Tokeny nie mogą być sprzedawane, wymieniane ani spieniężane.</span>
                </div>
                <div className="tos-fact-box">
                  <Flame size={20} className="text-rose-400" />
                  <b>Darmowe doładowania</b>
                  <span>Punkty otrzymuje się z bonusu dziennego (streak) i misji.</span>
                </div>
                <div className="tos-fact-box">
                  <Lock size={20} className="text-cyan-400" />
                  <b>Brak transferów</b>
                  <span>Przelewanie punktów między kontami jest zablokowane.</span>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section id="provably-fair" className="tos-section-card">
            <div className="tos-section-header">
              <div className="tos-section-num">04</div>
              <div>
                <h2>Mechanika Gier & Silnik Provably Fair (RNG)</h2>
                <p className="tos-section-lead">Kryptograficzna uczciwość i zasady rozliczania</p>
              </div>
            </div>
            <div className="tos-section-text">
              <p>
                Wszystkie gry w serwisie są rozliczane w 100% po stronie serwera w języku Go z użyciem
                kryptograficznie bezpiecznego generatora liczb losowych <code>crypto/rand</code> oraz algorytmów
                <strong>HMAC-SHA256</strong>:
              </p>

              <div className="tos-games-summary-table">
                <div className="tos-game-row">
                  <span className="tos-game-cell-name">Ruletka</span>
                  <span className="tos-game-cell-rtp">RTP 97.3%</span>
                  <span className="tos-game-cell-desc">Europejskie koło (37 pól, 0–36). Wygrana do ×36.</span>
                </div>
                <div className="tos-game-row">
                  <span className="tos-game-cell-name">Blackjack</span>
                  <span className="tos-game-cell-rtp">Wypłata 3:2</span>
                  <span className="tos-game-cell-desc">Krupier dobiera do 17. Opcja podwojenia (double) i pasu.</span>
                </div>
                <div className="tos-game-row">
                  <span className="tos-game-cell-name">Mines</span>
                  <span className="tos-game-cell-rtp">RTP 97.0%</span>
                  <span className="tos-game-cell-desc">Siatka 5×5, 2–24 min. Cash-out w dowolnej chwili.</span>
                </div>
                <div className="tos-game-row">
                  <span className="tos-game-cell-name">Slots</span>
                  <span className="tos-game-cell-rtp">Do ×12</span>
                  <span className="tos-game-cell-desc">5 bębnów, linia środkowa: 3 (×2), 4 (×6), 5 (×12).</span>
                </div>
                <div className="tos-game-row">
                  <span className="tos-game-cell-name">Coinflip</span>
                  <span className="tos-game-cell-rtp">RTP 99.0%</span>
                  <span className="tos-game-cell-desc">Rzut monetą (Orzeł/Reszka), stały mnożnik ×1.98.</span>
                </div>
                <div className="tos-game-row">
                  <span className="tos-game-cell-name">KPN</span>
                  <span className="tos-game-cell-rtp">PvE Duel</span>
                  <span className="tos-game-cell-desc">Kamień, Papier, Nożyce przeciwko serwerowi (×1.98).</span>
                </div>
                <div className="tos-game-row">
                  <span className="tos-game-cell-name">Plinko</span>
                  <span className="tos-game-cell-rtp">Do ×1000</span>
                  <span className="tos-game-cell-desc">Fizyka kołków (14 lub 16 rzędów), 3 poziomy ryzyka.</span>
                </div>
                <div className="tos-game-row">
                  <span className="tos-game-cell-name">Limbo</span>
                  <span className="tos-game-cell-rtp">RTP 96.0%</span>
                  <span className="tos-game-cell-desc">Docelowy mnożnik 1.50× – 10000×.</span>
                </div>
                <div className="tos-game-row">
                  <span className="tos-game-cell-name">Crash</span>
                  <span className="tos-game-cell-rtp">RTP 99.0%</span>
                  <span className="tos-game-cell-desc">Mnożnik rosnący w czasie rzeczywistym z punktem rozbicia (start 0.80×).</span>
                </div>
                <div className="tos-game-row">
                  <span className="tos-game-cell-name">Chicken Cross</span>
                  <span className="tos-game-cell-rtp">RTP 95.0%</span>
                  <span className="tos-game-cell-desc">10 pasów ruchu, 4 poziomy trudności (do ×4000).</span>
                </div>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section id="anticheat" className="tos-section-card">
            <div className="tos-section-header">
              <div className="tos-section-num">05</div>
              <div>
                <h2>Polityka Uczciwej Gry, Anti-Cheat i Rate Limiting</h2>
                <p className="tos-section-lead">Automatyczne zabezpieczenia i wykrywanie botów</p>
              </div>
            </div>
            <div className="tos-section-text">
              <p>
                W celu zapewnienia równej i stabilnej rozgrywki dla wszystkich użytkowników, serwer wyposażony jest
                w <strong>silnik antycheatowy</strong>:
              </p>
              <div className="tos-bot-rules-box">
                <div className="flex items-center gap-2 mb-2">
                  <Bot size={18} className="text-amber-400" />
                  <strong className="text-white">Limity zapytań (Sliding Window):</strong>
                </div>
                <ul className="tos-bullet-list">
                  <li><strong>Maksymalnie 4 akcje gry na sekundę</strong> (POST /api/casino).</li>
                  <li><strong>Maksymalnie 12 akcji na 10 sekund</strong> oraz 30 akcji na minutę.</li>
                  <li><strong>Maksymalnie 8 odpytań stanu na sekundę</strong> (GET /api/casino).</li>
                </ul>
              </div>
              <p>
                Przekroczenie limitów (3 naruszenia w ciągu 60s) skutkuje automatycznym oznaczeniem konta flagą{" "}
                <code className="text-amber-400">BOT_DETECTED</code>, zablokowaniem żądania kodem HTTP 429 i
                utrwaleniem zdarzenia w dedykowanym rejestrze serwerowym z identyfikatorem nicku i adresu IP.
              </p>
            </div>
          </section>

          {/* Section 6 */}
          <section id="missions" className="tos-section-card">
            <div className="tos-section-header">
              <div className="tos-section-num">06</div>
              <div>
                <h2>Misje Rotacyjne i Bonus Dzienny</h2>
                <p className="tos-section-lead">Cykle 6-godzinne i zasady naliczania nagród</p>
              </div>
            </div>
            <div className="tos-section-text">
              <ul className="tos-bullet-list">
                <li>
                  <strong>Rotacja co 6 godzin:</strong> Pula misji kasyna wybiera deterministycznie 6 zróżnicowanych
                  zadań na każde okno czasowe (00:00, 06:00, 12:00, 18:00 UTC).
                </li>
                <li>
                  <strong>Nagrody za misje:</strong> Ukończenie zadania zasila konto wirtualnymi rublami (₽) oraz punktami
                  doświadczenia XP.
                </li>
                <li>
                  <strong>Bonus dzienny (Streak):</strong> Logowanie dzień po dniu zwiększa mnożnik bonusu
                  dziennego aż do 1,000 ₽.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 7 */}
          <section id="security" className="tos-section-card">
            <div className="tos-section-header">
              <div className="tos-section-num">07</div>
              <div>
                <h2>Bezpieczeństwo Kont i Uwierzytelnianie SSO</h2>
                <p className="tos-section-lead">Logowanie przez Authentik i prywatność</p>
              </div>
            </div>
            <div className="tos-section-text">
              <p>
                Dostęp do kasyna odbywa się za pośrednictwem bezpiecznego serwera tożsamości{" "}
                <strong>Authentik SSO</strong>. Sesje zabezpieczone są tokenami podpisanymi kluczem HMAC-SHA256 z
                flagą <code>HttpOnly</code> oraz <code>SameSite=Lax</code>.
              </p>
              <p>
                Użytkownik ponosi wyłączną odpowiedzialność za bezpieczeństwo swoich danych logowania do konta
                Authentik.
              </p>
            </div>
          </section>

          {/* Section 8 */}
          <section id="liability" className="tos-section-card">
            <div className="tos-section-header">
              <div className="tos-section-num">08</div>
              <div>
                <h2>Wyłączenie Odpowiedzialności i Postanowienia Końcowe</h2>
                <p className="tos-section-lead">Zastrzeżenia prawne i modyfikacje serwisu</p>
              </div>
            </div>
            <div className="tos-section-text">
              <p>
                Administratorzy zastrzegają sobie prawo do przeprowadzania prac konserwacyjnych, resetu wirtualnego
                salda graczy w przypadku wykrycia błędów, oraz aktualizacji niniejszego regulaminu.
              </p>
              <p>
                Korzystanie z serwisu po wprowadzeniu zmian oznacza akceptację zaktualizowanego regulaminu.
              </p>
            </div>
          </section>

          {/* Bottom Confirmation Bar */}
          <div className="tos-bottom-card">
            <div className="flex items-center gap-3">
              <ShieldCheck size={24} className="text-emerald-400 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-white">Akceptacja Zasad Gry</h3>
                <p className="text-xs text-slate-400">
                  {accepted
                    ? "Zaakceptowałeś ten regulamin. Możesz w każdej chwili wrócić do gry."
                    : "Kliknij poniżej, aby zatwierdzić regulamin i przejść do kasyna."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" className="btn-tos-return" onClick={onBack}>
                Wróć do gier
              </button>
              {!accepted && onAccept && (
                <button
                  type="button"
                  className="btn-tos-accept-bottom"
                  onClick={() => {
                    onAccept();
                    onBack();
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>Akceptuję Regulamin</span>
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
