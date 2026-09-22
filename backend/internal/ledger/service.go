package ledger

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	ErrInsufficientFunds   = errors.New("INSUFFICIENT_FUNDS")
	ErrActiveRoundExists   = errors.New("ACTIVE_ROUND_EXISTS")
	ErrRoundNotFound       = errors.New("ROUND_NOT_FOUND")
	ErrRoundAlreadySettled = errors.New("ROUND_ALREADY_SETTLED")
	ErrAlreadyClaimed      = errors.New("ALREADY_CLAIMED")
	ErrMissionNotReady     = errors.New("MISSION_NOT_READY")
	ErrInvalidBet          = errors.New("INVALID_BET")
	ErrRevisionConflict    = errors.New("REVISION_CONFLICT")
)

type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

func NowMs() int64 {
	return time.Now().UnixMilli()
}

func TodayString() string {
	return time.Now().UTC().Format("2006-01-02")
}

func DailyBonusAmount(streak int) int64 {
	bonus := 100 + streak*50
	if bonus > 1000 {
		bonus = 1000
	}
	return int64(bonus)
}

func (s *Service) GetOrCreatePlayer(ctx context.Context, userID, email, preferredNick string, defaultBalance int64) (*Player, error) {
	pool := s.db.Pool

	var p Player
	err := pool.QueryRow(ctx, `
		SELECT user_id, email, nick, balance, xp, level, streak, last_bonus_day, created_at, updated_at
		FROM players WHERE user_id = $1
	`, userID).Scan(&p.UserID, &p.Email, &p.Nick, &p.Balance, &p.XP, &p.Level, &p.Streak, &p.LastBonusDay, &p.CreatedAt, &p.UpdatedAt)

	if err == nil {
		// Existing player
		if preferredNick != "" && p.Nick != preferredNick {
			var exists bool
			_ = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM players WHERE nick = $1 AND user_id != $2)`, preferredNick, userID).Scan(&exists)
			if !exists {
				_, _ = pool.Exec(ctx, `UPDATE players SET nick = $1 WHERE user_id = $2`, preferredNick, userID)
				p.Nick = preferredNick
			}
		}
		return &p, nil
	}

	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("failed to fetch player: %w", err)
	}

	// Create new player with welcome bonus
	nick := preferredNick
	if nick == "" {
		parts := strings.Split(email, "@")
		if len(parts) > 0 && parts[0] != "" {
			nick = parts[0]
		} else {
			nick = "Gracz"
		}
	}
	if len(nick) > 30 {
		nick = nick[:30]
	}

	// Ensure unique nick
	var count int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM players WHERE nick = $1`, nick).Scan(&count)
	if count > 0 {
		uShort := userID
		if len(uShort) > 4 {
			uShort = uShort[:4]
		}
		if len(nick) > 15 {
			nick = nick[:15]
		}
		nick = fmt.Sprintf("%s_%s", nick, uShort)
	}

	t := NowMs()
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("transaction begin failed: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO players (user_id, email, nick, balance, xp, level, streak, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 0, 1, 0, $5, $5)
	`, userID, email, nick, defaultBalance, t)
	if err != nil {
		return nil, fmt.Errorf("failed to insert player: %w", err)
	}

	ledgerID := uuid.NewString()
	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
		VALUES ($1, $2, 'welcome_bonus', $3, $3, $4)
	`, ledgerID, userID, defaultBalance, t)
	if err != nil {
		return nil, fmt.Errorf("failed to insert welcome ledger: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit new player: %w", err)
	}

	return s.GetPlayer(ctx, userID)
}

