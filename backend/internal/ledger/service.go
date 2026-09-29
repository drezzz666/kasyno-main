package ledger

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"hash/fnv"
	"log"
	"math"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/db"
	"github.com/drezzz666/kasyno/backend/internal/games/musordrop"
	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func userLockKey(userID string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(userID))
	return int64(h.Sum64())
}

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

type LiveEventInfo struct {
	Name       string    `json:"name"`
	Multiplier float64   `json:"multiplier"`
	StartedAt  time.Time `json:"started_at"`
	EndsAt     time.Time `json:"ends_at"`
	StartedBy  string    `json:"started_by"`
}

type Service struct {
	db          *db.DB
	eventMu     sync.RWMutex
	activeEvent *LiveEventInfo
}

func NewService(database *db.DB) *Service {
	s := &Service{db: database}
	s.restoreActiveEventFromDB()
	return s
}

func (s *Service) restoreActiveEventFromDB() {
	if s.db == nil || s.db.Pool == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	var ev LiveEventInfo
	err := s.db.Pool.QueryRow(ctx, `
		SELECT name, multiplier, started_at, ends_at, started_by
		FROM live_events
		WHERE is_active = true AND ends_at > NOW()
		ORDER BY id DESC LIMIT 1
	`).Scan(&ev.Name, &ev.Multiplier, &ev.StartedAt, &ev.EndsAt, &ev.StartedBy)
	if err == nil {
		s.eventMu.Lock()
		s.activeEvent = &ev
		s.eventMu.Unlock()
		log.Printf("🌧️ [LiveEvent] Przywrócono aktywne wydarzenie: %s (×%.2f) do %v", ev.Name, ev.Multiplier, ev.EndsAt)
	}
}

func (s *Service) SetActiveEvent(ev *LiveEventInfo) {
	s.eventMu.Lock()
	s.activeEvent = ev
	s.eventMu.Unlock()

	if s.db != nil && s.db.Pool != nil && ev != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_, _ = s.db.Pool.Exec(ctx, `UPDATE live_events SET is_active = false WHERE is_active = true`)
			_, _ = s.db.Pool.Exec(ctx, `
				INSERT INTO live_events (name, multiplier, started_at, ends_at, started_by, is_active)
				VALUES ($1, $2, $3, $4, $5, true)
			`, ev.Name, ev.Multiplier, ev.StartedAt, ev.EndsAt, ev.StartedBy)
		}()
	}
}

func (s *Service) GetActiveEvent() *LiveEventInfo {
	s.eventMu.RLock()
	ev := s.activeEvent
	s.eventMu.RUnlock()

	if ev == nil {
		return nil
	}
	if time.Now().After(ev.EndsAt) {
		s.eventMu.Lock()
		if s.activeEvent != nil && time.Now().After(s.activeEvent.EndsAt) {
			s.activeEvent = nil
		}
		s.eventMu.Unlock()
		return nil
	}
	cpy := *ev
	return &cpy
}

func (s *Service) ClearActiveEvent() {
	s.eventMu.Lock()
	s.activeEvent = nil
	s.eventMu.Unlock()

	if s.db != nil && s.db.Pool != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_, _ = s.db.Pool.Exec(ctx, `UPDATE live_events SET is_active = false WHERE is_active = true`)
		}()
	}
}

func NowMs() int64 {
	return time.Now().UnixMilli()
}

func TodayString() string {
	return time.Now().UTC().Format("2006-01-02")
}

func DailyBonusAmount(streak int) int64 {
	bonus := 200 + streak*100
	if bonus > 2000 {
		bonus = 2000
	}
	return int64(bonus)
}

// CalculateXPGain computes the XP gained from a bet: 0 XP for micro-bets (< 10 $FGT),
// and 1-15 XP for qualifying bets based on floor(sqrt(bet)/4).
func CalculateXPGain(bet int64) int {
	if bet < 10 {
		return 0
	}
	return min(15, max(1, int(math.Sqrt(float64(bet))/4)))
}

