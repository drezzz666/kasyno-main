package ledger

type Player struct {
	UserID       string  `json:"user_id"`
	Email        string  `json:"email"`
	Nick         string  `json:"nick"`
	Avatar       *string `json:"avatar,omitempty"`
	Balance      int64   `json:"balance"`
	XP           int     `json:"xp"`
	Level        int     `json:"level"`
	Streak       int     `json:"streak"`
	LastBonusDay *string `json:"last_bonus_day"`
	CreatedAt    int64   `json:"created_at"`
	UpdatedAt    int64   `json:"updated_at"`
}

type GameRound struct {
	ID        string  `json:"id"`
	UserID    string  `json:"user_id"`
	Game      string  `json:"game"`
	State     string  `json:"state"`
	Bet       int64   `json:"bet"`
	Payout    int64   `json:"payout"`
	Result    string  `json:"result"`
	Payload   string  `json:"payload"`
	Revision  int     `json:"revision"`
	CreatedAt int64   `json:"created_at"`
	SettledAt *int64  `json:"settled_at"`
}

type LedgerEntry struct {
	ID           string  `json:"id"`
	UserID       string  `json:"user_id"`
	RoundID      *string `json:"round_id,omitempty"`
	Type         string  `json:"type"`
	Amount       int64   `json:"amount"`
	BalanceAfter int64   `json:"balanceAfter"`
	CreatedAt    int64   `json:"createdAt"`
	Game         *string `json:"game,omitempty"`
	Result       *string `json:"result,omitempty"`
	Bet          *int64  `json:"bet,omitempty"`
	Payout       *int64  `json:"payout,omitempty"`
}

type LeaderboardEntry struct {
	Nick    string  `json:"nick"`
	Balance int64   `json:"balance"`
	Level   int     `json:"level"`
	Avatar  *string `json:"avatar,omitempty"`
}

type HistoryResponse struct {
	Entries []LedgerEntry `json:"entries"`
	Total   int           `json:"total"`
	HasMore bool          `json:"hasMore"`
}

type SettleOutcome struct {
	Round        *GameRound `json:"round"`
	Balance      int64      `json:"balance"`
	XP           int        `json:"xp"`
	Level        int        `json:"level"`
	RoundsToday  int        `json:"roundsToday"`
	LevelUpBonus int64      `json:"levelUpBonus,omitempty"`
	LeveledUp    bool       `json:"leveledUp,omitempty"`
}

type PlayerStats struct {
	BiggestWin    int64   `json:"biggestWin"`
	MaxMultiplier float64 `json:"maxMultiplier"`
	FavoriteGame  string  `json:"favoriteGame"`
	TotalRounds   int64   `json:"totalRounds"`
	TotalWagered  int64   `json:"totalWagered"`
}


type Mission struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Icon        string `json:"icon"`
	Current     int64  `json:"current"`
	Target      int64  `json:"target"`
	Reward      int64  `json:"reward"`
	XPReward    int    `json:"xp_reward"`
	Claimed     bool   `json:"claimed"`
	Ready       bool   `json:"ready"`
}

type ProvablyFairSeedRecord struct {
	ID         string  `json:"id"`
	UserID     string  `json:"user_id"`
	ServerSeed string  `json:"server_seed,omitempty"`
	ServerHash string  `json:"server_hash"`
	ClientSeed string  `json:"client_seed"`
	Nonce      int64   `json:"nonce"`
	CreatedAt  int64   `json:"created_at"`
	RevealedAt *int64  `json:"revealed_at,omitempty"`
}