func (s *Service) GetPlayer(ctx context.Context, userID string) (*Player, error) {
	var p Player
	err := s.db.Pool.QueryRow(ctx, `
		SELECT user_id, email, nick, balance, xp, level, streak, last_bonus_day, created_at, updated_at
		FROM players WHERE user_id = $1
	`, userID).Scan(&p.UserID, &p.Email, &p.Nick, &p.Balance, &p.XP, &p.Level, &p.Streak, &p.LastBonusDay, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Service) GetActiveRound(ctx context.Context, userID string) (*GameRound, error) {
	var r GameRound
	err := s.db.Pool.QueryRow(ctx, `
		SELECT id, user_id, game, state, bet, payout, result, payload, revision, created_at, settled_at
		FROM game_rounds
		WHERE user_id = $1 AND state = 'active'
		ORDER BY created_at DESC LIMIT 1
	`, userID).Scan(&r.ID, &r.UserID, &r.Game, &r.State, &r.Bet, &r.Payout, &r.Result, &r.Payload, &r.Revision, &r.CreatedAt, &r.SettledAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *Service) GetRoundsToday(ctx context.Context, userID string) (int, error) {
	now := time.Now().UTC()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).UnixMilli()

	var count int
	err := s.db.Pool.QueryRow(ctx, `
		SELECT count(*) FROM game_rounds
		WHERE user_id = $1 AND state = 'settled'
		  AND (settled_at >= $2 OR (settled_at IS NULL AND created_at >= $2))
	`, userID, startOfDay).Scan(&count)
	return count, err
}

func (s *Service) IsDailyMissionClaimed(ctx context.Context, userID string, today string) (bool, error) {
	var exists bool
	err := s.db.Pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM daily_mission_claims
			WHERE user_id = $1 AND claim_day = $2 AND mission_id = 'daily_5_rounds'
		)
	`, userID, today).Scan(&exists)
	return exists, err
}

func (s *Service) GetHistory(ctx context.Context, userID string, limit, offset int) (*HistoryResponse, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	if offset < 0 {
		offset = 0
	}

	rows, err := s.db.Pool.Query(ctx, `
		SELECT 
			l.id,
			l.user_id,
			l.round_id,
			l.type,
			l.amount,
			l.balance_after,
			l.created_at,
			g.game,
			g.result,
			g.bet,
			g.payout
		FROM ledger_entries l
		LEFT JOIN game_rounds g ON l.round_id = g.id
		WHERE l.user_id = $1
		ORDER BY l.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to query history: %w", err)
	}
	defer rows.Close()

	entries := make([]LedgerEntry, 0)
	for rows.Next() {
		var e LedgerEntry
		err := rows.Scan(
			&e.ID,
			&e.UserID,
			&e.RoundID,
			&e.Type,
			&e.Amount,
			&e.BalanceAfter,
			&e.CreatedAt,
			&e.Game,
			&e.Result,
			&e.Bet,
			&e.Payout,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan ledger row: %w", err)
		}
		entries = append(entries, e)
	}

	var total int
	_ = s.db.Pool.QueryRow(ctx, `SELECT count(*) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&total)

	return &HistoryResponse{
		Entries: entries,
		Total:   total,
		HasMore: offset+len(entries) < total,
	}, nil
}

func (s *Service) GetLeaderboard(ctx context.Context, limit int) ([]LeaderboardEntry, error) {
	if limit <= 0 || limit > 50 {
		limit = 5
	}
	rows, err := s.db.Pool.Query(ctx, `
		SELECT nick, balance, level FROM players ORDER BY balance DESC LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	leaders := make([]LeaderboardEntry, 0)
	for rows.Next() {
		var l LeaderboardEntry
		if err := rows.Scan(&l.Nick, &l.Balance, &l.Level); err != nil {
			return nil, err
		}
		leaders = append(leaders, l)
	}
	return leaders, nil
}

