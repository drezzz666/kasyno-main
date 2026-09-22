package ws

type EventType string

const (
	EventBalanceUpdate     EventType = "balance_update"
	EventRoundSettled      EventType = "round_settled"
	EventGlobalWin         EventType = "global_win"
	EventLeaderboardUpdate EventType = "leaderboard_update"
	EventPing              EventType = "ping"
	EventPong              EventType = "pong"
)

type Event struct {
	Type    EventType   `json:"type"`
	Payload interface{} `json:"payload"`
}

type BalanceUpdatePayload struct {
	Balance int64 `json:"balance"`
	XP      int   `json:"xp"`
	Level   int   `json:"level"`
}

type GlobalWinPayload struct {
	ID        string  `json:"id,omitempty"`
	Nick      string  `json:"nick"`
	Avatar    *string `json:"avatar,omitempty"`
	Game      string  `json:"game"`
	Bet       int64   `json:"bet"`
	Payout    int64   `json:"payout"`
	Result    string  `json:"result"`
	SettledAt int64   `json:"settled_at,omitempty"`
}

