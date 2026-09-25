package ledger

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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
		INSERT INTO players (user_id, email, nick, avatar, xp, level, streak, created_at, updated_at)
		VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8)
	`, p.UserID, p.Email, p.Nick, p.XP, p.Level, p.Streak, p.CreatedAt, p.UpdatedAt)
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
		SELECT p.user_id, p.email, p.nick, p.avatar, COALESCE(SUM(l.amount), 0), p.xp, p.level, p.streak, p.last_bonus_day, COALESCE(p.tos_accepted, 0), COALESCE(p.musor_lepsza_boxes, 0), p.created_at, p.updated_at
		FROM players p
		LEFT JOIN ledger_entries l ON p.user_id = l.user_id
		WHERE p.user_id = $1 OR p.nick = $1 OR p.email = $1
		GROUP BY p.user_id, p.email, p.nick, p.avatar, p.xp, p.level, p.streak, p.last_bonus_day, p.tos_accepted, p.musor_lepsza_boxes, p.created_at, p.updated_at
	`, identifier).Scan(&p.UserID, &p.Email, &p.Nick, &p.Avatar, &p.Balance, &p.XP, &p.Level, &p.Streak, &p.LastBonusDay, &p.TosAccepted, &p.MusorLepszaBoxes, &p.CreatedAt, &p.UpdatedAt)

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
	`, p.UserID).Scan(&activeRound.ID, &activeRound.UserID, &activeRound.Game, &activeRound.State, &activeRound.Bet, &activeRound.Payout, &activeRound.Result, &activeRound.Payload, &activeRound.Revision, &activeRound.CreatedAt, &activeRound.SettledAt)

	var activePtr *GameRound
	if err == nil {
		activePtr = &activeRound
	}

	return &p, stats, activePtr, nil
}

// AdminListUsers returns a list of players with pagination and search.
func (s *Service) AdminListUsers(ctx context.Context, search string, limit, offset int) ([]Player, int, error) {
	if limit <= 0 {
		limit = 20
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
			SELECT p.user_id, p.email, p.nick, p.avatar, COALESCE(SUM(l.amount), 0) AS balance, p.xp, p.level, p.streak, p.last_bonus_day, p.created_at, p.updated_at
			FROM players p
			LEFT JOIN ledger_entries l ON p.user_id = l.user_id
			WHERE LOWER(p.user_id) LIKE $1 OR LOWER(p.nick) LIKE $1 OR LOWER(p.email) LIKE $1
			GROUP BY p.user_id, p.email, p.nick, p.avatar, p.xp, p.level, p.streak, p.last_bonus_day, p.created_at, p.updated_at
			ORDER BY balance DESC, p.created_at DESC
			LIMIT $2 OFFSET $3
		`
		if err := s.db.Pool.QueryRow(ctx, countQuery, searchPattern).Scan(&total); err != nil {
			return nil, 0, err
		}
		rows, err = s.db.Pool.Query(ctx, listQuery, searchPattern, limit, offset)
	} else {
		countQuery := `SELECT COUNT(*) FROM players`
		listQuery := `
			SELECT p.user_id, p.email, p.nick, p.avatar, COALESCE(SUM(l.amount), 0) AS balance, p.xp, p.level, p.streak, p.last_bonus_day, p.created_at, p.updated_at
			FROM players p
			LEFT JOIN ledger_entries l ON p.user_id = l.user_id
			GROUP BY p.user_id, p.email, p.nick, p.avatar, p.xp, p.level, p.streak, p.last_bonus_day, p.created_at, p.updated_at
			ORDER BY balance DESC, p.created_at DESC
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

// AdminListAllUsers returns all registered players without limit.
func (s *Service) AdminListAllUsers(ctx context.Context) ([]Player, error) {
	query := `
		SELECT p.user_id, p.email, p.nick, p.avatar, COALESCE(SUM(l.amount), 0) AS balance, p.xp, p.level, p.streak, p.last_bonus_day, p.created_at, p.updated_at
		FROM players p
		LEFT JOIN ledger_entries l ON p.user_id = l.user_id
		GROUP BY p.user_id, p.email, p.nick, p.avatar, p.xp, p.level, p.streak, p.last_bonus_day, p.created_at, p.updated_at
		ORDER BY p.created_at ASC
	`
	rows, err := s.db.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var players []Player
	for rows.Next() {
		var p Player
		if err := rows.Scan(&p.UserID, &p.Email, &p.Nick, &p.Avatar, &p.Balance, &p.XP, &p.Level, &p.Streak, &p.LastBonusDay, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		players = append(players, p)
	}

	return players, nil
}

// GrantBalanceAll adds (or removes) balance for ALL registered players in the casino.
func (s *Service) GrantBalanceAll(ctx context.Context, amount int64, reason string) (int, int64, error) {
	return s.GrantBalanceAllWithType(ctx, amount, "grant_all", reason)
}

// GrantBalanceAllWithType adds balance for ALL registered players with custom ledger entry type and description.
func (s *Service) GrantBalanceAllWithType(ctx context.Context, amount int64, entryType, reason string) (int, int64, error) {
	if amount == 0 {
		return 0, 0, fmt.Errorf("kwota musi być różna od 0")
	}
	if entryType == "" {
		entryType = "grant_all"
	}

	rows, err := s.db.Pool.Query(ctx, `
		SELECT p.user_id, COALESCE(SUM(l.amount), 0)
		FROM players p
		LEFT JOIN ledger_entries l ON p.user_id = l.user_id
		GROUP BY p.user_id
	`)
	if err != nil {
		return 0, 0, fmt.Errorf("błąd pobierania listy graczy: %w", err)
	}
	defer rows.Close()

	type playerItem struct {
		userID  string
		balance int64
	}
	var players []playerItem
	for rows.Next() {
		var pi playerItem
		if err := rows.Scan(&pi.userID, &pi.balance); err == nil {
			players = append(players, pi)
		}
	}

	if len(players) == 0 {
		return 0, 0, fmt.Errorf("brak zarejestrowanych graczy w bazie danych")
	}

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback(ctx)

	t := NowMs()
	updatedCount := 0
	var totalTransferred int64

	for _, p := range players {
		newBal := p.balance + amount
		if newBal < 0 {
			newBal = 0
		}
		actualDelta := newBal - p.balance
		if actualDelta == 0 {
			continue
		}

		_, _ = tx.Exec(ctx, `UPDATE players SET updated_at = $1 WHERE user_id = $2`, t, p.userID)
		_, err = tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at, description)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, uuid.NewString(), p.userID, entryType, actualDelta, newBal, t, reason)
		if err != nil {
			return 0, 0, fmt.Errorf("błąd aktualizacji konta %s: %w", p.userID, err)
		}
		updatedCount++
		totalTransferred += actualDelta
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, 0, err
	}

	return updatedCount, totalTransferred, nil
}

// AdminSetBalanceAll sets balance for ALL registered players to exact newBalance.
func (s *Service) AdminSetBalanceAll(ctx context.Context, newBalance int64, reason string) (int, error) {
	if newBalance < 0 {
		return 0, fmt.Errorf("saldo nie może być ujemne")
	}

	rows, err := s.db.Pool.Query(ctx, `
		SELECT p.user_id, COALESCE(SUM(l.amount), 0)
		FROM players p
		LEFT JOIN ledger_entries l ON p.user_id = l.user_id
		GROUP BY p.user_id
	`)
	if err != nil {
		return 0, fmt.Errorf("błąd pobierania listy graczy: %w", err)
	}
	defer rows.Close()

	type playerItem struct {
		userID  string
		balance int64
	}
	var players []playerItem
	for rows.Next() {
		var pi playerItem
		if err := rows.Scan(&pi.userID, &pi.balance); err == nil {
			players = append(players, pi)
		}
	}

	if len(players) == 0 {
		return 0, fmt.Errorf("brak zarejestrowanych graczy w bazie danych")
	}

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	t := NowMs()
	count := 0

	for _, p := range players {
		delta := newBalance - p.balance
		_, _ = tx.Exec(ctx, `UPDATE players SET updated_at = $1 WHERE user_id = $2`, t, p.userID)
		_, err = tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at, description)
			VALUES ($1, $2, 'admin_set_all', $3, $4, $5, $6)
		`, uuid.NewString(), p.userID, delta, newBalance, t, reason)
		if err != nil {
			return 0, fmt.Errorf("błąd aktualizacji konta %s: %w", p.userID, err)
		}
		count++
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	return count, nil
}