func (s *Service) ClaimDailyBonus(ctx context.Context, userID string) (int64, int64, int, error) {
	p, err := s.GetPlayer(ctx, userID)
	if err != nil {
		return 0, 0, 0, err
	}

	day := TodayString()
	if p.LastBonusDay != nil && *p.LastBonusDay == day {
		return 0, 0, 0, ErrAlreadyClaimed
	}

	// Streak calculation
	streak := 1
	if p.LastBonusDay != nil && *p.LastBonusDay != "" {
		prevDate, err := time.Parse("2006-01-02", *p.LastBonusDay)
		todayDate, _ := time.Parse("2006-01-02", day)
		if err == nil && todayDate.Sub(prevDate).Hours() <= 48 && todayDate.Sub(prevDate).Hours() >= 24 {
			streak = p.Streak + 1
		}
	}

	amount := DailyBonusAmount(streak)
	t := NowMs()

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return 0, 0, 0, err
	}
	defer tx.Rollback(ctx)

	// Idempotent insertion guard
	tag, err := tx.Exec(ctx, `
		INSERT INTO daily_claims (user_id, claim_day, amount, created_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT DO NOTHING
	`, userID, day, amount, t)
	if err != nil {
		return 0, 0, 0, err
	}
	if tag.RowsAffected() == 0 {
		return 0, 0, 0, ErrAlreadyClaimed
	}

	var newBal int64
	err = tx.QueryRow(ctx, `
		UPDATE players
		SET balance = balance + $1, streak = $2, last_bonus_day = $3, updated_at = $4
		WHERE user_id = $5
		RETURNING balance
	`, amount, streak, day, t, userID).Scan(&newBal)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("failed to update player balance: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
		VALUES ($1, $2, 'daily_bonus', $3, $4, $5)
	`, uuid.NewString(), userID, amount, newBal, t)
	if err != nil {
		return 0, 0, 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, 0, 0, err
	}

	return amount, newBal, streak, nil
}

type MissionDef struct {
	ID          string
	Title       string
	Description string
	Category    string
	Icon        string
	Target      int64
	Reward      int64
	XPReward    int
	StatKey     string
}

var DailyMissionDefs = []MissionDef{
	// 🌟 Ogólne & Zwycięstwa
	{
		ID:          "all_5",
		Title:       "Rozgrzewka Kasynowa",
		Description: "Rozegraj 5 dowolnych rund w kasynie",
		Category:    "Ogólne",
		Icon:        "flame",
		Target:      5,
		Reward:      250,
		XPReward:    50,
		StatKey:     "total",
	},
	{
		ID:          "all_15",
		Title:       "Kasynowy Bywalec",
		Description: "Rozegraj 15 rund w dowolnych grach",
		Category:    "Ogólne",
		Icon:        "flame",
		Target:      15,
		Reward:      500,
		XPReward:    100,
		StatKey:     "total",
	},
	{
		ID:          "all_30",
		Title:       "Maraton Hazardowy",
		Description: "Rozegraj 30 rund w dowolnych grach",
		Category:    "Ogólne",
		Icon:        "flame",
		Target:      30,
		Reward:      1000,
		XPReward:    200,
		StatKey:     "total",
	},
	{
		ID:          "all_50",
		Title:       "Władca Stołów",
		Description: "Rozegraj 50 rund w tym 6-godzinnym cyklu",
		Category:    "Ogólne",
		Icon:        "crown",
		Target:      50,
		Reward:      2000,
		XPReward:    400,
		StatKey:     "total",
	},
	{
		ID:          "wins_3",
		Title:       "Trzy Sukcesy",
		Description: "Wygraj 3 dowolne rundy w kasynie",
		Category:    "Zwycięstwa",
		Icon:        "sparkles",
		Target:      3,
		Reward:      300,
		XPReward:    60,
		StatKey:     "total_wins",
	},
	{
		ID:          "wins_10",
		Title:       "Złota Seria",
		Description: "Wygraj 10 rund w dowolnych grach",
		Category:    "Zwycięstwa",
		Icon:        "sparkles",
		Target:      10,
		Reward:      800,
		XPReward:    160,
		StatKey:     "total_wins",
	},
	{
		ID:          "wins_25",
		Title:       "Niezłomny Zwycięzca",
		Description: "Wygraj 25 rund w kasynie",
		Category:    "Zwycięstwa",
		Icon:        "trophy",
		Target:      25,
		Reward:      2500,
		XPReward:    500,
		StatKey:     "total_wins",
	},

	// 💰 Obrót & High Roller
	{
		ID:          "wager_500",
		Title:       "Pierwsze Inwestycje",
		Description: "Postaw łącznie co najmniej 500 $FGT",
		Category:    "Obrót",
		Icon:        "coins",
		Target:      500,
		Reward:      200,
		XPReward:    40,
		StatKey:     "wager",
	},
	{
		ID:          "wager_2500",
		Title:       "Płynność Finansowa",
		Description: "Postaw łącznie co najmniej 2,500 $FGT",
		Category:    "Obrót",
		Icon:        "coins",
		Target:      2500,
		Reward:      600,
		XPReward:    120,
		StatKey:     "wager",
	},
	{
		ID:          "wager_10000",
		Title:       "Kasynowy Magnat",
		Description: "Postaw łącznie co najmniej 10,000 $FGT",
		Category:    "High Roller",
		Icon:        "trophy",
		Target:      10000,
		Reward:      2000,
		XPReward:    400,
		StatKey:     "wager",
	},
	{
		ID:          "wager_50000",
		Title:       "Wielki Wieloryb",
		Description: "Postaw łącznie co najmniej 50,000 $FGT",
		Category:    "High Roller",
		Icon:        "crown",
		Target:      50000,
		Reward:      10000,
		XPReward:    1500,
		StatKey:     "wager",
	},

	// 🔴 Ruletka
	{
		ID:          "roulette_3",
		Title:       "Mistrz Koła",
		Description: "Zakręć kołem Europejskiej Ruletki 3 razy",
		Category:    "Ruletka",
		Icon:        "roulette",
		Target:      3,
		Reward:      300,
		XPReward:    60,
		StatKey:     "roulette",
	},
	{
		ID:          "roulette_8",
		Title:       "Król Ruletki",
		Description: "Rozegraj 8 rund w Europejską Ruletkę",
		Category:    "Ruletka",
		Icon:        "roulette",
		Target:      8,
		Reward:      750,
		XPReward:    150,
		StatKey:     "roulette",
	},
	{
		ID:          "roulette_win_3",
		Title:       "Czysta Intuicja",
		Description: "Traf wygraną w Ruletce 3 razy",
		Category:    "Ruletka",
		Icon:        "roulette",
		Target:      3,
		Reward:      600,
		XPReward:    120,
		StatKey:     "roulette_wins",
	},

	// 💎 Saper
	{
		ID:          "mines_3",
		Title:       "Poszukiwacz Diamentów",
		Description: "Rozegraj 3 rundy w Sapera (Mines)",
		Category:    "Saper",
		Icon:        "pickaxe",
		Target:      3,
		Reward:      350,
		XPReward:    70,
		StatKey:     "mines",
	},
	{
		ID:          "mines_8",
		Title:       "Doświadczony Saper",
		Description: "Rozegraj 8 rund w Sapera (Mines)",
		Category:    "Saper",
		Icon:        "pickaxe",
		Target:      8,
		Reward:      750,
		XPReward:    150,
		StatKey:     "mines",
	},
	{
		ID:          "mines_win_3",
		Title:       "Diamentowa Ręka",
		Description: "Wypłać wygraną z Sapera 3 razy",
		Category:    "Saper",
		Icon:        "pickaxe",
		Target:      3,
		Reward:      650,
		XPReward:    130,
		StatKey:     "mines_wins",
	},

	// 🃏 Blackjack
	{
		ID:          "blackjack_3",
		Title:       "Karciany Strateg",
		Description: "Rozegraj 3 rozdania w Blackjack 21",
		Category:    "Blackjack",
		Icon:        "spade",
		Target:      3,
		Reward:      350,
		XPReward:    70,
		StatKey:     "blackjack",
	},
	{
		ID:          "blackjack_8",
		Title:       "Mistrz Oczka",
		Description: "Rozegraj 8 rozdań w Blackjack 21",
		Category:    "Blackjack",
		Icon:        "spade",
		Target:      8,
		Reward:      800,
		XPReward:    160,
		StatKey:     "blackjack",
	},
	{
		ID:          "blackjack_win_3",
		Title:       "Pogromca Krupiera",
		Description: "Pokonaj krupiera w Blackjacku 3 razy",
		Category:    "Blackjack",
		Icon:        "spade",
		Target:      3,
		Reward:      700,
		XPReward:    140,
		StatKey:     "blackjack_wins",
	},

	// 🎰 Sloty
	{
		ID:          "slots_5",
		Title:       "Nocny Szczęściarz",
		Description: "Wykonaj 5 obrotów na automacie Midnight 2FGT",
		Category:    "Sloty",
		Icon:        "zap",
		Target:      5,
		Reward:      300,
		XPReward:    60,
		StatKey:     "slots",
	},
	{
		ID:          "slots_15",
		Title:       "Gorące Bębny",
		Description: "Wykonaj 15 obrotów na automacie Midnight 2FGT",
		Category:    "Sloty",
		Icon:        "zap",
		Target:      15,
		Reward:      700,
		XPReward:    140,
		StatKey:     "slots",
	},
	{
		ID:          "slots_win_3",
		Title:       "Trafienie w Linię",
		Description: "Traf wygrywającą kombinację na slotach 3 razy",
		Category:    "Sloty",
		Icon:        "zap",
		Target:      3,
		Reward:      500,
		XPReward:    100,
		StatKey:     "slots_wins",
	},

	// 🟡 Coin Flip
	{
		ID:          "coinflip_5",
		Title:       "Rzut Przeznaczenia",
		Description: "Rzuć monetą 5 razy w grze Coin Flip",
		Category:    "Coin Flip",
		Icon:        "coin",
		Target:      5,
		Reward:      300,
		XPReward:    60,
		StatKey:     "coinflip",
	},
	{
		ID:          "coinflip_12",
		Title:       "Podwójna Strona",
		Description: "Rzuć monetą 12 razy w grze Coin Flip",
		Category:    "Coin Flip",
		Icon:        "coin",
		Target:      12,
		Reward:      650,
		XPReward:    130,
		StatKey:     "coinflip",
	},
	{
		ID:          "coinflip_win_4",
		Title:       "Złoty Orzeł",
		Description: "Wygraj rzut monetą 4 razy",
		Category:    "Coin Flip",
		Icon:        "coin",
		Target:      4,
		Reward:      500,
		XPReward:    100,
		StatKey:     "coinflip_wins",
	},

	// ✂️ Kamień Papier Nożyce
	{
		ID:          "rps_5",
		Title:       "Szybki Pojedynek",
		Description: "Stocz 5 pojedynków w Kamień Papier Nożyce",
		Category:    "KPN",
		Icon:        "rps",
		Target:      5,
		Reward:      300,
		XPReward:    60,
		StatKey:     "rps",
	},
	{
		ID:          "rps_12",
		Title:       "Mistrz Gestów",
		Description: "Stocz 12 pojedynków w Kamień Papier Nożyce",
		Category:    "KPN",
		Icon:        "rps",
		Target:      12,
		Reward:      650,
		XPReward:    130,
		StatKey:     "rps",
	},
	{
		ID:          "rps_win_4",
		Title:       "Zwycięska Dłoń",
		Description: "Wygraj pojedynek w KPN 4 razy",
		Category:    "KPN",
		Icon:        "rps",
		Target:      4,
		Reward:      500,
		XPReward:    100,
		StatKey:     "rps_wins",
	},

	// 🔺 Plinko
	{
		ID:          "plinko_10",
		Title:       "Deszcz Kulek",
		Description: "Upuść 10 kulek w Plinko",
		Category:    "Plinko",
		Icon:        "plinko",
		Target:      10,
		Reward:      400,
		XPReward:    80,
		StatKey:     "plinko",
	},
	{
		ID:          "plinko_25",
		Title:       "Plinko Kaskada",
		Description: "Upuść 25 kulek w Plinko",
		Category:    "Plinko",
		Icon:        "plinko",
		Target:      25,
		Reward:      900,
		XPReward:    180,
		StatKey:     "plinko",
	},
	{
		ID:          "plinko_win_5",
		Title:       "Złoty Mnożnik",
		Description: "Traf zyskowny koszyk (>1x) w Plinko 5 razy",
		Category:    "Plinko",
		Icon:        "plinko",
		Target:      5,
		Reward:      600,
		XPReward:    120,
		StatKey:     "plinko_wins",
	},
}

// GetMissionWindow returns the start timestamp (ms), next reset timestamp (ms), and period key for 6-hour cycles.
func GetMissionWindow(now time.Time) (int64, int64, string) {
	now = now.UTC()
	hour := now.Hour()
	slot := hour / 6 // 0, 1, 2, 3
	slotStartHour := slot * 6
	start := time.Date(now.Year(), now.Month(), now.Day(), slotStartHour, 0, 0, 0, time.UTC)
	nextReset := start.Add(6 * time.Hour)
	periodKey := fmt.Sprintf("%s_%02dh", now.Format("2006-01-02"), slotStartHour)
	return start.UnixMilli(), nextReset.UnixMilli(), periodKey
}

func getActiveMissionsForWindow(periodKey string) []MissionDef {
	// Deterministic selection of 6 distinct missions for the given 6-hour periodKey
	h := sha256.Sum256([]byte("missions_seed_" + periodKey))
	seed := int64(binary.BigEndian.Uint64(h[:8]))
	rng := rand.New(rand.NewSource(seed))

	n := len(DailyMissionDefs)
	if n <= 6 {
		return DailyMissionDefs
	}

	indices := rng.Perm(n)
	selected := make([]MissionDef, 0, 6)
	seenCategories := make(map[string]int)

	// First pass: try to pick distinct categories
	for _, idx := range indices {
		def := DailyMissionDefs[idx]
		if seenCategories[def.Category] < 2 && len(selected) < 6 {
			seenCategories[def.Category]++
			selected = append(selected, def)
		}
	}

	// Fill up to 6 if needed
	for _, idx := range indices {
		if len(selected) >= 6 {
			break
		}
		def := DailyMissionDefs[idx]
		alreadyChosen := false
		for _, s := range selected {
			if s.ID == def.ID {
				alreadyChosen = true
				break
			}
		}
		if !alreadyChosen {
			selected = append(selected, def)
		}
	}

	return selected
}

func (s *Service) fetchMissionStats(ctx context.Context, userID string, startOfWindow int64) (map[string]int64, error) {
	var totalRounds, totalWins, totalWagered int64
	var rouletteRounds, rouletteWins int64
	var minesRounds, minesWins int64
	var blackjackRounds, blackjackWins int64
	var slotsRounds, slotsWins int64
	var coinflipRounds, coinflipWins int64
	var rpsRounds, rpsWins int64
	var plinkoRounds, plinkoWins int64

	err := s.db.Pool.QueryRow(ctx, `
		SELECT 
			COUNT(*),
			COUNT(*) FILTER (WHERE payout > bet),
			COALESCE(SUM(bet), 0),
			COUNT(*) FILTER (WHERE game = 'roulette'),
			COUNT(*) FILTER (WHERE game = 'roulette' AND payout > bet),
			COUNT(*) FILTER (WHERE game = 'mines'),
			COUNT(*) FILTER (WHERE game = 'mines' AND payout > bet),
			COUNT(*) FILTER (WHERE game = 'blackjack'),
			COUNT(*) FILTER (WHERE game = 'blackjack' AND payout > bet),
			COUNT(*) FILTER (WHERE game = 'slots'),
			COUNT(*) FILTER (WHERE game = 'slots' AND payout > bet),
			COUNT(*) FILTER (WHERE game = 'coinflip'),
			COUNT(*) FILTER (WHERE game = 'coinflip' AND payout > bet),
			COUNT(*) FILTER (WHERE game = 'rps'),
			COUNT(*) FILTER (WHERE game = 'rps' AND payout > bet),
			COUNT(*) FILTER (WHERE game = 'plinko'),
			COUNT(*) FILTER (WHERE game = 'plinko' AND payout > bet)
		FROM game_rounds
		WHERE user_id = $1 AND state = 'settled'
		  AND (settled_at >= $2 OR (settled_at IS NULL AND created_at >= $2))
	`, userID, startOfWindow).Scan(
		&totalRounds, &totalWins, &totalWagered,
		&rouletteRounds, &rouletteWins,
		&minesRounds, &minesWins,
		&blackjackRounds, &blackjackWins,
		&slotsRounds, &slotsWins,
		&coinflipRounds, &coinflipWins,
		&rpsRounds, &rpsWins,
		&plinkoRounds, &plinkoWins,
	)
	if err != nil {
		return nil, err
	}

	return map[string]int64{
		"total":          totalRounds,
		"total_wins":     totalWins,
		"wager":          totalWagered,
		"roulette":       rouletteRounds,
		"roulette_wins":  rouletteWins,
		"mines":          minesRounds,
		"mines_wins":     minesWins,
		"blackjack":      blackjackRounds,
		"blackjack_wins": blackjackWins,
		"slots":          slotsRounds,
		"slots_wins":     slotsWins,
		"coinflip":       coinflipRounds,
		"coinflip_wins":  coinflipWins,
		"rps":            rpsRounds,
		"rps_wins":       rpsWins,
		"plinko":         plinkoRounds,
		"plinko_wins":    plinkoWins,
	}, nil
}

func (s *Service) GetDailyMissions(ctx context.Context, userID string) ([]Mission, int64, error) {
	now := time.Now().UTC()
	startOfWindow, nextResetMs, periodKey := GetMissionWindow(now)

	activeDefs := getActiveMissionsForWindow(periodKey)

	stats, err := s.fetchMissionStats(ctx, userID, startOfWindow)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to fetch mission stats: %w", err)
	}

	claimedRows, err := s.db.Pool.Query(ctx, `
		SELECT mission_id FROM daily_mission_claims
		WHERE user_id = $1 AND claim_day = $2
	`, userID, periodKey)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query claimed missions: %w", err)
	}
	defer claimedRows.Close()

	claimedMap := make(map[string]bool)
	for claimedRows.Next() {
		var mID string
		if err := claimedRows.Scan(&mID); err == nil {
			claimedMap[mID] = true
		}
	}

	missions := make([]Mission, len(activeDefs))
	for i, def := range activeDefs {
		currentVal := stats[def.StatKey]
		if currentVal > def.Target {
			currentVal = def.Target
		}
		isClaimed := claimedMap[def.ID]
		isReady := stats[def.StatKey] >= def.Target && !isClaimed

		missions[i] = Mission{
			ID:          def.ID,
			Title:       def.Title,
			Description: def.Description,
			Category:    def.Category,
			Icon:        def.Icon,
			Current:     currentVal,
			Target:      def.Target,
			Reward:      def.Reward,
			XPReward:    def.XPReward,
			Claimed:     isClaimed,
			Ready:       isReady,
		}
	}

	return missions, nextResetMs, nil
}

func (s *Service) ClaimDailyMission(ctx context.Context, userID string, missionID string) (int64, int, int64, int, int, error) {
	if missionID == "" {
		missionID = "all_5"
	}

	var targetDef *MissionDef
	for _, def := range DailyMissionDefs {
		if def.ID == missionID {
			d := def
			targetDef = &d
			break
		}
	}
	if targetDef == nil {
		return 0, 0, 0, 0, 0, fmt.Errorf("nieznana misja: %s", missionID)
	}

	now := time.Now().UTC()
	startOfWindow, _, periodKey := GetMissionWindow(now)

	stats, err := s.fetchMissionStats(ctx, userID, startOfWindow)
	if err != nil {
		return 0, 0, 0, 0, 0, fmt.Errorf("failed to fetch daily stats: %w", err)
	}

	if stats[targetDef.StatKey] < targetDef.Target {
		return 0, 0, 0, 0, 0, ErrMissionNotReady
	}

	reward := targetDef.Reward
	xpReward := targetDef.XPReward
	t := NowMs()

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return 0, 0, 0, 0, 0, err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		INSERT INTO daily_mission_claims (user_id, claim_day, mission_id, amount, created_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT DO NOTHING
	`, userID, periodKey, missionID, reward, t)
	if err != nil {
		return 0, 0, 0, 0, 0, err
	}
	if tag.RowsAffected() == 0 {
		return 0, 0, 0, 0, 0, ErrAlreadyClaimed
	}

	var newBal int64
	var newXP, newLevel int
	err = tx.QueryRow(ctx, `
		UPDATE players
		SET balance = balance + $1,
		    xp = xp + $2,
		    level = 1 + ((xp + $2) / 500),
		    updated_at = $3
		WHERE user_id = $4
		RETURNING balance, xp, level
	`, reward, xpReward, t, userID).Scan(&newBal, &newXP, &newLevel)
	if err != nil {
		return 0, 0, 0, 0, 0, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
		VALUES ($1, $2, 'daily_mission', $3, $4, $5)
	`, uuid.NewString(), userID, reward, newBal, t)
	if err != nil {
		return 0, 0, 0, 0, 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, 0, 0, 0, 0, err
	}

	return reward, xpReward, newBal, newXP, newLevel, nil
}


func (s *Service) StartActiveRound(ctx context.Context, userID, game string, bet int64, payloadJSON string) (*GameRound, int64, error) {
	if bet <= 0 {
		return nil, 0, ErrInvalidBet
	}

	roundID := uuid.NewString()
	t := NowMs()

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)

	// Check if active round exists inside transaction
	var existingCount int
	_ = tx.QueryRow(ctx, `SELECT count(*) FROM game_rounds WHERE user_id = $1 AND state = 'active'`, userID).Scan(&existingCount)
	if existingCount > 0 {
		return nil, 0, ErrActiveRoundExists
	}

	// Atomic balance deduction
	var newBal int64
	err = tx.QueryRow(ctx, `
		UPDATE players
		SET balance = balance - $1, updated_at = $2
		WHERE user_id = $3 AND balance >= $1
		RETURNING balance
	`, bet, t, userID).Scan(&newBal)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, ErrInsufficientFunds
	}
	if err != nil {
		return nil, 0, fmt.Errorf("failed to deduct bet: %w", err)
	}

	// Insert active round
	_, err = tx.Exec(ctx, `
		INSERT INTO game_rounds (id, user_id, game, state, bet, payout, result, payload, revision, created_at)
		VALUES ($1, $2, $3, 'active', $4, 0, 'W toku', $5, 1, $6)
	`, roundID, userID, game, bet, payloadJSON, t)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to insert active round: %w", err)
	}

	// Record bet in ledger
	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, round_id, type, amount, balance_after, created_at)
		VALUES ($1, $2, $3, 'bet', $4, $5, $6)
	`, uuid.NewString(), userID, roundID, -bet, newBal, t)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to record bet in ledger: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}

	round := &GameRound{
		ID:        roundID,
		UserID:    userID,
		Game:      game,
		State:     "active",
		Bet:       bet,
		Payout:    0,
		Result:    "W toku",
		Payload:   payloadJSON,
		Revision:  1,
		CreatedAt: t,
	}

	return round, newBal, nil
}