func (s *Service) GetOrCreatePlayer(ctx context.Context, userID, email, preferredNick, avatar string, defaultBalance int64) (*Player, error) {
	pool := s.db.Pool

	var p Player
	err := pool.QueryRow(ctx, `
		SELECT p.user_id, p.email, p.nick, p.avatar, COALESCE(SUM(l.amount), 0), p.xp, p.level, p.streak, p.last_bonus_day, COALESCE(p.tos_accepted, 0), COALESCE(p.musor_lepsza_boxes, 0), p.created_at, p.updated_at
		FROM players p
		LEFT JOIN ledger_entries l ON p.user_id = l.user_id
		WHERE p.user_id = $1
		GROUP BY p.user_id, p.email, p.nick, p.avatar, p.xp, p.level, p.streak, p.last_bonus_day, p.tos_accepted, p.musor_lepsza_boxes, p.created_at, p.updated_at
	`, userID).Scan(&p.UserID, &p.Email, &p.Nick, &p.Avatar, &p.Balance, &p.XP, &p.Level, &p.Streak, &p.LastBonusDay, &p.TosAccepted, &p.MusorLepszaBoxes, &p.CreatedAt, &p.UpdatedAt)

	if err == nil {
		// Existing player: update avatar if newly provided
		if avatar != "" && (p.Avatar == nil || *p.Avatar != avatar) {
			_, _ = pool.Exec(ctx, `UPDATE players SET avatar = $1, updated_at = $2 WHERE user_id = $3`, avatar, NowMs(), userID)
			p.Avatar = &avatar
		}
		if preferredNick != "" && p.Nick != preferredNick {
			var exists bool
			_ = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM players WHERE nick = $1 AND user_id != $2)`, preferredNick, userID).Scan(&exists)
			if !exists {
				_, _ = pool.Exec(ctx, `UPDATE players SET nick = $1, updated_at = $2 WHERE user_id = $3`, preferredNick, NowMs(), userID)
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

	var avatarPtr *string
	if avatar != "" {
		avatarPtr = &avatar
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO players (user_id, email, nick, avatar, xp, level, streak, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 0, 1, 0, $5, $5)
	`, userID, email, nick, avatarPtr, t)
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
		SELECT p.user_id, p.email, p.nick, p.avatar, COALESCE(SUM(l.amount), 0), p.xp, p.level, p.streak, p.last_bonus_day, COALESCE(p.tos_accepted, 0), COALESCE(p.musor_lepsza_boxes, 0), p.created_at, p.updated_at
		FROM players p
		LEFT JOIN ledger_entries l ON p.user_id = l.user_id
		WHERE p.user_id = $1
		GROUP BY p.user_id, p.email, p.nick, p.avatar, p.xp, p.level, p.streak, p.last_bonus_day, p.tos_accepted, p.musor_lepsza_boxes, p.created_at, p.updated_at
	`, userID).Scan(&p.UserID, &p.Email, &p.Nick, &p.Avatar, &p.Balance, &p.XP, &p.Level, &p.Streak, &p.LastBonusDay, &p.TosAccepted, &p.MusorLepszaBoxes, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Service) AcceptTos(ctx context.Context, userID string) error {
	now := NowMs()
	_, err := s.db.Pool.Exec(ctx, `
		UPDATE players
		SET tos_accepted = $1, updated_at = $1
		WHERE user_id = $2
	`, now, userID)
	return err
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

func (s *Service) GetLastRound(ctx context.Context, userID string) (*GameRound, error) {
	var r GameRound
	err := s.db.Pool.QueryRow(ctx, `
		SELECT id, user_id, game, state, bet, payout, result, payload, revision, created_at, settled_at
		FROM game_rounds
		WHERE user_id = $1
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

func (s *Service) GetRoundByID(ctx context.Context, roundID, userID string) (*GameRound, error) {
	var r GameRound
	err := s.db.Pool.QueryRow(ctx, `
		SELECT id, user_id, game, state, bet, payout, result, payload, revision, created_at, settled_at
		FROM game_rounds
		WHERE id = $1 AND user_id = $2
		LIMIT 1
	`, roundID, userID).Scan(&r.ID, &r.UserID, &r.Game, &r.State, &r.Bet, &r.Payout, &r.Result, &r.Payload, &r.Revision, &r.CreatedAt, &r.SettledAt)
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
			l.description,
			g.game,
			COALESCE(g.result, l.description, ''),
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
			&e.Description,
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
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.Pool.Query(ctx, `
		SELECT p.nick, COALESCE(SUM(l.amount), 0) AS balance, p.level, p.xp, p.avatar
		FROM players p
		LEFT JOIN ledger_entries l ON p.user_id = l.user_id
		GROUP BY p.user_id, p.nick, p.level, p.xp, p.avatar
		ORDER BY balance DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	leaders := make([]LeaderboardEntry, 0)
	for rows.Next() {
		var l LeaderboardEntry
		if err := rows.Scan(&l.Nick, &l.Balance, &l.Level, &l.XP, &l.Avatar); err != nil {
			return nil, err
		}
		leaders = append(leaders, l)
	}
	return leaders, nil
}

func (s *Service) GetLevelLeaderboard(ctx context.Context, limit int) ([]LeaderboardEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.Pool.Query(ctx, `
		SELECT p.nick, COALESCE(SUM(l.amount), 0) AS balance, p.level, p.xp, p.avatar
		FROM players p
		LEFT JOIN ledger_entries l ON p.user_id = l.user_id
		GROUP BY p.user_id, p.nick, p.level, p.xp, p.avatar
		ORDER BY p.level DESC, p.xp DESC, balance DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	leaders := make([]LeaderboardEntry, 0)
	for rows.Next() {
		var l LeaderboardEntry
		if err := rows.Scan(&l.Nick, &l.Balance, &l.Level, &l.XP, &l.Avatar); err != nil {
			return nil, err
		}
		leaders = append(leaders, l)
	}
	return leaders, nil
}

// GetPlayerRank returns 1-based rank of the user based on balance
func (s *Service) GetPlayerRank(ctx context.Context, userID string) (int, error) {
	var rank int
	err := s.db.Pool.QueryRow(ctx, `
		WITH user_balances AS (
			SELECT p.user_id, COALESCE(SUM(l.amount), 0) AS balance
			FROM players p
			LEFT JOIN ledger_entries l ON p.user_id = l.user_id
			GROUP BY p.user_id
		)
		SELECT count(*) + 1 
		FROM user_balances 
		WHERE balance > (SELECT COALESCE(balance, 0) FROM user_balances WHERE user_id = $1)
	`, userID).Scan(&rank)
	if err != nil {
		return 1, err
	}
	return rank, nil
}

// GetPlayerLevelRank returns 1-based rank of the user based on level and XP
func (s *Service) GetPlayerLevelRank(ctx context.Context, userID string) (int, error) {
	var rank int
	err := s.db.Pool.QueryRow(ctx, `
		SELECT count(*) + 1 
		FROM players 
		WHERE (level > (SELECT COALESCE(level, 1) FROM players WHERE user_id = $1))
		   OR (level = (SELECT COALESCE(level, 1) FROM players WHERE user_id = $1) 
		       AND xp > (SELECT COALESCE(xp, 0) FROM players WHERE user_id = $1))
	`, userID).Scan(&rank)
	if err != nil {
		return 1, err
	}
	return rank, nil
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

	// Streak calculation (increment only on consecutive days, otherwise reset to 1)
	streak := 1
	if p.LastBonusDay != nil && *p.LastBonusDay != "" {
		prevDate, err := time.Parse("2006-01-02", *p.LastBonusDay)
		todayDate, _ := time.Parse("2006-01-02", day)
		if err == nil && prevDate.AddDate(0, 0, 1).Equal(todayDate) {
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

	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(userID))

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

	var curBal int64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&curBal)
	newBal := curBal + amount

	_, err = tx.Exec(ctx, `
		UPDATE players
		SET streak = $1, last_bonus_day = $2, updated_at = $3
		WHERE user_id = $4
	`, streak, day, t, userID)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("failed to update player: %w", err)
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

// CreditCaptchaReward awards the mini-game reward (25 $FGT) to the player's balance
func (s *Service) CreditCaptchaReward(ctx context.Context, userID string, amount int64) (int64, error) {
	if amount <= 0 {
		return 0, fmt.Errorf("nieprawidłowa kwota nagrody")
	}
	t := NowMs()

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(userID))

	var curBal int64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&curBal)
	newBal := curBal + amount

	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
		VALUES ($1, $2, 'captcha_reward', $3, $4, $5)
	`, uuid.NewString(), userID, amount, newBal, t)
	if err != nil {
		return 0, fmt.Errorf("failed to record captcha reward: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	return newBal, nil
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
		Description: "Rozegraj 5 dowolnych rund w kasynie (min. 10 ₽)",
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
		Description: "Rozegraj 15 rund w dowolnych grach (min. 10 ₽)",
		Category:    "Ogólne",
		Icon:        "flame",
		Target:      15,
		Reward:      600,
		XPReward:    100,
		StatKey:     "total",
	},
	{
		ID:          "all_30",
		Title:       "Maraton Hazardowy",
		Description: "Rozegraj 30 rund w dowolnych grach (min. 10 ₽)",
		Category:    "Ogólne",
		Icon:        "flame",
		Target:      30,
		Reward:      1200,
		XPReward:    180,
		StatKey:     "total",
	},
	{
		ID:          "all_50",
		Title:       "Władca Stołów",
		Description: "Rozegraj 50 rund w tym 6-godzinnym cyklu (min. 10 ₽)",
		Category:    "Ogólne",
		Icon:        "crown",
		Target:      50,
		Reward:      2500,
		XPReward:    300,
		StatKey:     "total",
	},
	{
		ID:          "wins_3",
		Title:       "Trzy Sukcesy",
		Description: "Wygraj 3 dowolne rundy w kasynie (min. 10 ₽)",
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
		Description: "Wygraj 10 rund w dowolnych grach (min. 10 ₽)",
		Category:    "Zwycięstwa",
		Icon:        "sparkles",
		Target:      10,
		Reward:      800,
		XPReward:    140,
		StatKey:     "total_wins",
	},
	{
		ID:          "wins_25",
		Title:       "Niezłomny Zwycięzca",
		Description: "Wygraj 25 rund w kasynie (min. 10 ₽)",
		Category:    "Zwycięstwa",
		Icon:        "trophy",
		Target:      25,
		Reward:      1800,
		XPReward:    250,
		StatKey:     "total_wins",
	},

	// 💰 Obrót & High Roller
	{
		ID:          "wager_500",
		Title:       "Pierwsze Inwestycje",
		Description: "Postaw łącznie co najmniej 500 ₽",
		Category:    "Obrót",
		Icon:        "coins",
		Target:      500,
		Reward:      200,
		XPReward:    50,
		StatKey:     "wager",
	},
	{
		ID:          "wager_2500",
		Title:       "Płynność Finansowa",
		Description: "Postaw łącznie co najmniej 2,500 ₽",
		Category:    "Obrót",
		Icon:        "coins",
		Target:      2500,
		Reward:      750,
		XPReward:    120,
		StatKey:     "wager",
	},
	{
		ID:          "wager_10000",
		Title:       "Kasynowy Magnat",
		Description: "Postaw łącznie co najmniej 10,000 ₽",
		Category:    "High Roller",
		Icon:        "trophy",
		Target:      10000,
		Reward:      2000,
		XPReward:    250,
		StatKey:     "wager",
	},
	{
		ID:          "wager_50000",
		Title:       "Wielki Wieloryb",
		Description: "Postaw łącznie co najmniej 50,000 ₽",
		Category:    "High Roller",
		Icon:        "crown",
		Target:      50000,
		Reward:      5000,
		XPReward:    500,
		StatKey:     "wager",
	},

	// 🔴 Ruletka
	{
		ID:          "roulette_3",
		Title:       "Mistrz Koła",
		Description: "Zakręć kołem Europejskiej Ruletki 3 razy (min. 10 ₽)",
		Category:    "Ruletka",
		Icon:        "roulette",
		Target:      3,
		Reward:      250,
		XPReward:    50,
		StatKey:     "roulette",
	},
	{
		ID:          "roulette_8",
		Title:       "Król Ruletki",
		Description: "Rozegraj 8 rund w Europejską Ruletkę (min. 10 ₽)",
		Category:    "Ruletka",
		Icon:        "roulette",
		Target:      8,
		Reward:      500,
		XPReward:    100,
		StatKey:     "roulette",
	},
	{
		ID:          "roulette_win_3",
		Title:       "Czysta Intuicja",
		Description: "Traf wygraną w Ruletce 3 razy (min. 10 ₽)",
		Category:    "Ruletka",
		Icon:        "roulette",
		Target:      3,
		Reward:      400,
		XPReward:    80,
		StatKey:     "roulette_wins",
	},

	// 💎 Saper
	{
		ID:          "mines_3",
		Title:       "Poszukiwacz Diamentów",
		Description: "Rozegraj 3 rundy w Sapera (min. 10 ₽)",
		Category:    "Saper",
		Icon:        "pickaxe",
		Target:      3,
		Reward:      250,
		XPReward:    50,
		StatKey:     "mines",
	},
	{
		ID:          "mines_8",
		Title:       "Doświadczony Saper",
		Description: "Rozegraj 8 rund w Sapera (min. 10 ₽)",
		Category:    "Saper",
		Icon:        "pickaxe",
		Target:      8,
		Reward:      500,
		XPReward:    100,
		StatKey:     "mines",
	},
	{
		ID:          "mines_win_3",
		Title:       "Diamentowa Ręka",
		Description: "Wypłać wygraną z Sapera 3 razy (min. 10 ₽)",
		Category:    "Saper",
		Icon:        "pickaxe",
		Target:      3,
		Reward:      400,
		XPReward:    80,
		StatKey:     "mines_wins",
	},

	// 🃏 Blackjack
	{
		ID:          "blackjack_3",
		Title:       "Karciany Strateg",
		Description: "Rozegraj 3 rozdania w Blackjack 21 (min. 10 ₽)",
		Category:    "Blackjack",
		Icon:        "spade",
		Target:      3,
		Reward:      250,
		XPReward:    50,
		StatKey:     "blackjack",
	},
	{
		ID:          "blackjack_8",
		Title:       "Mistrz Oczka",
		Description: "Rozegraj 8 rozdań w Blackjack 21 (min. 10 ₽)",
		Category:    "Blackjack",
		Icon:        "spade",
		Target:      8,
		Reward:      500,
		XPReward:    100,
		StatKey:     "blackjack",
	},
	{
		ID:          "blackjack_win_3",
		Title:       "Pogromca Krupiera",
		Description: "Pokonaj krupiera w Blackjacku 3 razy (min. 10 ₽)",
		Category:    "Blackjack",
		Icon:        "spade",
		Target:      3,
		Reward:      400,
		XPReward:    80,
		StatKey:     "blackjack_wins",
	},

	// 🎰 Sloty
	{
		ID:          "slots_5",
		Title:       "Nocny Szczęściarz",
		Description: "Wykonaj 5 obrotów na automatach (min. 10 ₽)",
		Category:    "Sloty",
		Icon:        "zap",
		Target:      5,
		Reward:      250,
		XPReward:    50,
		StatKey:     "slots",
	},
	{
		ID:          "slots_15",
		Title:       "Gorące Bębny",
		Description: "Wykonaj 15 obrotów na automatach (min. 10 ₽)",
		Category:    "Sloty",
		Icon:        "zap",
		Target:      15,
		Reward:      500,
		XPReward:    100,
		StatKey:     "slots",
	},
	{
		ID:          "slots_win_3",
		Title:       "Trafienie w Linię",
		Description: "Traf wygrywającą kombinację na slotach 3 razy (min. 10 ₽)",
		Category:    "Sloty",
		Icon:        "zap",
		Target:      3,
		Reward:      400,
		XPReward:    80,
		StatKey:     "slots_wins",
	},

	// 🟡 Coin Flip
	{
		ID:          "coinflip_5",
		Title:       "Rzut Przeznaczenia",
		Description: "Rzuć monetą 5 razy w Coin Flip (min. 10 ₽)",
		Category:    "Coin Flip",
		Icon:        "coin",
		Target:      5,
		Reward:      250,
		XPReward:    50,
		StatKey:     "coinflip",
	},
	{
		ID:          "coinflip_12",
		Title:       "Podwójna Strona",
		Description: "Rzuć monetą 12 razy w Coin Flip (min. 10 ₽)",
		Category:    "Coin Flip",
		Icon:        "coin",
		Target:      12,
		Reward:      450,
		XPReward:    90,
		StatKey:     "coinflip",
	},
	{
		ID:          "coinflip_win_4",
		Title:       "Złoty Orzeł",
		Description: "Wygraj rzut monetą 4 razy (min. 10 ₽)",
		Category:    "Coin Flip",
		Icon:        "coin",
		Target:      4,
		Reward:      400,
		XPReward:    80,
		StatKey:     "coinflip_wins",
	},

	// ✂️ Kamień Papier Nożyce
	{
		ID:          "rps_5",
		Title:       "Szybki Pojedynek",
		Description: "Stocz 5 pojedynków w KPN (min. 10 ₽)",
		Category:    "KPN",
		Icon:        "rps",
		Target:      5,
		Reward:      250,
		XPReward:    50,
		StatKey:     "rps",
	},
	{
		ID:          "rps_12",
		Title:       "Mistrz Gestów",
		Description: "Stocz 12 pojedynków w KPN (min. 10 ₽)",
		Category:    "KPN",
		Icon:        "rps",
		Target:      12,
		Reward:      450,
		XPReward:    90,
		StatKey:     "rps",
	},
	{
		ID:          "rps_win_4",
		Title:       "Zwycięska Dłoń",
		Description: "Wygraj pojedynek w KPN 4 razy (min. 10 ₽)",
		Category:    "KPN",
		Icon:        "rps",
		Target:      4,
		Reward:      400,
		XPReward:    80,
		StatKey:     "rps_wins",
	},

	// 🔺 Plinko
	{
		ID:          "plinko_10",
		Title:       "Deszcz Kulek",
		Description: "Upuść 10 kulek w Plinko (min. 10 ₽)",
		Category:    "Plinko",
		Icon:        "plinko",
		Target:      10,
		Reward:      300,
		XPReward:    60,
		StatKey:     "plinko",
	},
	{
		ID:          "plinko_25",
		Title:       "Plinko Kaskada",
		Description: "Upuść 25 kulek w Plinko (min. 10 ₽)",
		Category:    "Plinko",
		Icon:        "plinko",
		Target:      25,
		Reward:      600,
		XPReward:    120,
		StatKey:     "plinko",
	},
	{
		ID:          "plinko_win_5",
		Title:       "Złoty Mnożnik",
		Description: "Traf zyskowny koszyk (>1x) w Plinko 5 razy (min. 10 ₽)",
		Category:    "Plinko",
		Icon:        "plinko",
		Target:      5,
		Reward:      400,
		XPReward:    80,
		StatKey:     "plinko_wins",
	},

	// 🐔 Chicken Cross
	{
		ID:          "chicken_3",
		Title:       "Przeprawa Kurczaka",
		Description: "Rozegraj 3 rundy w Chicken Cross (min. 10 ₽)",
		Category:    "Chicken",
		Icon:        "chicken",
		Target:      3,
		Reward:      250,
		XPReward:    50,
		StatKey:     "chicken",
	},
	{
		ID:          "chicken_win_3",
		Title:       "Mistrz Szosy",
		Description: "Wypłać wygraną w Chicken Cross 3 razy (min. 10 ₽)",
		Category:    "Chicken",
		Icon:        "chicken",
		Target:      3,
		Reward:      400,
		XPReward:    80,
		StatKey:     "chicken_wins",
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
	// Deterministic selection of 4 distinct missions for the given 6-hour periodKey
	h := sha256.Sum256([]byte("missions_seed_" + periodKey))
	seed := int64(binary.BigEndian.Uint64(h[:8]))
	rng := rand.New(rand.NewSource(seed))

	n := len(DailyMissionDefs)
	if n <= 4 {
		return DailyMissionDefs
	}

	indices := rng.Perm(n)
	selected := make([]MissionDef, 0, 4)
	seenCategories := make(map[string]int)

	// First pass: try to pick distinct categories
	for _, idx := range indices {
		def := DailyMissionDefs[idx]
		if seenCategories[def.Category] < 1 && len(selected) < 4 {
			seenCategories[def.Category]++
			selected = append(selected, def)
		}
	}

	// Fill up to 4 if needed
	for _, idx := range indices {
		if len(selected) >= 4 {
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
	var chickenRounds, chickenWins int64

	// Only count qualifying bets (min. 10 $FGT) towards daily missions to prevent 1 $FGT micro-bet exploits
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
			COUNT(*) FILTER (WHERE game = 'plinko' AND payout > bet),
			COUNT(*) FILTER (WHERE game = 'chicken'),
			COUNT(*) FILTER (WHERE game = 'chicken' AND payout > bet)
		FROM game_rounds
		WHERE user_id = $1 AND state = 'settled' AND bet >= 10
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
		&chickenRounds, &chickenWins,
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
		"chicken":        chickenRounds,
		"chicken_wins":   chickenWins,
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

	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(userID))

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

	var curBal int64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&curBal)
	newBal := curBal + reward

	var prevLevel int
	_ = tx.QueryRow(ctx, `SELECT level FROM players WHERE user_id = $1`, userID).Scan(&prevLevel)

	var newXP, newLevel int
	err = tx.QueryRow(ctx, `
		UPDATE players
		SET xp = xp + $1,
		    level = GREATEST(1, 1 + FLOOR(SQRT((xp + $1)::numeric / 200))::int),
		    updated_at = $2
		WHERE user_id = $3
		RETURNING xp, level
	`, xpReward, t, userID).Scan(&newXP, &newLevel)
	if err != nil {
		return 0, 0, 0, 0, 0, err
	}

	if prevLevel > 0 && newLevel > prevLevel {
		_, _ = tx.Exec(ctx, `UPDATE players SET musor_lepsza_boxes = musor_lepsza_boxes + $1 WHERE user_id = $2`, newLevel-prevLevel, userID)
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

	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(userID))

	// Check if active round exists inside transaction
	var existingCount int
	_ = tx.QueryRow(ctx, `SELECT count(*) FROM game_rounds WHERE user_id = $1 AND state = 'active'`, userID).Scan(&existingCount)
	if existingCount > 0 {
		return nil, 0, ErrActiveRoundExists
	}

	// Balance deduction based on ledger
	var curBal int64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&curBal)
	if curBal < bet {
		return nil, 0, ErrInsufficientFunds
	}
	newBal := curBal - bet

	_, _ = tx.Exec(ctx, `UPDATE players SET updated_at = $1 WHERE user_id = $2`, t, userID)

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

	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(userID))

	var curBal int64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&curBal)
	if curBal < additionalBet {
		return 0, ErrInsufficientFunds
	}
	newBal := curBal - additionalBet

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

	_, _ = tx.Exec(ctx, `UPDATE players SET updated_at = $1 WHERE user_id = $2`, t, userID)

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

func (s *Service) DoubleAndSettleBlackjackRound(ctx context.Context, roundID, userID string, currentRevision int, additionalBet int64, payout int64, resultText string, finalPayloadJSON string) (*SettleOutcome, error) {
	t := NowMs()
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(userID))

	var curBal int64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&curBal)
	if curBal < additionalBet {
		return nil, ErrInsufficientFunds
	}
	balAfterDeduct := curBal - additionalBet

	// Record double bet in ledger
	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, round_id, type, amount, balance_after, created_at)
		VALUES ($1, $2, $3, 'double', $4, $5, $6)
	`, uuid.NewString(), userID, roundID, -additionalBet, balAfterDeduct, t)
	if err != nil {
		return nil, err
	}

	// Settle round and update bet amount + revision atomically
	var totalBet int64
	err = tx.QueryRow(ctx, `
		UPDATE game_rounds
		SET bet = bet + $1, revision = revision + 1, state = 'settled', payout = $2, result = $3, payload = $4, settled_at = $5
		WHERE id = $6 AND user_id = $7 AND revision = $8 AND state = 'active'
		RETURNING bet
	`, additionalBet, payout, resultText, finalPayloadJSON, t, roundID, userID, currentRevision).Scan(&totalBet)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRevisionConflict
	}
	if err != nil {
		return nil, err
	}

	var prevLevel int
	_ = tx.QueryRow(ctx, `SELECT level FROM players WHERE user_id = $1`, userID).Scan(&prevLevel)

	// Scaled XP gain based on total bet size: 1-15 XP (0 for micro-bets < 10 $FGT)
	xpGain := CalculateXPGain(totalBet)

	var newXP, newLevel int
	err = tx.QueryRow(ctx, `
		UPDATE players
		SET xp = xp + $1,
		    level = GREATEST(1, 1 + FLOOR(SQRT((xp + $1)::numeric / 200))::int),
		    updated_at = $2
		WHERE user_id = $3
		RETURNING xp, level
	`, xpGain, t, userID).Scan(&newXP, &newLevel)
	if err != nil {
		return nil, fmt.Errorf("failed to update player on double settlement: %w", err)
	}

	newBal := balAfterDeduct
	if payout > 0 {
		newBal += payout
		_, err = tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, round_id, type, amount, balance_after, created_at)
			VALUES ($1, $2, $3, 'payout', $4, $5, $6)
		`, uuid.NewString(), userID, roundID, payout, newBal, t)
		if err != nil {
			return nil, err
		}
	}

	// Check level-up reward (50 $FGT per level)
	var levelUpBonus int64
	leveledUp := false
	if prevLevel > 0 && newLevel > prevLevel {
		leveledUp = true
		levelUpBonus = int64((newLevel - prevLevel) * 50)
		newBal += levelUpBonus
		_, _ = tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
			VALUES ($1, $2, 'level_up_bonus', $3, $4, $5)
		`, uuid.NewString(), userID, levelUpBonus, newBal, t)
		_, _ = tx.Exec(ctx, `UPDATE players SET musor_lepsza_boxes = musor_lepsza_boxes + $1 WHERE user_id = $2`, newLevel-prevLevel, userID)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	var round GameRound
	_ = s.db.Pool.QueryRow(ctx, `SELECT id, user_id, game, state, bet, payout, result, payload, revision, created_at, settled_at FROM game_rounds WHERE id = $1`, roundID).Scan(
		&round.ID, &round.UserID, &round.Game, &round.State, &round.Bet, &round.Payout, &round.Result, &round.Payload, &round.Revision, &round.CreatedAt, &round.SettledAt,
	)

	roundsToday, _ := s.GetRoundsToday(ctx, userID)

	return &SettleOutcome{
		Round:        &round,
		Balance:      newBal,
		XP:           newXP,
		Level:        newLevel,
		RoundsToday:  roundsToday,
		LeveledUp:    leveledUp,
		LevelUpBonus: levelUpBonus,
	}, nil
}

