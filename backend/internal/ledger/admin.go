package ledger

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// AdminCreateUser creates a new player with an optional custom ID, nick, email and initial balance.
func (s *Service) AdminCreateUser(ctx context.Context, userID, nick, email string, initialBalance int64) (*Player, error) {
	if nick == "" {
		return nil, fmt.Errorf("nick gracza nie może być pusty")
	}
	if userID == "" {
		userID = "user_" + strings.ToLower(strings.ReplaceAll(nick, " ", "_")) + "_" + uuid.NewString()[:8]
	}
	if email == "" {
		email = strings.ToLower(nick) + "@casino.local"
	}
	if initialBalance < 0 {
		initialBalance = 0
	}

	pool := s.db.Pool
	t := NowMs()

	// Check for duplicates
	var exists bool
	_ = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM players WHERE user_id = $1 OR nick = $2)`, userID, nick).Scan(&exists)
	if exists {
		return nil, fmt.Errorf("gracz o user_id '%s' lub nicku '%s' już istnieje", userID, nick)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	p := &Player{
		UserID:    userID,
		Email:     email,
		Nick:      nick,
		Balance:   initialBalance,
		XP:        0,
		Level:     1,
		Streak:    0,
		CreatedAt: t,
		UpdatedAt: t,
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO players (user_id, email, nick, avatar, balance, xp, level, streak, created_at, updated_at)
		VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9)
	`, p.UserID, p.Email, p.Nick, p.Balance, p.XP, p.Level, p.Streak, p.CreatedAt, p.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("błąd podczas tworzenia gracza: %w", err)
	}

	// Ledger entry for initial balance
	if initialBalance > 0 {
		_, err = tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
			VALUES ($1, $2, 'admin_create', $3, $4, $5)
		`, uuid.NewString(), p.UserID, initialBalance, initialBalance, t)
		if err != nil {
			return nil, fmt.Errorf("błąd podczas zapisu w ledgerze: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	// Initialize provably fair seed pair
	_, _ = s.GetActiveProvablyFairSeed(ctx, p.UserID)

	return p, nil
}

// AdminGetUser fetches a player by user_id, nick or email, along with their stats.
func (s *Service) AdminGetUser(ctx context.Context, identifier string) (*Player, *PlayerStats, *GameRound, error) {
	var p Player
	err := s.db.Pool.QueryRow(ctx, `
		SELECT user_id, email, nick, avatar, balance, xp, level, streak, last_bonus_day, created_at, updated_at
		FROM players
		WHERE user_id = $1 OR nick = $1 OR email = $1
	`, identifier).Scan(&p.UserID, &p.Email, &p.Nick, &p.Avatar, &p.Balance, &p.XP, &p.Level, &p.Streak, &p.LastBonusDay, &p.CreatedAt, &p.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, nil, fmt.Errorf("nie znaleziono gracza o identyfikatorze '%s'", identifier)
	}
	if err != nil {
		return nil, nil, nil, err
	}

	stats, _ := s.GetPlayerStats(ctx, p.UserID)

	// Check active round
	var activeRound GameRound
	err = s.db.Pool.QueryRow(ctx, `
		SELECT id, user_id, game, state, bet, payout, result, payload, revision, created_at, settled_at
		FROM game_rounds
		WHERE user_id = $1 AND state = 'active'
		ORDER BY created_at DESC
		LIMIT 1
	`, p.UserID).Scan(
		&activeRound.ID, &activeRound.UserID, &activeRound.Game, &activeRound.State,
		&activeRound.Bet, &activeRound.Payout, &activeRound.Result, &activeRound.Payload,
		&activeRound.Revision, &activeRound.CreatedAt, &activeRound.SettledAt,
	)
	var active *GameRound
	if err == nil {
		active = &activeRound
	}

	return &p, stats, active, nil
}

// AdminListUsers returns a list of players with pagination and search.
func (s *Service) AdminListUsers(ctx context.Context, search string, limit, offset int) ([]Player, int, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	if offset < 0 {
		offset = 0
	}

	var rows pgx.Rows
	var err error
	var total int

	if search != "" {
		searchPattern := "%" + strings.ToLower(search) + "%"
		countQuery := `SELECT COUNT(*) FROM players WHERE LOWER(user_id) LIKE $1 OR LOWER(nick) LIKE $1 OR LOWER(email) LIKE $1`
		listQuery := `
			SELECT user_id, email, nick, avatar, balance, xp, level, streak, last_bonus_day, created_at, updated_at
			FROM players
			WHERE LOWER(user_id) LIKE $1 OR LOWER(nick) LIKE $1 OR LOWER(email) LIKE $1
			ORDER BY balance DESC, created_at DESC
			LIMIT $2 OFFSET $3
		`
		if err := s.db.Pool.QueryRow(ctx, countQuery, searchPattern).Scan(&total); err != nil {
			return nil, 0, err
		}
		rows, err = s.db.Pool.Query(ctx, listQuery, searchPattern, limit, offset)
	} else {
		countQuery := `SELECT COUNT(*) FROM players`
		listQuery := `
			SELECT user_id, email, nick, avatar, balance, xp, level, streak, last_bonus_day, created_at, updated_at
			FROM players
			ORDER BY balance DESC, created_at DESC
			LIMIT $1 OFFSET $2
		`
		if err := s.db.Pool.QueryRow(ctx, countQuery).Scan(&total); err != nil {
			return nil, 0, err
		}
		rows, err = s.db.Pool.Query(ctx, listQuery, limit, offset)
	}

	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var players []Player
	for rows.Next() {
		var p Player
		if err := rows.Scan(&p.UserID, &p.Email, &p.Nick, &p.Avatar, &p.Balance, &p.XP, &p.Level, &p.Streak, &p.LastBonusDay, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, 0, err
		}
		players = append(players, p)
	}

	return players, total, nil
}

// AdminSetBalance explicitly sets player balance to a specified amount and logs ledger entry.
func (s *Service) AdminSetBalance(ctx context.Context, identifier string, newBalance int64, reason string) (string, int64, int64, error) {
	if newBalance < 0 {
		return "", 0, 0, fmt.Errorf("saldo nie może być ujemne")
	}
	if reason == "" {
		reason = "Ręczna zmiana salda przez administratora"
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

	delta := newBalance - p.Balance
	t := NowMs()

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return "", 0, 0, err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		UPDATE players
		SET balance = $1, updated_at = $2
		WHERE user_id = $3
	`, newBalance, t, p.UserID)
	if err != nil {
		return "", 0, 0, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
		VALUES ($1, $2, 'admin_set', $3, $4, $5)
	`, uuid.NewString(), p.UserID, delta, newBalance, t)
	if err != nil {
		return "", 0, 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", 0, 0, err
	}

	return p.Nick, p.Balance, newBalance, nil
}

// AdminSetNick changes player's nickname.
func (s *Service) AdminSetNick(ctx context.Context, identifier, newNick string) (string, string, error) {
	if strings.TrimSpace(newNick) == "" {
		return "", "", fmt.Errorf("nowy nick nie może być pusty")
	}

	var p Player
	err := s.db.Pool.QueryRow(ctx, `
		SELECT user_id, nick
		FROM players
		WHERE user_id = $1 OR nick = $1 OR email = $1
	`, identifier).Scan(&p.UserID, &p.Nick)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", fmt.Errorf("nie znaleziono gracza o identyfikatorze '%s'", identifier)
	}
	if err != nil {
		return "", "", err
	}

	var exists bool
	_ = s.db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM players WHERE nick = $1 AND user_id != $2)`, newNick, p.UserID).Scan(&exists)
	if exists {
		return "", "", fmt.Errorf("nick '%s' jest już zajęty przez innego gracza", newNick)
	}

	_, err = s.db.Pool.Exec(ctx, `UPDATE players SET nick = $1, updated_at = $2 WHERE user_id = $3`, newNick, NowMs(), p.UserID)
	if err != nil {
		return "", "", err
	}

	return p.Nick, newNick, nil
}