func (s *Service) UpdateActiveRoundPayload(ctx context.Context, roundID, userID string, currentRevision int, newPayloadJSON string) error {
	tag, err := s.db.Pool.Exec(ctx, `
		UPDATE game_rounds
		SET payload = $1, revision = revision + 1
		WHERE id = $2 AND user_id = $3 AND revision = $4 AND state = 'active'
	`, newPayloadJSON, roundID, userID, currentRevision)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRevisionConflict
	}
	return nil
}

func (s *Service) DoubleBlackjackBet(ctx context.Context, roundID, userID string, currentRevision int, additionalBet int64, newPayloadJSON string) (int64, error) {
	t := NowMs()
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	// Deduct additional bet
	var newBal int64
	err = tx.QueryRow(ctx, `
		UPDATE players
		SET balance = balance - $1, updated_at = $2
		WHERE user_id = $3 AND balance >= $1
		RETURNING balance
	`, additionalBet, t, userID).Scan(&newBal)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrInsufficientFunds
	}
	if err != nil {
		return 0, err
	}

	// Update round bet & revision
	tag, err := tx.Exec(ctx, `
		UPDATE game_rounds
		SET bet = bet + $1, payload = $2, revision = revision + 1
		WHERE id = $3 AND user_id = $4 AND revision = $5 AND state = 'active'
	`, additionalBet, newPayloadJSON, roundID, userID, currentRevision)
	if err != nil {
		return 0, err
	}
	if tag.RowsAffected() == 0 {
		return 0, ErrRevisionConflict
	}

	// Record in ledger
	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, round_id, type, amount, balance_after, created_at)
		VALUES ($1, $2, $3, 'double', $4, $5, $6)
	`, uuid.NewString(), userID, roundID, -additionalBet, newBal, t)
	if err != nil {
		return 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	return newBal, nil
}

func (s *Service) SettleActiveRound(ctx context.Context, roundID, userID string, payout int64, resultText string, finalPayloadJSON string) (*SettleOutcome, error) {
	t := NowMs()
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Settle round
	tag, err := tx.Exec(ctx, `
		UPDATE game_rounds
		SET state = 'settled', payout = $1, result = $2, payload = $3, settled_at = $4
		WHERE id = $5 AND user_id = $6 AND state = 'active'
	`, payout, resultText, finalPayloadJSON, t, roundID, userID)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrRoundAlreadySettled
	}

	// Atomic update player balance (+payout), xp (+10) and level directly in SQL
	var newBal int64
	var newXP, newLevel int
	err = tx.QueryRow(ctx, `
		UPDATE players
		SET balance = balance + $1,
		    xp = xp + 10,
		    level = 1 + ((xp + 10) / 500),
		    updated_at = $2
		WHERE user_id = $3
		RETURNING balance, xp, level
	`, payout, t, userID).Scan(&newBal, &newXP, &newLevel)
	if err != nil {
		return nil, fmt.Errorf("failed to update player on settlement: %w", err)
	}

	// Insert ledger entry
	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, round_id, type, amount, balance_after, created_at)
		VALUES ($1, $2, $3, 'payout', $4, $5, $6)
	`, uuid.NewString(), userID, roundID, payout, newBal, t)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	// Retrieve updated round
	var round GameRound
	_ = s.db.Pool.QueryRow(ctx, `SELECT id, user_id, game, state, bet, payout, result, payload, revision, created_at, settled_at FROM game_rounds WHERE id = $1`, roundID).Scan(
		&round.ID, &round.UserID, &round.Game, &round.State, &round.Bet, &round.Payout, &round.Result, &round.Payload, &round.Revision, &round.CreatedAt, &round.SettledAt,
	)

	roundsToday, _ := s.GetRoundsToday(ctx, userID)

	return &SettleOutcome{
		Round:       &round,
		Balance:     newBal,
		XP:          newXP,
		Level:       newLevel,
		RoundsToday: roundsToday,
	}, nil
}