func (s *Service) SettleActiveRound(ctx context.Context, roundID, userID string, payout int64, resultText string, finalPayloadJSON string) (*SettleOutcome, error) {
	t := NowMs()
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(userID))

	var prevLevel int
	_ = tx.QueryRow(ctx, `SELECT level FROM players WHERE user_id = $1`, userID).Scan(&prevLevel)

	// Fetch active round bet amount
	var betAmount int64
	err = tx.QueryRow(ctx, `SELECT bet FROM game_rounds WHERE id = $1 AND user_id = $2 AND state = 'active'`, roundID, userID).Scan(&betAmount)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRoundAlreadySettled
	}
	if err != nil {
		return nil, err
	}

	// Apply event multiplier to net profit on winning rounds
	if ev := s.GetActiveEvent(); ev != nil && ev.Multiplier > 1.0 && payout > betAmount {
		netProfit := payout - betAmount
		eventBonus := int64(math.Floor(float64(netProfit) * (ev.Multiplier - 1.0)))
		payout = payout + eventBonus
	}

	// Settle round in database
	_, err = tx.Exec(ctx, `
		UPDATE game_rounds
		SET state = 'settled', payout = $1, result = $2, payload = $3, settled_at = $4
		WHERE id = $5 AND user_id = $6 AND state = 'active'
	`, payout, resultText, finalPayloadJSON, t, roundID, userID)
	if err != nil {
		return nil, err
	}

	// Scaled XP gain based on bet size: 1-15 XP (0 for micro-bets < 10 $FGT)
	xpGain := CalculateXPGain(betAmount)

	var newXP, newLevel int
	err = tx.QueryRow(ctx, `
		UPDATE players
		SET xp = xp + $1,
		    level = GREATEST(1, 1 + FLOOR(SQRT((xp + $1)::numeric / 200))::int),
		    updated_at = $2
		WHERE user_id = $3
		RETURNING xp, level
	`, xpGain, t, userID).Scan(&newXP, &newLevel)
	if err != nil {
		return nil, fmt.Errorf("failed to update player on settlement: %w", err)
	}

	var curBal int64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&curBal)
	newBal := curBal

	if payout > 0 {
		newBal += payout
		// Insert payout ledger entry
		_, err = tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, round_id, type, amount, balance_after, created_at)
			VALUES ($1, $2, $3, 'payout', $4, $5, $6)
		`, uuid.NewString(), userID, roundID, payout, newBal, t)
		if err != nil {
			return nil, err
		}
	}

	// Check level-up reward (50 $FGT per level)
	var levelUpBonus int64
	leveledUp := false
	if prevLevel > 0 && newLevel > prevLevel {
		leveledUp = true
		levelUpBonus = int64((newLevel - prevLevel) * 50)
		newBal += levelUpBonus
		_, _ = tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
			VALUES ($1, $2, 'level_up_bonus', $3, $4, $5)
		`, uuid.NewString(), userID, levelUpBonus, newBal, t)
		_, _ = tx.Exec(ctx, `UPDATE players SET musor_lepsza_boxes = musor_lepsza_boxes + $1 WHERE user_id = $2`, newLevel-prevLevel, userID)
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
		Round:        &round,
		Balance:      newBal,
		XP:           newXP,
		Level:        newLevel,
		RoundsToday:  roundsToday,
		LevelUpBonus: levelUpBonus,
		LeveledUp:    leveledUp,
	}, nil
}