// AdminDeleteUser removes a user and their associated records.
func (s *Service) AdminDeleteUser(ctx context.Context, identifier string) (string, error) {
	var p Player
	err := s.db.Pool.QueryRow(ctx, `
		SELECT user_id, nick
		FROM players
		WHERE user_id = $1 OR nick = $1 OR email = $1
	`, identifier).Scan(&p.UserID, &p.Nick)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("nie znaleziono gracza o identyfikatorze '%s'", identifier)
	}
	if err != nil {
		return "", err
	}

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, `DELETE FROM game_rounds WHERE user_id = $1`, p.UserID)
	_, _ = tx.Exec(ctx, `DELETE FROM ledger_entries WHERE user_id = $1`, p.UserID)
	_, _ = tx.Exec(ctx, `DELETE FROM daily_claims WHERE user_id = $1`, p.UserID)
	_, _ = tx.Exec(ctx, `DELETE FROM daily_mission_claims WHERE user_id = $1`, p.UserID)
	_, _ = tx.Exec(ctx, `DELETE FROM provably_fair_seeds WHERE user_id = $1`, p.UserID)
	_, _ = tx.Exec(ctx, `DELETE FROM fraud_logs WHERE user_id = $1`, p.UserID)
	_, err = tx.Exec(ctx, `DELETE FROM players WHERE user_id = $1`, p.UserID)
	if err != nil {
		return "", fmt.Errorf("błąd podczas usuwania gracza: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}

	return p.Nick, nil
}

type GlobalCasinoStats struct {
	TotalPlayers   int64   `json:"total_players"`
	TotalRounds    int64   `json:"total_rounds"`
	TotalWagered   int64   `json:"total_wagered"`
	TotalPayout    int64   `json:"total_payout"`
	BiggestWin     int64   `json:"biggest_win"`
	BiggestWinNick string  `json:"biggest_win_nick"`
	BiggestWinGame string  `json:"biggest_win_game"`
	MaxMultiplier  float64 `json:"max_multiplier"`
}

// AdminGetGlobalCasinoStats aggregates global casino activity metrics.
func (s *Service) AdminGetGlobalCasinoStats(ctx context.Context) (*GlobalCasinoStats, error) {
	stats := &GlobalCasinoStats{}
	pool := s.db.Pool

	// Total players
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM players`).Scan(&stats.TotalPlayers)

	// Game rounds stats
	_ = pool.QueryRow(ctx, `
		SELECT 
			COUNT(*),
			COALESCE(SUM(bet), 0),
			COALESCE(SUM(payout), 0),
			COALESCE(MAX(payout), 0)
		FROM game_rounds
		WHERE state = 'settled'
	`).Scan(&stats.TotalRounds, &stats.TotalWagered, &stats.TotalPayout, &stats.BiggestWin)

	// Biggest win details
	if stats.BiggestWin > 0 {
		var uID, game string
		err := pool.QueryRow(ctx, `
			SELECT user_id, game
			FROM game_rounds
			WHERE state = 'settled' AND payout = $1
			ORDER BY created_at DESC
			LIMIT 1
		`, stats.BiggestWin).Scan(&uID, &game)
		if err == nil {
			stats.BiggestWinGame = game
			var nick string
			if err := pool.QueryRow(ctx, `SELECT nick FROM players WHERE user_id = $1`, uID).Scan(&nick); err == nil {
				stats.BiggestWinNick = nick
			} else {
				stats.BiggestWinNick = uID
			}
		}
	}

	// Max multiplier
	_ = pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(CASE WHEN bet > 0 THEN (payout::float / bet::float) ELSE 0 END), 0)
		FROM game_rounds
		WHERE state = 'settled' AND payout > 0
	`).Scan(&stats.MaxMultiplier)

	return stats, nil
}