func (s *Service) SettleInstantRound(ctx context.Context, userID, game string, bet, payout int64, resultText string, payloadJSON string) (*SettleOutcome, error) {
	if bet <= 0 {
		return nil, ErrInvalidBet
	}

	roundID := uuid.NewString()
	t := NowMs()
	net := payout - bet

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Atomic balance check + net balance adjustment, xp (+10) and level
	var newBal int64
	var newXP, newLevel int
	err = tx.QueryRow(ctx, `
		UPDATE players
		SET balance = balance + $1,
		    xp = xp + 10,
		    level = 1 + ((xp + 10) / 500),
		    updated_at = $2
		WHERE user_id = $3 AND balance >= $4
		RETURNING balance, xp, level
	`, net, t, userID, bet).Scan(&newBal, &newXP, &newLevel)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInsufficientFunds
	}
	if err != nil {
		return nil, fmt.Errorf("failed to settle instant round: %w", err)
	}

	// Insert settled round
	_, err = tx.Exec(ctx, `
		INSERT INTO game_rounds (id, user_id, game, state, bet, payout, result, payload, revision, created_at, settled_at)
		VALUES ($1, $2, $3, 'settled', $4, $5, $6, $7, 1, $8, $8)
	`, roundID, userID, game, bet, payout, resultText, payloadJSON, t)
	if err != nil {
		return nil, fmt.Errorf("failed to insert instant round: %w", err)
	}

	// Record net round in ledger
	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, round_id, type, amount, balance_after, created_at)
		VALUES ($1, $2, $3, 'round', $4, $5, $6)
	`, uuid.NewString(), userID, roundID, net, newBal, t)
	if err != nil {
		return nil, fmt.Errorf("failed to record round in ledger: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	round := &GameRound{
		ID:        roundID,
		UserID:    userID,
		Game:      game,
		State:     "settled",
		Bet:       bet,
		Payout:    payout,
		Result:    resultText,
		Payload:   payloadJSON,
		Revision:  1,
		CreatedAt: t,
		SettledAt: &t,
	}

	roundsToday, _ := s.GetRoundsToday(ctx, userID)

	return &SettleOutcome{
		Round:       round,
		Balance:     newBal,
		XP:          newXP,
		Level:       newLevel,
		RoundsToday: roundsToday,
	}, nil
}

func (s *Service) GrantBalance(ctx context.Context, identifier string, amount int64, reason string) (string, int64, int64, error) {
	if amount == 0 {
		return "", 0, 0, fmt.Errorf("kwota musi być różna od 0")
	}

	var p Player
	err := s.db.Pool.QueryRow(ctx, `
		SELECT user_id, email, nick, balance
		FROM players
		WHERE user_id = $1 OR nick = $1 OR email = $1
	`, identifier).Scan(&p.UserID, &p.Email, &p.Nick, &p.Balance)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", 0, 0, fmt.Errorf("nie znaleziono gracza o identyfikatorze '%s'", identifier)
	}
	if err != nil {
		return "", 0, 0, err
	}

	t := NowMs()
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return "", 0, 0, err
	}
	defer tx.Rollback(ctx)

	var newBal int64
	err = tx.QueryRow(ctx, `
		UPDATE players
		SET balance = balance + $1, updated_at = $2
		WHERE user_id = $3
		RETURNING balance
	`, amount, t, p.UserID).Scan(&newBal)
	if err != nil {
		return "", 0, 0, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
		VALUES ($1, $2, 'grant', $3, $4, $5)
	`, uuid.NewString(), p.UserID, amount, newBal, t)
	if err != nil {
		return "", 0, 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", 0, 0, err
	}

	return p.Nick, p.Balance, newBal, nil
}

type GlobalWin struct {
	ID        string `json:"id"`
	Nick      string `json:"nick"`
	Game      string `json:"game"`
	Bet       int64  `json:"bet"`
	Payout    int64  `json:"payout"`
	Result    string `json:"result"`
	SettledAt int64  `json:"settled_at"`
}

func (s *Service) GetRecentGlobalWins(ctx context.Context, limit int) ([]GlobalWin, error) {
	if limit <= 0 || limit > 50 {
		limit = 15
	}
	rows, err := s.db.Pool.Query(ctx, `
		SELECT gr.id, p.nick, gr.game, gr.bet, gr.payout, gr.result, COALESCE(gr.settled_at, gr.created_at)
		FROM game_rounds gr
		JOIN players p ON gr.user_id = p.user_id
		WHERE gr.state = 'settled' AND gr.payout > 0
		ORDER BY COALESCE(gr.settled_at, gr.created_at) DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var wins []GlobalWin
	for rows.Next() {
		var w GlobalWin
		if err := rows.Scan(&w.ID, &w.Nick, &w.Game, &w.Bet, &w.Payout, &w.Result, &w.SettledAt); err == nil {
			wins = append(wins, w)
		}
	}
	return wins, nil
}