func (s *Service) SettleInstantRound(ctx context.Context, userID, game string, bet, payout int64, resultText string, payloadJSON string) (*SettleOutcome, error) {
	if bet <= 0 {
		return nil, ErrInvalidBet
	}

	// Apply event multiplier to net profit on winning rounds
	if ev := s.GetActiveEvent(); ev != nil && ev.Multiplier > 1.0 && payout > bet {
		netProfit := payout - bet
		eventBonus := int64(math.Floor(float64(netProfit) * (ev.Multiplier - 1.0)))
		payout = payout + eventBonus
	}

	roundID := uuid.NewString()
	t := NowMs()
	net := payout - bet

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(userID))

	// Check if active turn-based round exists
	var activeCount int
	_ = tx.QueryRow(ctx, `SELECT count(*) FROM game_rounds WHERE user_id = $1 AND state = 'active'`, userID).Scan(&activeCount)
	if activeCount > 0 {
		return nil, ErrActiveRoundExists
	}

	var curBal int64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&curBal)
	if curBal < bet {
		return nil, ErrInsufficientFunds
	}
	newBal := curBal + net

	var prevLevel int
	_ = tx.QueryRow(ctx, `SELECT level FROM players WHERE user_id = $1`, userID).Scan(&prevLevel)

	// Scaled XP gain based on bet size: 1-15 XP (0 for micro-bets < 10 $FGT)
	xpGain := CalculateXPGain(bet)

	var newXP, newLevel int
	err = tx.QueryRow(ctx, `
		UPDATE players
		SET xp = xp + $1,
		    level = GREATEST(1, 1 + FLOOR(SQRT((xp + $1)::numeric / 200))::int),
		    updated_at = $2
		WHERE user_id = $3
		RETURNING xp, level
	`, xpGain, t, userID).Scan(&newXP, &newLevel)
	if err != nil {
		return nil, fmt.Errorf("failed to update player on instant settlement: %w", err)
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

	// Check level-up reward (50 $FGT per level)
	var levelUpBonus int64
	leveledUp := false
	if prevLevel > 0 && newLevel > prevLevel {
		leveledUp = true
		levelUpBonus = int64((newLevel - prevLevel) * 50)
		newBal += levelUpBonus
		_, _ = tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
			VALUES ($1, $2, 'level_up_bonus', $3, $4, $5)
		`, uuid.NewString(), userID, levelUpBonus, newBal, t)
		_, _ = tx.Exec(ctx, `UPDATE players SET musor_lepsza_boxes = musor_lepsza_boxes + $1 WHERE user_id = $2`, newLevel-prevLevel, userID)
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
		Round:        round,
		Balance:      newBal,
		XP:           newXP,
		Level:        newLevel,
		RoundsToday:  roundsToday,
		LevelUpBonus: levelUpBonus,
		LeveledUp:    leveledUp,
	}, nil
}


func (s *Service) GrantBalance(ctx context.Context, identifier string, amount int64, reason string) (string, int64, int64, error) {
	return s.GrantBalanceWithType(ctx, identifier, amount, "grant", reason)
}

func (s *Service) GrantBalanceWithType(ctx context.Context, identifier string, amount int64, entryType, reason string) (string, int64, int64, error) {
	if amount == 0 {
		return "", 0, 0, fmt.Errorf("kwota musi być różna od 0")
	}
	if entryType == "" {
		entryType = "grant"
	}

	trimmed := strings.TrimSpace(identifier)
	if trimmed == "*" || strings.EqualFold(trimmed, "all") || strings.EqualFold(trimmed, "wszyscy") || strings.EqualFold(trimmed, "@everyone") {
		allType := entryType
		if allType == "grant" {
			allType = "grant_all"
		}
		count, totalTransferred, err := s.GrantBalanceAllWithType(ctx, amount, allType, reason)
		if err != nil {
			return "", 0, 0, err
		}
		return fmt.Sprintf("Wszyscy gracze (%d kont, łączny transfer: %+d)", count, totalTransferred), 0, amount, nil
	}

	var p Player
	err := s.db.Pool.QueryRow(ctx, `
		SELECT p.user_id, p.email, p.nick, COALESCE(SUM(l.amount), 0)
		FROM players p
		LEFT JOIN ledger_entries l ON p.user_id = l.user_id
		WHERE p.user_id = $1 OR p.nick = $1 OR p.email = $1
		GROUP BY p.user_id, p.email, p.nick
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

	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(p.UserID))

	var curBal int64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, p.UserID).Scan(&curBal)
	if curBal+amount < 0 {
		return "", 0, 0, fmt.Errorf("operacja spowodowałaby ujemne saldo (obecne saldo: %d, zmiana: %d)", curBal, amount)
	}
	newBal := curBal + amount

	_, _ = tx.Exec(ctx, `UPDATE players SET updated_at = $1 WHERE user_id = $2`, t, p.UserID)

	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at, description)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, uuid.NewString(), p.UserID, entryType, amount, newBal, t, reason)
	if err != nil {
		return "", 0, 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", 0, 0, err
	}

	return p.Nick, curBal, newBal, nil
}