// AdminSetBalance explicitly sets player balance to a specified amount and logs ledger entry.
func (s *Service) AdminSetBalance(ctx context.Context, identifier string, newBalance int64, reason string) (string, int64, int64, error) {
	if newBalance < 0 {
		return "", 0, 0, fmt.Errorf("saldo nie może być ujemne")
	}
	if reason == "" {
		reason = "Ręczna zmiana salda przez administratora"
	}

	trimmed := strings.TrimSpace(identifier)
	if trimmed == "*" || strings.EqualFold(trimmed, "all") || strings.EqualFold(trimmed, "wszyscy") || strings.EqualFold(trimmed, "@everyone") {
		count, err := s.AdminSetBalanceAll(ctx, newBalance, reason)
		if err != nil {
			return "", 0, 0, err
		}
		return fmt.Sprintf("Wszyscy gracze (%d kont)", count), 0, newBalance, nil
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

	delta := newBalance - p.Balance
	t := NowMs()

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return "", 0, 0, err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		UPDATE players
		SET updated_at = $1
		WHERE user_id = $2
	`, t, p.UserID)
	if err != nil {
		return "", 0, 0, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at, description)
		VALUES ($1, $2, 'admin_set', $3, $4, $5, $6)
	`, uuid.NewString(), p.UserID, delta, newBalance, t, reason)
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

// RevertResult contains statistics about the reverted transactions
type RevertResult struct {
	UserID        string `json:"user_id"`
	Nick          string `json:"nick"`
	PreviousBal   int64  `json:"previous_bal"`
	NewBal        int64  `json:"new_bal"`
	DeletedLedger int64  `json:"deleted_ledger"`
	DeletedRounds int64  `json:"deleted_rounds"`
	NetDiff       int64  `json:"net_diff"`
}

// AdminRevertBalanceUser removes all ledger entries and rounds created after untilMillis for a player.
func (s *Service) AdminRevertBalanceUser(ctx context.Context, identifier string, untilMillis int64) (*RevertResult, error) {
	var p Player
	err := s.db.Pool.QueryRow(ctx, `
		SELECT user_id, nick
		FROM players
		WHERE user_id = $1 OR nick = $1 OR email = $1
	`, identifier).Scan(&p.UserID, &p.Nick)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("nie znaleziono gracza o identyfikatorze '%s'", identifier)
	}
	if err != nil {
		return nil, err
	}

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("błąd rozpoczęcia transakcji: %w", err)
	}
	defer tx.Rollback(ctx)

	var prevBal int64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, p.UserID).Scan(&prevBal)

	var countLedger int64
	_ = tx.QueryRow(ctx, `SELECT COUNT(*) FROM ledger_entries WHERE user_id = $1 AND created_at > $2`, p.UserID, untilMillis).Scan(&countLedger)

	_, err = tx.Exec(ctx, `DELETE FROM ledger_entries WHERE user_id = $1 AND created_at > $2`, p.UserID, untilMillis)
	if err != nil {
		return nil, fmt.Errorf("błąd usuwania wpisów ledger: %w", err)
	}

	var countRounds int64
	_ = tx.QueryRow(ctx, `SELECT COUNT(*) FROM game_rounds WHERE user_id = $1 AND created_at > $2`, p.UserID, untilMillis).Scan(&countRounds)
	_, _ = tx.Exec(ctx, `DELETE FROM game_rounds WHERE user_id = $1 AND created_at > $2`, p.UserID, untilMillis)
	_, _ = tx.Exec(ctx, `DELETE FROM daily_claims WHERE user_id = $1 AND created_at > $2`, p.UserID, untilMillis)
	_, _ = tx.Exec(ctx, `DELETE FROM daily_mission_claims WHERE user_id = $1 AND created_at > $2`, p.UserID, untilMillis)

	var newBal int64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE user_id = $1`, p.UserID).Scan(&newBal)

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("błąd zatwierdzania transakcji revert: %w", err)
	}

	return &RevertResult{
		UserID:        p.UserID,
		Nick:          p.Nick,
		PreviousBal:   prevBal,
		NewBal:        newBal,
		DeletedLedger: countLedger,
		DeletedRounds: countRounds,
		NetDiff:       newBal - prevBal,
	}, nil
}

// AdminRevertBalanceAll removes all ledger entries and rounds created after untilMillis across all players.
func (s *Service) AdminRevertBalanceAll(ctx context.Context, untilMillis int64) (affectedUsers int64, deletedEntries int64, deletedRounds int64, err error) {
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("błąd rozpoczęcia transakcji: %w", err)
	}
	defer tx.Rollback(ctx)

	_ = tx.QueryRow(ctx, `SELECT COUNT(DISTINCT user_id), COUNT(*) FROM ledger_entries WHERE created_at > $1`, untilMillis).Scan(&affectedUsers, &deletedEntries)
	_ = tx.QueryRow(ctx, `SELECT COUNT(*) FROM game_rounds WHERE created_at > $1`, untilMillis).Scan(&deletedRounds)

	_, err = tx.Exec(ctx, `DELETE FROM ledger_entries WHERE created_at > $1`, untilMillis)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("błąd masowego usuwania wpisów ledger: %w", err)
	}

	_, _ = tx.Exec(ctx, `DELETE FROM game_rounds WHERE created_at > $1`, untilMillis)
	_, _ = tx.Exec(ctx, `DELETE FROM daily_claims WHERE created_at > $1`, untilMillis)
	_, _ = tx.Exec(ctx, `DELETE FROM daily_mission_claims WHERE created_at > $1`, untilMillis)

	if err := tx.Commit(ctx); err != nil {
		return 0, 0, 0, fmt.Errorf("błąd zatwierdzania masowego revert: %w", err)
	}

	return affectedUsers, deletedEntries, deletedRounds, nil
}

// GrantMusorBoxesAll adds (or removes) Musor Drop boxes for ALL registered players.
func (s *Service) GrantMusorBoxesAll(ctx context.Context, amount int, reason string) (int, int, error) {
	if amount == 0 {
		return 0, 0, fmt.Errorf("ilość skrzynek musi być różna od 0")
	}

	t := NowMs()
	tag, err := s.db.Pool.Exec(ctx, `
		UPDATE players
		SET musor_lepsza_boxes = GREATEST(0, musor_lepsza_boxes + $1),
		    updated_at = $2
	`, amount, t)
	if err != nil {
		return 0, 0, fmt.Errorf("błąd aktualizacji skrzynek dla wszystkich: %w", err)
	}

	count := int(tag.RowsAffected())
	total := count * amount
	return count, total, nil
}

// GrantMusorBoxes adds or removes Musor Drop boxes for a single player or all (*).
func (s *Service) GrantMusorBoxes(ctx context.Context, identifier string, amount int, reason string) (string, int, int, error) {
	if amount == 0 {
		return "", 0, 0, fmt.Errorf("ilość skrzynek musi być różna od 0")
	}

	trimmed := strings.TrimSpace(identifier)
	if trimmed == "*" || strings.EqualFold(trimmed, "all") || strings.EqualFold(trimmed, "wszyscy") || strings.EqualFold(trimmed, "@everyone") {
		count, total, err := s.GrantMusorBoxesAll(ctx, amount, reason)
		if err != nil {
			return "", 0, 0, err
		}
		return fmt.Sprintf("Wszyscy gracze (%d kont, łącznie: %+d skrzynek)", count, total), 0, amount, nil
	}

	var p Player
	err := s.db.Pool.QueryRow(ctx, `
		SELECT user_id, nick, COALESCE(musor_lepsza_boxes, 0)
		FROM players
		WHERE user_id = $1 OR nick = $1 OR email = $1
		LIMIT 1
	`, identifier).Scan(&p.UserID, &p.Nick, &p.MusorLepszaBoxes)
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

	var curBoxes int
	_ = tx.QueryRow(ctx, `SELECT COALESCE(musor_lepsza_boxes, 0) FROM players WHERE user_id = $1`, p.UserID).Scan(&curBoxes)
	if curBoxes+amount < 0 {
		return "", 0, 0, fmt.Errorf("gracz ma tylko %d skrzynek, nie można odjąć %d", curBoxes, -amount)
	}
	newBoxes := curBoxes + amount

	_, err = tx.Exec(ctx, `
		UPDATE players
		SET musor_lepsza_boxes = $1, updated_at = $2
		WHERE user_id = $3
	`, newBoxes, t, p.UserID)
	if err != nil {
		return "", 0, 0, fmt.Errorf("błąd aktualizacji stanu skrzynek gracza: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", 0, 0, err
	}

	return p.Nick, curBoxes, newBoxes, nil
}

// ResetMusorDropDaily resets daily opened box counters for a user (or all users).
func (s *Service) ResetMusorDropDaily(ctx context.Context, identifier, boxType string) (int, error) {
	dayKey := TodayString()
	trimmed := strings.TrimSpace(identifier)
	isAll := trimmed == "" || trimmed == "*" || strings.EqualFold(trimmed, "all") || strings.EqualFold(trimmed, "wszyscy") || strings.EqualFold(trimmed, "@everyone")

	boxType = strings.ToLower(strings.TrimSpace(boxType))
	filterBox := boxType != "" && boxType != "all" && boxType != "wszystkie" && boxType != "*"

	if isAll {
		var tag pgconn.CommandTag
		var err error
		if filterBox {
			tag, err = s.db.Pool.Exec(ctx, `DELETE FROM musor_drop_daily WHERE day_key = $1 AND box_type = $2`, dayKey, boxType)
		} else {
			tag, err = s.db.Pool.Exec(ctx, `DELETE FROM musor_drop_daily WHERE day_key = $1`, dayKey)
		}
		if err != nil {
			return 0, fmt.Errorf("błąd resetu dziennych limitów skrzynek: %w", err)
		}
		return int(tag.RowsAffected()), nil
	}

	var userID string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT user_id FROM players WHERE user_id = $1 OR nick = $1 OR email = $1 LIMIT 1
	`, identifier).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, fmt.Errorf("nie znaleziono gracza o identyfikatorze '%s'", identifier)
	}
	if err != nil {
		return 0, err
	}

	var tag pgconn.CommandTag
	if filterBox {
		tag, err = s.db.Pool.Exec(ctx, `DELETE FROM musor_drop_daily WHERE user_id = $1 AND day_key = $2 AND box_type = $3`, userID, dayKey, boxType)
	} else {
		tag, err = s.db.Pool.Exec(ctx, `DELETE FROM musor_drop_daily WHERE user_id = $1 AND day_key = $2`, userID, dayKey)
	}
	if err != nil {
		return 0, fmt.Errorf("błąd resetu dziennych limitów skrzynek gracza: %w", err)
	}
	return int(tag.RowsAffected()), nil
}