type GlobalWin struct {
	ID        string  `json:"id"`
	Nick      string  `json:"nick"`
	Avatar    *string `json:"avatar,omitempty"`
	Game      string  `json:"game"`
	Bet       int64   `json:"bet"`
	Payout    int64   `json:"payout"`
	Result    string  `json:"result"`
	SettledAt int64   `json:"settled_at"`
}

func (s *Service) GetRecentGlobalWins(ctx context.Context, limit int) ([]GlobalWin, error) {
	if limit <= 0 || limit > 50 {
		limit = 15
	}
	rows, err := s.db.Pool.Query(ctx, `
		SELECT gr.id, p.nick, p.avatar, gr.game, gr.bet, gr.payout, gr.result, COALESCE(gr.settled_at, gr.created_at)
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

	wins := make([]GlobalWin, 0)
	for rows.Next() {
		var w GlobalWin
		if err := rows.Scan(&w.ID, &w.Nick, &w.Avatar, &w.Game, &w.Bet, &w.Payout, &w.Result, &w.SettledAt); err == nil {
			wins = append(wins, w)
		}
	}
	return wins, nil
}

// GetActiveProvablyFairSeed retrieves current active seed for user or creates one if none exists
func (s *Service) GetActiveProvablyFairSeed(ctx context.Context, userID string) (*ProvablyFairSeedRecord, error) {
	var rec ProvablyFairSeedRecord
	err := s.db.Pool.QueryRow(ctx, `
		SELECT id, user_id, server_seed, server_hash, client_seed, nonce, created_at, revealed_at
		FROM provably_fair_seeds
		WHERE user_id = $1 AND revealed_at IS NULL
		ORDER BY created_at DESC LIMIT 1
	`, userID).Scan(&rec.ID, &rec.UserID, &rec.ServerSeed, &rec.ServerHash, &rec.ClientSeed, &rec.Nonce, &rec.CreatedAt, &rec.RevealedAt)

	if err == nil {
		return &rec, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	// Generate new initial seed pair
	serverSeed, err := provablyfair.GenerateServerSeed()
	if err != nil {
		return nil, fmt.Errorf("failed to generate server seed: %w", err)
	}
	serverHash := provablyfair.HashServerSeed(serverSeed)
	clientSeed, err := provablyfair.GenerateClientSeed()
	if err != nil {
		return nil, fmt.Errorf("failed to generate client seed: %w", err)
	}

	t := NowMs()
	id := uuid.NewString()

	_, err = s.db.Pool.Exec(ctx, `
		INSERT INTO provably_fair_seeds (id, user_id, server_seed, server_hash, client_seed, nonce, created_at)
		VALUES ($1, $2, $3, $4, $5, 0, $6)
	`, id, userID, serverSeed, serverHash, clientSeed, t)
	if err != nil {
		return nil, fmt.Errorf("failed to save provably fair seed: %w", err)
	}

	return &ProvablyFairSeedRecord{
		ID:         id,
		UserID:     userID,
		ServerSeed: serverSeed,
		ServerHash: serverHash,
		ClientSeed: clientSeed,
		Nonce:      0,
		CreatedAt:  t,
	}, nil
}

// RotateProvablyFairSeed reveals the current active server seed and generates a new active seed
func (s *Service) RotateProvablyFairSeed(ctx context.Context, userID, newClientSeed string) (revealed *ProvablyFairSeedRecord, newActive *ProvablyFairSeedRecord, err error) {
	t := NowMs()
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(userID))

	// Fetch and reveal current active seed
	var current ProvablyFairSeedRecord
	err = tx.QueryRow(ctx, `
		SELECT id, user_id, server_seed, server_hash, client_seed, nonce, created_at
		FROM provably_fair_seeds
		WHERE user_id = $1 AND revealed_at IS NULL
		ORDER BY created_at DESC LIMIT 1
	`, userID).Scan(&current.ID, &current.UserID, &current.ServerSeed, &current.ServerHash, &current.ClientSeed, &current.Nonce, &current.CreatedAt)

	if err == nil {
		_, _ = tx.Exec(ctx, `UPDATE provably_fair_seeds SET revealed_at = $1 WHERE id = $2`, t, current.ID)
		current.RevealedAt = &t
		revealed = &current
	}

	// Create new active seed
	serverSeed, err := provablyfair.GenerateServerSeed()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate server seed: %w", err)
	}
	serverHash := provablyfair.HashServerSeed(serverSeed)

	clientSeed := strings.TrimSpace(newClientSeed)
	if clientSeed == "" || len(clientSeed) > 64 {
		clientSeed, _ = provablyfair.GenerateClientSeed()
	}

	newID := uuid.NewString()
	_, err = tx.Exec(ctx, `
		INSERT INTO provably_fair_seeds (id, user_id, server_seed, server_hash, client_seed, nonce, created_at)
		VALUES ($1, $2, $3, $4, $5, 0, $6)
	`, newID, userID, serverSeed, serverHash, clientSeed, t)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to insert new seed: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}

	newActive = &ProvablyFairSeedRecord{
		ID:         newID,
		UserID:     userID,
		ServerSeed: serverSeed,
		ServerHash: serverHash,
		ClientSeed: clientSeed,
		Nonce:      0,
		CreatedAt:  t,
	}

	return revealed, newActive, nil
}

// GetAndIncrementNonce atomically fetches the active Provably Fair seed for user and increments the nonce
func (s *Service) GetAndIncrementNonce(ctx context.Context, userID string) (serverSeed, clientSeed string, nonce int64, serverHash string, err error) {
	t := NowMs()
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return "", "", 0, "", err
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(userID))

	var rec ProvablyFairSeedRecord
	err = tx.QueryRow(ctx, `
		SELECT id, user_id, server_seed, server_hash, client_seed, nonce, created_at
		FROM provably_fair_seeds
		WHERE user_id = $1 AND revealed_at IS NULL
		ORDER BY created_at DESC LIMIT 1
	`, userID).Scan(&rec.ID, &rec.UserID, &rec.ServerSeed, &rec.ServerHash, &rec.ClientSeed, &rec.Nonce, &rec.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		serverSeed, err := provablyfair.GenerateServerSeed()
		if err != nil {
			return "", "", 0, "", err
		}
		serverHash := provablyfair.HashServerSeed(serverSeed)
		clientSeed, err := provablyfair.GenerateClientSeed()
		if err != nil {
			return "", "", 0, "", err
		}
		newID := uuid.NewString()
		_, err = tx.Exec(ctx, `
			INSERT INTO provably_fair_seeds (id, user_id, server_seed, server_hash, client_seed, nonce, created_at)
			VALUES ($1, $2, $3, $4, $5, 1, $6)
		`, newID, userID, serverSeed, serverHash, clientSeed, t)
		if err != nil {
			return "", "", 0, "", err
		}
		if err := tx.Commit(ctx); err != nil {
			return "", "", 0, "", err
		}
		return serverSeed, clientSeed, 0, serverHash, nil
	} else if err != nil {
		return "", "", 0, "", err
	}

	nonceToUse := rec.Nonce
	_, err = tx.Exec(ctx, `UPDATE provably_fair_seeds SET nonce = nonce + 1 WHERE id = $1`, rec.ID)
	if err != nil {
		return "", "", 0, "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", "", 0, "", err
	}

	return rec.ServerSeed, rec.ClientSeed, nonceToUse, rec.ServerHash, nil
}

// GetPlayerStats returns player lifetime statistics (biggest win, max multiplier, favorite game, total wagered)
func (s *Service) GetPlayerStats(ctx context.Context, userID string) (*PlayerStats, error) {
	var totalRounds int64
	var totalWagered int64
	var biggestWin int64

	_ = s.db.Pool.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(SUM(bet), 0), COALESCE(MAX(payout), 0)
		FROM game_rounds
		WHERE user_id = $1 AND state = 'settled'
	`, userID).Scan(&totalRounds, &totalWagered, &biggestWin)

	var favoriteGame string
	_ = s.db.Pool.QueryRow(ctx, `
		SELECT game
		FROM game_rounds
		WHERE user_id = $1 AND state = 'settled'
		GROUP BY game
		ORDER BY COUNT(*) DESC
		LIMIT 1
	`, userID).Scan(&favoriteGame)

	if favoriteGame == "" {
		favoriteGame = "Brak gier"
	}

	var maxMult float64
	_ = s.db.Pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(payout::float / NULLIF(bet, 0)), 0)
		FROM game_rounds
		WHERE user_id = $1 AND state = 'settled' AND payout > 0
	`, userID).Scan(&maxMult)

	return &PlayerStats{
		BiggestWin:    biggestWin,
		MaxMultiplier: float64(int(maxMult*100)) / 100.0,
		FavoriteGame:  favoriteGame,
		TotalRounds:   totalRounds,
		TotalWagered:  totalWagered,
	}, nil
}

func (s *Service) LogFraud(ctx context.Context, userID, nick string, prevBalance int64, reason, details string) error {
	id := uuid.New().String()
	now := NowMs()
	_, err := s.db.Pool.Exec(ctx, `
		INSERT INTO fraud_logs (id, user_id, nick, previous_balance, reason, details, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, id, userID, nick, prevBalance, reason, details, now)
	return err
}

func (s *Service) RecordLogin(ctx context.Context, userID, nick, ip, userAgent string) (*LoginLog, error) {
	id := uuid.New().String()
	now := NowMs()
	_, err := s.db.Pool.Exec(ctx, `
		INSERT INTO login_logs (id, user_id, nick, ip, user_agent, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, id, userID, nick, ip, userAgent, now)
	if err != nil {
		return nil, err
	}
	return &LoginLog{
		ID:        id,
		UserID:    userID,
		Nick:      nick,
		IP:        ip,
		UserAgent: userAgent,
		CreatedAt: now,
	}, nil
}

func (s *Service) GetPlayerLoginSummary(ctx context.Context, userID string) (*PlayerLoginSummary, error) {
	summary := &PlayerLoginSummary{}
	
	// Total logins
	_ = s.db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM login_logs WHERE user_id = $1`, userID).Scan(&summary.TotalLogins)
	
	// First login
	_ = s.db.Pool.QueryRow(ctx, `
		SELECT created_at, ip FROM login_logs
		WHERE user_id = $1
		ORDER BY created_at ASC
		LIMIT 1
	`, userID).Scan(&summary.FirstLoginAt, &summary.FirstIP)
	
	// Last login
	_ = s.db.Pool.QueryRow(ctx, `
		SELECT created_at, ip FROM login_logs
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, userID).Scan(&summary.LastLoginAt, &summary.LastIP)
	
	return summary, nil
}

func (s *Service) ListRecentLogins(ctx context.Context, userID string, limit int) ([]LoginLog, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	rows, err := s.db.Pool.Query(ctx, `
		SELECT id, user_id, nick, ip, COALESCE(user_agent, ''), created_at
		FROM login_logs
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []LoginLog
	for rows.Next() {
		var l LoginLog
		if err := rows.Scan(&l.ID, &l.UserID, &l.Nick, &l.IP, &l.UserAgent, &l.CreatedAt); err == nil {
			list = append(list, l)
		}
	}
	return list, nil
}

// RecoverInterruptedRoundsOnStartup refunds any interrupted in-flight games (like Crash rounds)
// that were left active across server restarts, ensuring 0 funds are ever lost.
func (s *Service) RecoverInterruptedRoundsOnStartup(ctx context.Context) (int, error) {
	t := NowMs()
	// Find active crash rounds (cannot continue flying after restart) or rounds older than 10 mins
	rows, err := s.db.Pool.Query(ctx, `
		SELECT id, user_id, game, bet
		FROM game_rounds
		WHERE state = 'active' AND (game = 'crash' OR created_at < $1)
	`, t-10*60*1000)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type staleRound struct {
		id     string
		userID string
		game   string
		bet    int64
	}
	var stale []staleRound
	for rows.Next() {
		var r staleRound
		if err := rows.Scan(&r.id, &r.userID, &r.game, &r.bet); err == nil {
			stale = append(stale, r)
		}
	}
	rows.Close()

	refundCount := 0
	for _, r := range stale {
		tx, err := s.db.Pool.Begin(ctx)
		if err != nil {
			continue
		}
		_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(r.userID))

		res, err := tx.Exec(ctx, `
			UPDATE game_rounds
			SET state = 'settled', payout = $1, result = 'Zwrot stawki po restarcie serwera', settled_at = $2
			WHERE id = $3 AND state = 'active'
		`, r.bet, t, r.id)
		if err != nil || res.RowsAffected() == 0 {
			_ = tx.Rollback(ctx)
			continue
		}

		var curBal int64
		_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, r.userID).Scan(&curBal)
		newBal := curBal + r.bet

		_, err = tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, round_id, type, amount, balance_after, created_at)
			VALUES ($1, $2, $3, 'payout', $4, $5, $6)
		`, uuid.NewString(), r.userID, r.id, r.bet, newBal, t)
		if err != nil {
			_ = tx.Rollback(ctx)
			continue
		}

		if err := tx.Commit(ctx); err == nil {
			refundCount++
			log.Printf("[Startup Recovery] Refunded %d groszy to user %s for interrupted round %s (%s)", r.bet, r.userID, r.id, r.game)
		}
	}

	return refundCount, nil
}

// RefundActiveRound refunds any currently active round for the given user, returning the full bet amount to balance.
func (s *Service) RefundActiveRound(ctx context.Context, userID string, reason string) (*SettleOutcome, error) {
	if reason == "" {
		reason = "Zwrot stawki (utrata połączenia)"
	}
	t := NowMs()

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(userID))

	var round GameRound
	err = tx.QueryRow(ctx, `
		SELECT id, user_id, game, state, bet, payout, result, payload, revision, created_at, settled_at
		FROM game_rounds
		WHERE user_id = $1 AND state = 'active'
	`, userID).Scan(
		&round.ID, &round.UserID, &round.Game, &round.State, &round.Bet, &round.Payout, &round.Result, &round.Payload, &round.Revision, &round.CreatedAt, &round.SettledAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil // No active round to refund
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query active round: %w", err)
	}

	// Update game_round to settled with 100% bet refund payout
	res, err := tx.Exec(ctx, `
		UPDATE game_rounds
		SET state = 'settled', payout = $1, result = $2, settled_at = $3
		WHERE id = $4 AND user_id = $5 AND state = 'active'
	`, round.Bet, reason, t, round.ID, userID)
	if err != nil || res.RowsAffected() == 0 {
		return nil, fmt.Errorf("failed to settle active round for refund: %w", err)
	}

	var curBal int64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&curBal)
	newBal := curBal + round.Bet

	// Record refund payout in ledger
	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, round_id, type, amount, balance_after, created_at)
		VALUES ($1, $2, $3, 'payout', $4, $5, $6)
	`, uuid.NewString(), userID, round.ID, round.Bet, newBal, t)
	if err != nil {
		return nil, fmt.Errorf("failed to record refund in ledger: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	round.State = "settled"
	round.Payout = round.Bet
	round.Result = reason
	round.SettledAt = &t

	return &SettleOutcome{
		Round:   &round,
		Balance: newBal,
	}, nil
}

// GetMusorDropState retrieves current daily usage counts and inventory for Musor Drop
func (s *Service) GetMusorDropState(ctx context.Context, userID string) (*MusorDropState, error) {
	dayKey := TodayString()
	var plebsUsed, arystokracjaUsed int

	rows, err := s.db.Pool.Query(ctx, `
		SELECT box_type, count FROM musor_drop_daily
		WHERE user_id = $1 AND day_key = $2
	`, userID, dayKey)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var bType string
			var cnt int
			if err := rows.Scan(&bType, &cnt); err == nil {
				if bType == string(musordrop.BoxPlebs) {
					plebsUsed = cnt
				} else if bType == string(musordrop.BoxArystokracja) {
					arystokracjaUsed = cnt
				}
			}
		}
	}

	var lepszaBoxes int
	_ = s.db.Pool.QueryRow(ctx, `SELECT COALESCE(musor_lepsza_boxes, 0) FROM players WHERE user_id = $1`, userID).Scan(&lepszaBoxes)

	return &MusorDropState{
		PlebsUsed:         plebsUsed,
		PlebsLimit:        5,
		ArystokracjaUsed:  arystokracjaUsed,
		ArystokracjaLimit: 5,
		ArystokracjaCost:  500,
		LepszaBoxes:       lepszaBoxes,
	}, nil
}

// OpenMusorBox atomically executes box opening with anti-race locks and ledger recording
func (s *Service) OpenMusorBox(ctx context.Context, userID string, bType musordrop.BoxType) (*MusorDropOutcome, error) {
	t := NowMs()
	dayKey := TodayString()

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Advisory transaction lock to prevent race conditions
	_, _ = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", userLockKey(userID))

	// Get player current balance and lepsza boxes
	var curBal int64
	var lepszaBoxes int
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(l.amount), 0), COALESCE(p.musor_lepsza_boxes, 0)
		FROM players p
		LEFT JOIN ledger_entries l ON p.user_id = l.user_id
		WHERE p.user_id = $1
		GROUP BY p.user_id, p.musor_lepsza_boxes
	`, userID).Scan(&curBal, &lepszaBoxes)
	if err != nil {
		return nil, fmt.Errorf("błąd odczytu danych gracza: %w", err)
	}

	var plebsCount, arystokracjaCount int
	_ = tx.QueryRow(ctx, `SELECT COALESCE(count, 0) FROM musor_drop_daily WHERE user_id = $1 AND day_key = $2 AND box_type = $3`,
		userID, dayKey, string(musordrop.BoxPlebs)).Scan(&plebsCount)
	_ = tx.QueryRow(ctx, `SELECT COALESCE(count, 0) FROM musor_drop_daily WHERE user_id = $1 AND day_key = $2 AND box_type = $3`,
		userID, dayKey, string(musordrop.BoxArystokracja)).Scan(&arystokracjaCount)

	switch bType {
	case musordrop.BoxPlebs:
		if plebsCount >= 5 {
			return nil, fmt.Errorf("Osiągnięto dzienny limit (5/5) darmowych skrzynek Plebsowych")
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO musor_drop_daily (user_id, day_key, box_type, count)
			VALUES ($1, $2, $3, 1)
			ON CONFLICT (user_id, day_key, box_type)
			DO UPDATE SET count = musor_drop_daily.count + 1
		`, userID, dayKey, string(musordrop.BoxPlebs))
		if err != nil {
			return nil, fmt.Errorf("błąd aktualizacji limitu dziennego: %w", err)
		}
		plebsCount++

	case musordrop.BoxArystokracja:
		if arystokracjaCount >= 5 {
			return nil, fmt.Errorf("Osiągnięto dzienny limit (5/5) zakupu skrzynek Arystokrackich")
		}
		const cost = int64(500)
		if curBal < cost {
			return nil, ErrInsufficientFunds
		}
		curBal -= cost
		_, err = tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at, description)
			VALUES ($1, $2, 'musor_drop_buy', $3, $4, $5, 'Zakup skrzynki Arystokrackiej')
		`, uuid.NewString(), userID, -cost, curBal, t)
		if err != nil {
			return nil, fmt.Errorf("błąd zapisu opłaty za skrzynkę: %w", err)
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO musor_drop_daily (user_id, day_key, box_type, count)
			VALUES ($1, $2, $3, 1)
			ON CONFLICT (user_id, day_key, box_type)
			DO UPDATE SET count = musor_drop_daily.count + 1
		`, userID, dayKey, string(musordrop.BoxArystokracja))
		if err != nil {
			return nil, fmt.Errorf("błąd aktualizacji limitu dziennego: %w", err)
		}
		arystokracjaCount++

	case musordrop.BoxLepsza:
		if lepszaBoxes < 1 {
			return nil, fmt.Errorf("Brak skrzynek Lepszych. Zdobywaj kolejne poziomy konta, aby je otrzymać.")
		}
		lepszaBoxes--
		_, err = tx.Exec(ctx, `
			UPDATE players
			SET musor_lepsza_boxes = musor_lepsza_boxes - 1, updated_at = $1
			WHERE user_id = $2
		`, t, userID)
		if err != nil {
			return nil, fmt.Errorf("błąd pobrania skrzynki z ekwipunku: %w", err)
		}

	default:
		return nil, fmt.Errorf("Nieprawidłowy typ skrzynki: %s", bType)
	}

	// Roll prize
	dropRes, err := musordrop.RollBox(bType)
	if err != nil {
		return nil, err
	}

	if dropRes.Prize > 0 {
		curBal += dropRes.Prize
		desc := fmt.Sprintf("Wygrana ze skrzynki (%s): %s", bType, dropRes.PrizeName)
		_, err = tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at, description)
			VALUES ($1, $2, 'musor_drop_win', $3, $4, $5, $6)
		`, uuid.NewString(), userID, dropRes.Prize, curBal, t, desc)
		if err != nil {
			return nil, fmt.Errorf("błąd zapisu wygranej ze skrzynki: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("błąd zatwierdzania transakcji dropu: %w", err)
	}

	state := MusorDropState{
		PlebsUsed:         plebsCount,
		PlebsLimit:        5,
		ArystokracjaUsed:  arystokracjaCount,
		ArystokracjaLimit: 5,
		ArystokracjaCost:  500,
		LepszaBoxes:       lepszaBoxes,
	}

	return &MusorDropOutcome{
		BoxType:   string(bType),
		Prize:     dropRes.Prize,
		PrizeName: dropRes.PrizeName,
		IsJackpot: dropRes.IsJackpot,
		Balance:   curBal,
		State:     state,
	}, nil
}





