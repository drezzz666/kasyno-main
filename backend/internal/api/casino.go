package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/anticheat"
	"github.com/drezzz666/kasyno/backend/internal/auth"
	"github.com/drezzz666/kasyno/backend/internal/games/blackjack"
	"github.com/drezzz666/kasyno/backend/internal/games/coinflip"
	"github.com/drezzz666/kasyno/backend/internal/games/crash"
	"github.com/drezzz666/kasyno/backend/internal/games/limbo"
	"github.com/drezzz666/kasyno/backend/internal/games/mines"
	"github.com/drezzz666/kasyno/backend/internal/games/plinko"
	"github.com/drezzz666/kasyno/backend/internal/games/roulette"
	"github.com/drezzz666/kasyno/backend/internal/games/rps"
	"github.com/drezzz666/kasyno/backend/internal/games/slots"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
	"github.com/drezzz666/kasyno/backend/internal/reporter"
	"github.com/drezzz666/kasyno/backend/internal/ws"
)

type CasinoHandler struct {
	ledger        *ledger.Service
	hub           *ws.Hub
	userLocks     *anticheat.UserLockManager
	rateLimiter   *anticheat.RateLimiter
	sessionSecret string
	reporter      *reporter.Reporter
}

func NewCasinoHandler(ledgerService *ledger.Service, wsHub *ws.Hub, rep *reporter.Reporter, sessionSecret string) *CasinoHandler {
	return &CasinoHandler{
		ledger:        ledgerService,
		hub:           wsHub,
		userLocks:     anticheat.NewUserLockManager(),
		rateLimiter:   anticheat.NewRateLimiter(),
		sessionSecret: sessionSecret,
		reporter:      rep,
	}
}

func (h *CasinoHandler) reportBackendError(category string, err error, details map[string]interface{}) {
	if h.reporter != nil && err != nil {
		h.reporter.ReportBackendError(category, err.Error(), "", details)
	}
}

func JSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func JSONError(w http.ResponseWriter, status int, message string) {
	JSON(w, status, map[string]string{"error": message})
}

// MaskActivePayload ensures dealer hole cards, hidden mines, and unreached crash points are never leaked during active game state
func MaskActivePayload(game, payloadJSON string) interface{} {
	if game == "blackjack" {
		p, err := blackjack.ParsePayload(payloadJSON)
		if err == nil {
			return blackjack.MaskDealerCard(*p)
		}
	} else if game == "mines" {
		p, err := mines.ParsePayload(payloadJSON)
		if err == nil {
			return mines.MaskMines(*p)
		}
	} else if game == "crash" {
		p, err := crash.ParsePayload(payloadJSON)
		if err == nil {
			return crash.MaskActive(*p)
		}
	}

	var raw interface{}
	_ = json.Unmarshal([]byte(payloadJSON), &raw)
	return raw
}

type PublicRound struct {
	ID        string      `json:"id"`
	UserID    string      `json:"user_id,omitempty"`
	Game      string      `json:"game"`
	State     string      `json:"state"`
	Bet       int64       `json:"bet"`
	Payout    int64       `json:"payout"`
	Result    string      `json:"result"`
	Payload   interface{} `json:"payload"`
	Revision  int         `json:"revision"`
	CreatedAt int64       `json:"created_at"`
	SettledAt *int64      `json:"settled_at,omitempty"`
}

func ToPublicRound(r *ledger.GameRound) *PublicRound {
	if r == nil {
		return nil
	}
	var payload interface{}
	if r.State == "active" {
		payload = MaskActivePayload(r.Game, r.Payload)
	} else {
		_ = json.Unmarshal([]byte(r.Payload), &payload)
	}

	return &PublicRound{
		ID:        r.ID,
		UserID:    r.UserID,
		Game:      r.Game,
		State:     r.State,
		Bet:       r.Bet,
		Payout:    r.Payout,
		Result:    r.Result,
		Payload:   payload,
		Revision:  r.Revision,
		CreatedAt: r.CreatedAt,
		SettledAt: r.SettledAt,
	}
}

// GetState handles GET /api/casino
func (h *CasinoHandler) GetState(w http.ResponseWriter, r *http.Request) {
	p := auth.GetPlayerFromContext(r.Context())
	if p == nil {
		JSONError(w, http.StatusUnauthorized, "Zaloguj się przez Authentik, aby zagrać.")
		return
	}

	// Anti-bot: register identity and check state-read rate
	h.rateLimiter.SetIdentity(p.UserID, p.Nick, r.RemoteAddr)
	if !h.rateLimiter.AllowStateRead(p.UserID) {
		JSONError(w, http.StatusTooManyRequests, "Zbyt szybkie odpytywanie. Zwolnij tempo.")
		return
	}

	activeRound, err := h.ledger.GetActiveRound(r.Context(), p.UserID)
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd pobierania aktywnej rundy")
		return
	}

	historyResp, err := h.ledger.GetHistory(r.Context(), p.UserID, 10, 0)
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd pobierania historii")
		return
	}

	roundsToday, _ := h.ledger.GetRoundsToday(r.Context(), p.UserID)
	today := ledger.TodayString()
	missionClaimed, _ := h.ledger.IsDailyMissionClaimed(r.Context(), p.UserID, today)
	leaders, _ := h.ledger.GetLeaderboard(r.Context(), 50)
	levelLeaders, _ := h.ledger.GetLevelLeaderboard(r.Context(), 50)
	playerRank, _ := h.ledger.GetPlayerRank(r.Context(), p.UserID)
	playerLevelRank, _ := h.ledger.GetPlayerLevelRank(r.Context(), p.UserID)
	missions, missionNextReset, _ := h.ledger.GetDailyMissions(r.Context(), p.UserID)
	recentWins, _ := h.ledger.GetRecentGlobalWins(r.Context(), 15)
	playerStats, _ := h.ledger.GetPlayerStats(r.Context(), p.UserID)

	resp := map[string]interface{}{
		"player":           p,
		"playerRank":       playerRank,
		"playerLevelRank":  playerLevelRank,
		"stats":            playerStats,
		"active":           ToPublicRound(activeRound),
		"history":          historyResp.Entries,
		"hasMoreHistory":   historyResp.HasMore,
		"roundsToday":      roundsToday,
		"missionClaimed":   missionClaimed,
		"missionReward":    250,
		"missions":         missions,
		"missionNextReset": missionNextReset,
		"leaders":          leaders,
		"levelLeaders":     levelLeaders,
		"today":            today,
		"recentWins":       recentWins,
		"challenge":        anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
	}

	JSON(w, http.StatusOK, resp)
}

// GetChallenge handles GET /api/casino/challenge
func (h *CasinoHandler) GetChallenge(w http.ResponseWriter, r *http.Request) {
	p := auth.GetPlayerFromContext(r.Context())
	if p == nil {
		JSONError(w, http.StatusUnauthorized, "Wymagane logowanie")
		return
	}

	h.rateLimiter.SetIdentity(p.UserID, p.Nick, r.RemoteAddr)
	if !h.rateLimiter.AllowStateRead(p.UserID) {
		JSONError(w, http.StatusTooManyRequests, "Zbyt częste pobieranie wyzwań.")
		return
	}

	challenge := anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret)
	JSON(w, http.StatusOK, challenge)
}

// GetHistory handles GET /api/casino/history
func (h *CasinoHandler) GetHistory(w http.ResponseWriter, r *http.Request) {
	p := auth.GetPlayerFromContext(r.Context())
	if p == nil {
		JSONError(w, http.StatusUnauthorized, "Zaloguj się przez Authentik.")
		return
	}

	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 10
	}

	historyResp, err := h.ledger.GetHistory(r.Context(), p.UserID, limit, offset)
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd bazy danych")
		return
	}

	JSON(w, http.StatusOK, historyResp)
}

// PostAction handles generic POST /api/casino for full backwards-compatibility with frontend
func (h *CasinoHandler) PostAction(w http.ResponseWriter, r *http.Request) {
	p := auth.GetPlayerFromContext(r.Context())
	if p == nil {
		JSONError(w, http.StatusUnauthorized, "Zaloguj się przez Authentik, aby zagrać.")
		return
	}

	// 0. Anti-Bot & Anti-Replay: verify single-use browser proof-of-work challenge
	proofHeader := r.Header.Get("X-Browser-Proof")
	if err := anticheat.VerifyBrowserProof(p.UserID, h.sessionSecret, proofHeader); err != nil {
		if !errors.Is(err, anticheat.ErrChallengeReused) && !errors.Is(err, anticheat.ErrChallengeExpired) {
			h.recordFraud(r, p, "CHALLENGE_VERIFICATION_FAILED", err.Error())
		}
		JSON(w, http.StatusForbidden, map[string]interface{}{
			"error":     "Wystąpił błąd podczas przetwarzania żądania. Spróbuj ponownie.",
			"code":      "REQ_FAILED",
			"challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
		})
		return
	}

	// 1. Anti-Cheat: register identity (nick + IP) for bot logs, then check game rate limit
	h.rateLimiter.SetIdentity(p.UserID, p.Nick, r.RemoteAddr)

	// Parse action and game early so we can log it precisely in rate limiter
	var bodyPeek map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&bodyPeek); err != nil {
		JSONError(w, http.StatusBadRequest, "Nieprawidłowy format JSON")
		return
	}
	actionPeek, _ := bodyPeek["action"].(string)
	if actionPeek == "" {
		actionPeek = "play"
	}
	gamePeek, _ := bodyPeek["game"].(string)

	if !h.rateLimiter.AllowGameAction(p.UserID, actionPeek, gamePeek) {
		JSONError(w, http.StatusTooManyRequests, "Wystąpił błąd podczas przetwarzania żądania.")
		return
	}

	// 2. Anti-Cheat: User Concurrency Mutex Lock (prevents race-condition double spending / parallel execution exploits)
	unlock := h.userLocks.LockUser(p.UserID)
	defer unlock()

	// Re-fetch current player balance from DB after acquiring lock to guarantee atomic consistency
	freshPlayer, err := h.ledger.GetPlayer(r.Context(), p.UserID)
	if err == nil && freshPlayer != nil {
		p = freshPlayer
	}

	// bodyPeek is already decoded above; reuse it as body
	body := bodyPeek
	action := actionPeek

	switch action {
	case "bonus":
		h.handleBonus(w, r, p)
	case "claim_mission", "mission":
		h.handleMission(w, r, p, body)
	case "deal_blackjack":
		h.handleDealBlackjack(w, r, p, body)
	case "blackjack":
		h.handleActBlackjack(w, r, p, body)
	case "start_mines":
		h.handleStartMines(w, r, p, body)
	case "mines":
		h.handleActMines(w, r, p, body)
	case "start_crash":
		h.handleStartCrash(w, r, p, body)
	case "cashout_crash", "crash_cashout":
		h.handleCashoutCrash(w, r, p, body)
	case "settle_crash", "crash_settle":
		h.handleSettleCrash(w, r, p, body)
	default:
		h.handleInstantGame(w, r, p, body)
	}
}

func (h *CasinoHandler) handleBonus(w http.ResponseWriter, r *http.Request, p *ledger.Player) {
	amount, newBal, streak, err := h.ledger.ClaimDailyBonus(r.Context(), p.UserID)
	if errors.Is(err, ledger.ErrAlreadyClaimed) {
		JSONError(w, http.StatusConflict, "Dzisiejszy bonus został już odebrany.")
		return
	}
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd odbierania bonusu")
		return
	}

	h.hub.SendToUser(p.UserID, ws.Event{
		Type: ws.EventBalanceUpdate,
		Payload: ws.BalanceUpdatePayload{
			Balance: newBal,
			XP:      p.XP,
			Level:   p.Level,
		},
	})

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":             true,
		"amount":         amount,
		"balance":        newBal,
		"streak":         streak,
		"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
	})
}

func (h *CasinoHandler) handleMission(w http.ResponseWriter, r *http.Request, p *ledger.Player, body map[string]interface{}) {
	missionID, _ := body["mission_id"].(string)
	if missionID == "" {
		missionID = "daily_all_5"
	}

	reward, xpReward, newBal, newXP, newLevel, err := h.ledger.ClaimDailyMission(r.Context(), p.UserID, missionID)
	if errors.Is(err, ledger.ErrMissionNotReady) {
		JSONError(w, http.StatusBadRequest, "Warunki tej misji nie zostały jeszcze spełnione.")
		return
	}
	if errors.Is(err, ledger.ErrAlreadyClaimed) {
		JSONError(w, http.StatusConflict, "Nagroda za tę misję została już dzisiaj odebrana.")
		return
	}
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd przetwarzania misji")
		return
	}

	h.hub.SendToUser(p.UserID, ws.Event{
		Type: ws.EventBalanceUpdate,
		Payload: ws.BalanceUpdatePayload{
			Balance: newBal,
			XP:      newXP,
			Level:   newLevel,
		},
	})

	missions, missionNextReset, _ := h.ledger.GetDailyMissions(r.Context(), p.UserID)

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":               true,
		"mission_id":       missionID,
		"amount":           reward,
		"xp":               xpReward,
		"balance":          newBal,
		"level":            newLevel,
		"missions":         missions,
		"missionNextReset": missionNextReset,
		"missionClaimed":   true,
		"next_challenge":   anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
	})
}

type fraudThrottle struct {
	mu       sync.Mutex
	lastLogs map[string]time.Time
}

var globalFraudThrottle = &fraudThrottle{
	lastLogs: make(map[string]time.Time),
}

func (h *CasinoHandler) recordFraud(r *http.Request, p *ledger.Player, reason, details string) {
	anticheat.LogSuspiciousActivity("SECURITY_ALERT", r.RemoteAddr, p.UserID, p.Nick, reason, details)

	// Debounce database inserts for fraud logs to prevent DB exhaustion on high-frequency error bursts
	key := p.UserID + ":" + reason
	globalFraudThrottle.mu.Lock()
	last, exists := globalFraudThrottle.lastLogs[key]
	if exists && time.Since(last) < 5*time.Second {
		globalFraudThrottle.mu.Unlock()
		return
	}
	globalFraudThrottle.lastLogs[key] = time.Now()
	if len(globalFraudThrottle.lastLogs) > 1000 {
		cutoff := time.Now().Add(-1 * time.Minute)
		for k, t := range globalFraudThrottle.lastLogs {
			if t.Before(cutoff) {
				delete(globalFraudThrottle.lastLogs, k)
			}
		}
	}
	globalFraudThrottle.mu.Unlock()

	_ = h.ledger.LogFraud(r.Context(), p.UserID, p.Nick, p.Balance, reason, details)
}

func (h *CasinoHandler) handleInstantGame(w http.ResponseWriter, r *http.Request, p *ledger.Player, body map[string]interface{}) {
	// Block instant games if player has an active round in a turn-based game
	active, err := h.ledger.GetActiveRound(r.Context(), p.UserID)
	if err == nil && active != nil {
		JSONError(w, http.StatusConflict, "Posiadasz już aktywną rundę w grze turowej. Dokończ ją przed rozpoczęciem nowej.")
		return
	}

	game, _ := body["game"].(string)
	betFloat, ok := body["bet"].(float64)
	if !ok {
		JSONError(w, http.StatusBadRequest, "Nieprawidłowa stawka.")
		return
	}
	bet := int64(betFloat)
	if err := anticheat.ValidateBet(bet, p.Balance); err != nil {
		JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Fetch or initialize provably fair seeds and increment nonce
	serverSeed, clientSeed, nonce, _, pfErr := h.ledger.GetAndIncrementNonce(r.Context(), p.UserID)
	hasPF := (pfErr == nil && serverSeed != "" && clientSeed != "")

	var payout int64
	var resultText string
	var payloadBytes []byte

	if game == "roulette" {
		if betsRaw, hasBets := body["bets"].(map[string]interface{}); hasBets && len(betsRaw) > 0 {
			var calculatedTotal int64
			betsMap := make(map[string]int64)
			for spot, amtRaw := range betsRaw {
				var amt int64
				switch v := amtRaw.(type) {
				case float64:
					amt = int64(v)
				case int64:
					amt = v
				case int:
					amt = int64(v)
				}
				if amt <= 0 {
					continue
				}
				if amt > 10_000_000 {
					JSONError(w, http.StatusBadRequest, "Stawka na pojedyncze pole przekracza limit 10,000,000 $FGT.")
					return
				}
				if math.MaxInt64-calculatedTotal < amt {
					JSONError(w, http.StatusBadRequest, "Łączna stawka przekracza dopuszczalny limit.")
					return
				}
				if err := anticheat.ValidateRouletteChoice(spot); err != nil {
					JSONError(w, http.StatusBadRequest, err.Error())
					return
				}
				betsMap[spot] = amt
				calculatedTotal += amt
			}
			if len(betsMap) == 0 {
				JSONError(w, http.StatusBadRequest, "Brak prawidłowych stawek na stole ruletki.")
				return
			}
			bet = calculatedTotal
			if err := anticheat.ValidateBet(bet, p.Balance); err != nil {
				JSONError(w, http.StatusBadRequest, err.Error())
				return
			}

			var res *roulette.SpinResult
			if hasPF {
				res, err = roulette.PlayRouletteMultiProvablyFair(serverSeed, clientSeed, nonce, betsMap)
			} else {
				res, err = roulette.PlayRouletteMulti(betsMap)
			}
			if err != nil {
				JSONError(w, http.StatusBadRequest, err.Error())
				return
			}
			payout = res.Payout
			resultText = res.ResultText
			payloadBytes, _ = json.Marshal(res.Payload)
		} else {
			choice, _ := body["choice"].(string)
			if choice == "" {
				choice = "red"
			}
			if err := anticheat.ValidateRouletteChoice(choice); err != nil {
				JSONError(w, http.StatusBadRequest, err.Error())
				return
			}
			var res *roulette.SpinResult
			if hasPF {
				res, err = roulette.PlayRouletteProvablyFair(serverSeed, clientSeed, nonce, bet, choice)
			} else {
				res, err = roulette.PlayRoulette(bet, choice)
			}
			if err != nil {
				JSONError(w, http.StatusBadRequest, err.Error())
				return
			}
			payout = res.Payout
			resultText = res.ResultText
			payloadBytes, _ = json.Marshal(res.Payload)
		}
	} else if game == "slots" {
		var res *slots.SpinResult
		if hasPF {
			res, err = slots.PlaySlotsProvablyFair(serverSeed, clientSeed, nonce, bet)
		} else {
			res, err = slots.PlaySlots(bet)
		}
		if err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		payout = res.Payout
		resultText = res.ResultText
		payloadBytes, _ = json.Marshal(res.Payload)
	} else if game == "coinflip" {
		choice, _ := body["choice"].(string)
		if choice == "" {
			choice = "heads"
		}
		if err := anticheat.ValidateCoinflipChoice(choice); err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		var res *coinflip.Result
		if hasPF {
			res, err = coinflip.PlayCoinflipProvablyFair(serverSeed, clientSeed, nonce, bet, choice)
		} else {
			res, err = coinflip.PlayCoinflip(bet, choice)
		}
		if err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		payout = res.Payout
		resultText = res.ResultText
		payloadBytes, _ = json.Marshal(res.Payload)
	} else if game == "rps" {
		choice, _ := body["choice"].(string)
		if choice == "" {
			choice = "rock"
		}
		if err := anticheat.ValidateRPSChoice(choice); err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		var res *rps.Result
		if hasPF {
			res, err = rps.PlayRPSProvablyFair(serverSeed, clientSeed, nonce, bet, choice)
		} else {
			res, err = rps.PlayRPS(bet, choice)
		}
		if err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		payout = res.Payout
		resultText = res.ResultText
		payloadBytes, _ = json.Marshal(res.Payload)
	} else if game == "plinko" {
		rowsFloat, _ := body["rows"].(float64)
		rows := int(rowsFloat)
		risk, _ := body["risk"].(string)
		if err := anticheat.ValidatePlinkoParams(rows, risk); err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		var res *plinko.Result
		if hasPF {
			res, err = plinko.PlayPlinkoProvablyFair(serverSeed, clientSeed, nonce, bet, rows, risk)
		} else {
			res, err = plinko.PlayPlinko(bet, rows, risk)
		}
		if err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		payout = res.Payout
		resultText = res.ResultText
		payloadBytes, _ = json.Marshal(res.Payload)
	} else if game == "limbo" {
		targetMult, _ := body["target_multiplier"].(float64)
		if err := anticheat.ValidateLimboTarget(targetMult); err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		var res *limbo.Result
		if hasPF {
			res, err = limbo.PlayLimboProvablyFair(serverSeed, clientSeed, nonce, bet, targetMult)
		} else {
			res, err = limbo.PlayLimbo(bet, targetMult)
		}
		if err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		payout = res.Payout
		resultText = res.ResultText
		payloadBytes, _ = json.Marshal(res.Payload)
	} else if game == "crash" {
		targetMult, _ := body["target_multiplier"].(float64)
		if err := anticheat.ValidateCrashTarget(targetMult); err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		var res *crash.Result
		if hasPF {
			res, err = crash.PlayCrashProvablyFair(serverSeed, clientSeed, nonce, bet, targetMult)
		} else {
			res, err = crash.PlayCrash(bet, targetMult)
		}
		if err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		payout = res.Payout
		resultText = res.ResultText
		payloadBytes, _ = json.Marshal(res.Payload)
	} else {
		JSONError(w, http.StatusBadRequest, "Nieznana gra.")
		return
	}

	outcome, err := h.ledger.SettleInstantRound(r.Context(), p.UserID, game, bet, payout, resultText, string(payloadBytes))
	if errors.Is(err, ledger.ErrActiveRoundExists) {
		JSONError(w, http.StatusConflict, "Posiadasz aktywną rundę w innej grze. Dokończ ją przed rozpoczęciem nowej.")
		return
	}
	if errors.Is(err, ledger.ErrInsufficientFunds) {
		JSONError(w, http.StatusBadRequest, "Niewystarczające saldo żetonów.")
		return
	}
	if err != nil {
		h.reportBackendError("SETTLE_INSTANT_ROUND_ERROR", err, map[string]interface{}{
			"user_id": p.UserID,
			"nick":    p.Nick,
			"game":    game,
			"bet":     bet,
			"payout":  payout,
		})
		JSONError(w, http.StatusInternalServerError, "Błąd rozliczania rundy")
		return
	}

	// Broadcast wins to all live players
	if payout > 0 {
		h.broadcastWin(outcome.Round.ID, p.Nick, game, p.Avatar, payout, bet, resultText)
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":             true,
		"round":          ToPublicRound(outcome.Round),
		"balance":        outcome.Balance,
		"xp":             outcome.XP,
		"level":          outcome.Level,
		"roundsToday":    outcome.RoundsToday,
		"leveledUp":      outcome.LeveledUp,
		"levelUpBonus":   outcome.LevelUpBonus,
		"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
	})
}


func (h *CasinoHandler) broadcastWin(roundID, nick, game string, avatar *string, payout, bet int64, resultText string) {
	if payout > 0 {
		h.hub.Broadcast(ws.Event{
			Type: ws.EventGlobalWin,
			Payload: ws.GlobalWinPayload{
				ID:        roundID,
				Nick:      nick,
				Avatar:    avatar,
				Game:      game,
				Bet:       bet,
				Payout:    payout,
				Result:    resultText,
				SettledAt: ledger.NowMs(),
			},
		})
	}
}

func (h *CasinoHandler) handleDealBlackjack(w http.ResponseWriter, r *http.Request, p *ledger.Player, body map[string]interface{}) {
	betFloat, ok := body["bet"].(float64)
	if !ok {
		JSONError(w, http.StatusBadRequest, "Nieprawidłowa stawka.")
		return
	}
	bet := int64(betFloat)
	if err := anticheat.ValidateBet(bet, p.Balance); err != nil {
		JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	dealPayload := blackjack.InitialDeal()
	payloadBytes, _ := json.Marshal(dealPayload)

	round, balAfterBet, err := h.ledger.StartActiveRound(r.Context(), p.UserID, "blackjack", bet, string(payloadBytes))
	if errors.Is(err, ledger.ErrActiveRoundExists) {
		JSONError(w, http.StatusConflict, "Najpierw dokończ aktywną rundę.")
		return
	}
	if errors.Is(err, ledger.ErrInsufficientFunds) {
		JSONError(w, http.StatusBadRequest, "Niewystarczające saldo żetonów.")
		return
	}
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd rozpoczynania rundy blackjacka")
		return
	}

	// Check immediate natural blackjack for player or dealer
	if blackjack.HandValue(dealPayload.Cards) == 21 || blackjack.HandValue(dealPayload.Dealer) == 21 {
		settleRes := blackjack.SettleBlackjack(bet, dealPayload)
		finalPayloadBytes, _ := json.Marshal(settleRes.Payload)

		outcome, err := h.ledger.SettleActiveRound(r.Context(), round.ID, p.UserID, settleRes.Payout, settleRes.ResultText, string(finalPayloadBytes))
		if err == nil {
			if settleRes.Payout > 0 {
				h.broadcastWin(outcome.Round.ID, p.Nick, "blackjack", p.Avatar, settleRes.Payout, bet, settleRes.ResultText)
			}
			JSON(w, http.StatusOK, map[string]interface{}{
				"ok":             true,
				"round":          ToPublicRound(outcome.Round),
				"balance":        outcome.Balance,
				"xp":             outcome.XP,
				"level":          outcome.Level,
				"roundsToday":    outcome.RoundsToday,
				"leveledUp":      outcome.LeveledUp,
				"levelUpBonus":   outcome.LevelUpBonus,
				"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
			})
			return
		}
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":             true,
		"round":          ToPublicRound(round),
		"balance":        balAfterBet,
		"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
	})
}

func (h *CasinoHandler) handleActBlackjack(w http.ResponseWriter, r *http.Request, p *ledger.Player, body map[string]interface{}) {
	roundID, _ := body["roundId"].(string)
	move, _ := body["move"].(string)

	activeRound, err := h.ledger.GetActiveRound(r.Context(), p.UserID)
	if err != nil || activeRound == nil || activeRound.ID != roundID {
		JSONError(w, http.StatusNotFound, "Aktywna runda nie istnieje.")
		return
	}

	payload, err := blackjack.ParsePayload(activeRound.Payload)
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd odczytu stanu rundy")
		return
	}

	if err := anticheat.ValidateBlackjackMove(move, len(payload.Cards)); err != nil {
		JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	if move == "double" {
		if p.Balance < activeRound.Bet {
			JSONError(w, http.StatusBadRequest, "Za mało żetonów na podwojenie.")
			return
		}

		existing := append([]blackjack.Card{}, payload.Cards...)
		existing = append(existing, payload.Dealer...)
		payload.Cards = append(payload.Cards, blackjack.DrawUniqueCard(existing))
		newBet := activeRound.Bet * 2

		settleRes := blackjack.SettleBlackjack(newBet, *payload)
		finalPayloadBytes, _ := json.Marshal(settleRes.Payload)

		// 100% Atomic double deduction + settlement in a single transaction
		outcome, err := h.ledger.DoubleAndSettleBlackjackRound(r.Context(), activeRound.ID, p.UserID, activeRound.Revision, activeRound.Bet, settleRes.Payout, settleRes.ResultText, string(finalPayloadBytes))
		if errors.Is(err, ledger.ErrRevisionConflict) {
			JSONError(w, http.StatusConflict, "Akcja została już przetworzona.")
			return
		}
		if errors.Is(err, ledger.ErrInsufficientFunds) {
			JSONError(w, http.StatusBadRequest, "Za mało żetonów na podwojenie.")
			return
		}
		if err != nil {
			JSONError(w, http.StatusInternalServerError, "Błąd rozliczania podwojenia")
			return
		}

		if settleRes.Payout > 0 {
			h.broadcastWin(outcome.Round.ID, p.Nick, "blackjack", p.Avatar, settleRes.Payout, newBet, settleRes.ResultText)
		}

		JSON(w, http.StatusOK, map[string]interface{}{
			"ok":             true,
			"round":          ToPublicRound(outcome.Round),
			"balance":        outcome.Balance,
			"xp":             outcome.XP,
			"level":          outcome.Level,
			"roundsToday":    outcome.RoundsToday,
			"leveledUp":      outcome.LeveledUp,
			"levelUpBonus":   outcome.LevelUpBonus,
			"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
		})
		return
	}


	if move == "hit" {
		existing := append([]blackjack.Card{}, payload.Cards...)
		existing = append(existing, payload.Dealer...)
		payload.Cards = append(payload.Cards, blackjack.DrawUniqueCard(existing))
		cardVal := blackjack.HandValue(payload.Cards)


		if cardVal < 21 {
			newPayloadBytes, _ := json.Marshal(payload)
			err := h.ledger.UpdateActiveRoundPayload(r.Context(), activeRound.ID, p.UserID, activeRound.Revision, string(newPayloadBytes))
			if errors.Is(err, ledger.ErrRevisionConflict) {
				JSONError(w, http.StatusConflict, "Akcja została już przetworzona.")
				return
			}
			activeRound.Payload = string(newPayloadBytes)
			activeRound.Revision++
			JSON(w, http.StatusOK, map[string]interface{}{
				"ok":             true,
				"round":          ToPublicRound(activeRound),
				"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
			})
			return
		}
	}

	// "stand" or hit that reached >= 21
	settleRes := blackjack.SettleBlackjack(activeRound.Bet, *payload)
	finalPayloadBytes, _ := json.Marshal(settleRes.Payload)

	outcome, err := h.ledger.SettleActiveRound(r.Context(), activeRound.ID, p.UserID, settleRes.Payout, settleRes.ResultText, string(finalPayloadBytes))
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd rozliczania blackjacka")
		return
	}

	if settleRes.Payout > 0 {
		h.broadcastWin(outcome.Round.ID, p.Nick, "blackjack", p.Avatar, settleRes.Payout, activeRound.Bet, settleRes.ResultText)
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":             true,
		"round":          ToPublicRound(outcome.Round),
		"balance":        outcome.Balance,
		"xp":             outcome.XP,
		"level":          outcome.Level,
		"roundsToday":    outcome.RoundsToday,
		"leveledUp":      outcome.LeveledUp,
		"levelUpBonus":   outcome.LevelUpBonus,
		"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
	})
}

func (h *CasinoHandler) handleStartMines(w http.ResponseWriter, r *http.Request, p *ledger.Player, body map[string]interface{}) {
	betFloat, ok := body["bet"].(float64)
	if !ok {
		JSONError(w, http.StatusBadRequest, "Nieprawidłowa stawka.")
		return
	}
	bet := int64(betFloat)
	if err := anticheat.ValidateBet(bet, p.Balance); err != nil {
		JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	mineCount := 5
	if mc, ok := body["mines"].(float64); ok {
		mineCount = int(mc)
	}
	if err := anticheat.ValidateMinesStart(mineCount); err != nil {
		JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	minesPayload := mines.InitialStart(mineCount)
	payloadBytes, _ := json.Marshal(minesPayload)

	round, balAfterBet, err := h.ledger.StartActiveRound(r.Context(), p.UserID, "mines", bet, string(payloadBytes))
	if errors.Is(err, ledger.ErrActiveRoundExists) {
		JSONError(w, http.StatusConflict, "Najpierw dokończ aktywną rundę.")
		return
	}
	if errors.Is(err, ledger.ErrInsufficientFunds) {
		JSONError(w, http.StatusBadRequest, "Niewystarczające saldo żetonów.")
		return
	}
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd rozpoczynania gry Mines")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":             true,
		"round":          ToPublicRound(round),
		"balance":        balAfterBet,
		"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
	})
}

func (h *CasinoHandler) handleActMines(w http.ResponseWriter, r *http.Request, p *ledger.Player, body map[string]interface{}) {
	roundID, _ := body["roundId"].(string)
	move, _ := body["move"].(string)

	activeRound, err := h.ledger.GetActiveRound(r.Context(), p.UserID)
	if err != nil || activeRound == nil || activeRound.ID != roundID {
		JSONError(w, http.StatusNotFound, "Aktywna runda nie istnieje.")
		return
	}

	payload, err := mines.ParsePayload(activeRound.Payload)
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd odczytu stanu min")
		return
	}

	if move == "cashout" {
		if err := anticheat.ValidateMinesCashout(len(payload.Revealed)); err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		settleRes, err := mines.Cashout(activeRound.Bet, *payload)
		if err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		finalPayloadBytes, _ := json.Marshal(settleRes.Payload)
		outcome, err := h.ledger.SettleActiveRound(r.Context(), activeRound.ID, p.UserID, settleRes.Payout, settleRes.ResultText, string(finalPayloadBytes))
		if err != nil {
			JSONError(w, http.StatusInternalServerError, "Błąd wypłaty")
			return
		}

		if settleRes.Payout > 0 {
			h.broadcastWin(outcome.Round.ID, p.Nick, "mines", p.Avatar, settleRes.Payout, activeRound.Bet, settleRes.ResultText)
		}

		JSON(w, http.StatusOK, map[string]interface{}{
			"ok":             true,
			"round":          ToPublicRound(outcome.Round),
			"balance":        outcome.Balance,
			"xp":             outcome.XP,
			"level":          outcome.Level,
			"roundsToday":    outcome.RoundsToday,
			"leveledUp":      outcome.LeveledUp,
			"levelUpBonus":   outcome.LevelUpBonus,
			"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
		})
		return
	}

	// move == "reveal"
	tileFloat, ok := body["tile"].(float64)
	if !ok {
		JSONError(w, http.StatusBadRequest, "Wymagany parametr 'tile'.")
		return
	}
	tile := int(tileFloat)

	// Idempotent recovery: if tile is already revealed in the active round (e.g. duplicate retry), return current state gracefully
	for _, r := range payload.Revealed {
		if r == tile {
			JSON(w, http.StatusOK, map[string]interface{}{
				"ok":             true,
				"round":          ToPublicRound(activeRound),
				"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
			})
			return
		}
	}

	if err := anticheat.ValidateMinesReveal(tile, payload.Revealed); err != nil {
		JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	settled, settleRes, err := mines.RevealTile(activeRound.Bet, payload, tile)
	if err != nil {
		JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	if settled {
		finalPayloadBytes, _ := json.Marshal(settleRes.Payload)
		outcome, err := h.ledger.SettleActiveRound(r.Context(), activeRound.ID, p.UserID, settleRes.Payout, settleRes.ResultText, string(finalPayloadBytes))
		if err != nil {
			JSONError(w, http.StatusInternalServerError, "Błąd rozliczania miny")
			return
		}

		if settleRes.Payout > 0 {
			h.broadcastWin(outcome.Round.ID, p.Nick, "mines", p.Avatar, settleRes.Payout, activeRound.Bet, settleRes.ResultText)
		}

		JSON(w, http.StatusOK, map[string]interface{}{
			"ok":             true,
			"round":          ToPublicRound(outcome.Round),
			"balance":        outcome.Balance,
			"xp":             outcome.XP,
			"level":          outcome.Level,
			"roundsToday":    outcome.RoundsToday,
			"leveledUp":      outcome.LeveledUp,
			"levelUpBonus":   outcome.LevelUpBonus,
			"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
		})
		return
	}


	// Safe tile, game continues
	newPayloadBytes, _ := json.Marshal(payload)
	err = h.ledger.UpdateActiveRoundPayload(r.Context(), activeRound.ID, p.UserID, activeRound.Revision, string(newPayloadBytes))
	if errors.Is(err, ledger.ErrRevisionConflict) {
		JSONError(w, http.StatusConflict, "Akcja została już przetworzona.")
		return
	}

	activeRound.Payload = string(newPayloadBytes)
	activeRound.Revision++

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":             true,
		"round":          ToPublicRound(activeRound),
		"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
	})
}

func (h *CasinoHandler) handleStartCrash(w http.ResponseWriter, r *http.Request, p *ledger.Player, body map[string]interface{}) {
	betFloat, ok := body["bet"].(float64)
	if !ok {
		JSONError(w, http.StatusBadRequest, "Nieprawidłowa stawka.")
		return
	}
	bet := int64(betFloat)
	if err := anticheat.ValidateBet(bet, p.Balance); err != nil {
		JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	autoCashout, _ := body["auto_cashout"].(float64)
	if autoCashout < 1.00 {
		autoCashout, _ = body["target_multiplier"].(float64)
	}
	if autoCashout < 1.00 {
		autoCashout = 1000.00
	}
	if autoCashout > 10000.00 {
		autoCashout = 10000.00
	}

	isTurbo, _ := body["turbo"].(bool)
	flightSpeed := crash.FlightSpeed
	if isTurbo {
		flightSpeed = crash.FlightSpeed * 2.5
	}

	serverSeed, clientSeed, nonce, _, pfErr := h.ledger.GetAndIncrementNonce(r.Context(), p.UserID)
	var crashPoint float64
	if pfErr == nil && serverSeed != "" && clientSeed != "" {
		crashPoint = crash.GenerateCrashPointProvablyFair(serverSeed, clientSeed, nonce)
	} else {
		crashPoint = crash.GenerateCrashPoint()
	}
	startedAt := time.Now().UnixMilli()

	activePayload := crash.ActivePayload{
		CrashPoint:  crashPoint,
		AutoCashout: autoCashout,
		StartedAt:   startedAt,
		FlightSpeed: flightSpeed,
	}
	payloadBytes, _ := json.Marshal(activePayload)

	round, balAfterBet, err := h.ledger.StartActiveRound(r.Context(), p.UserID, "crash", bet, string(payloadBytes))
	if errors.Is(err, ledger.ErrActiveRoundExists) {
		JSONError(w, http.StatusConflict, "Masz już aktywną grę.")
		return
	}
	if errors.Is(err, ledger.ErrInsufficientFunds) {
		JSONError(w, http.StatusBadRequest, "Brak wystarczających środków na koncie.")
		return
	}
	if err != nil {
		h.reportBackendError("START_CRASH_ERROR", err, map[string]interface{}{"user_id": p.UserID, "bet": bet})
		JSONError(w, http.StatusInternalServerError, "Błąd uruchamiania gry Crash")
		return
	}

	// Auto-settle timer if player never sends cashout/settle
	var crashSec float64
	if crashPoint > 1.00 && flightSpeed > 0 {
		crashSec = math.Log(crashPoint) / flightSpeed
	}
	crashDuration := time.Duration(crashSec * float64(time.Second))
	if crashDuration < 50*time.Millisecond {
		crashDuration = 50 * time.Millisecond
	}
	roundID := round.ID
	userID := p.UserID
	time.AfterFunc(crashDuration, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		active, err := h.ledger.GetActiveRound(ctx, userID)
		if err == nil && active != nil && active.ID == roundID && active.Game == "crash" {
			finalPayload := crash.Payload{
				CrashPoint: crashPoint,
				CashedAt:   0,
				Won:        false,
				Multiplier: 0,
			}
			b, _ := json.Marshal(finalPayload)
			outcome, err := h.ledger.SettleActiveRound(ctx, roundID, userID, 0, fmt.Sprintf("Rakieta rozbiła się przy %.2fx - Przegrana", crashPoint), string(b))
			if err == nil {
				h.hub.SendToUser(userID, ws.Event{
					Type: ws.EventRoundSettled,
					Payload: map[string]interface{}{
						"game":        "crash",
						"round_id":    roundID,
						"crashed":     true,
						"crash_point": crashPoint,
						"round":       ToPublicRound(outcome.Round),
						"balance":     outcome.Balance,
					},
				})
			}
		}
	})

	h.hub.SendToUser(p.UserID, ws.Event{
		Type: ws.EventBalanceUpdate,
		Payload: ws.BalanceUpdatePayload{
			Balance: balAfterBet,
			XP:      p.XP,
			Level:   p.Level,
		},
	})

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":             true,
		"round":          ToPublicRound(round),
		"balance":        balAfterBet,
		"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
	})
}

func (h *CasinoHandler) handleCashoutCrash(w http.ResponseWriter, r *http.Request, p *ledger.Player, body map[string]interface{}) {
	activeRound, err := h.ledger.GetActiveRound(r.Context(), p.UserID)
	if err != nil || activeRound == nil || activeRound.Game != "crash" {
		JSONError(w, http.StatusBadRequest, "Brak aktywnej gry Crash do wypłaty.")
		return
	}

	payload, err := crash.ParsePayload(activeRound.Payload)
	if err != nil {
		h.reportBackendError("CRASH_PAYLOAD_PARSE_ERROR", err, map[string]interface{}{"round_id": activeRound.ID})
		JSONError(w, http.StatusInternalServerError, "Błąd stanu gry Crash.")
		return
	}

	nowMs := time.Now().UnixMilli()
	elapsedSec := float64(nowMs-payload.StartedAt) / 1000.0

	var crashSec float64
	if payload.CrashPoint > 1.00 && payload.FlightSpeed > 0 {
		crashSec = math.Log(payload.CrashPoint) / payload.FlightSpeed
	}

	// Server calculates current multiplier with tight latency buffer (0.15s)
	maxAllowedMult := crash.MultiplierAtElapsed(elapsedSec+0.15, payload.FlightSpeed)

	// Client requested multiplier if provided
	reqMult, _ := body["requested_mult"].(float64)
	if reqMult < 1.00 {
		reqMult, _ = body["mult"].(float64)
	}
	cashedMult := maxAllowedMult
	if reqMult >= 1.00 && reqMult <= maxAllowedMult {
		cashedMult = math.Floor(reqMult*100.0) / 100.0
	}
	if payload.AutoCashout >= 1.00 && cashedMult > payload.AutoCashout {
		cashedMult = payload.AutoCashout
	}

	// Verify if crash already happened before cashout reached server
	won := true
	if elapsedSec > crashSec+0.15 || cashedMult > payload.CrashPoint {
		won = false
	}

	var payout int64
	var resultText string
	var finalMult float64

	if won {
		finalMult = cashedMult
		payout = int64(math.Floor(float64(activeRound.Bet) * finalMult))
		resultText = fmt.Sprintf("Wypłacono przy %.2fx (Rozbicie: %.2fx) - Wygrana ×%.2f!", finalMult, payload.CrashPoint, finalMult)
	} else {
		finalMult = 0
		payout = 0
		resultText = fmt.Sprintf("Rakieta rozbiła się przy %.2fx (Próba: %.2fx) - Przegrana", payload.CrashPoint, cashedMult)
	}

	finalPayload := crash.Payload{
		CrashPoint: payload.CrashPoint,
		CashedAt:   cashedMult,
		Won:        won,
		Multiplier: finalMult,
	}
	finalPayloadBytes, _ := json.Marshal(finalPayload)

	outcome, err := h.ledger.SettleActiveRound(r.Context(), activeRound.ID, p.UserID, payout, resultText, string(finalPayloadBytes))
	if err != nil {
		h.reportBackendError("SETTLE_CRASH_CASHOUT_ERROR", err, map[string]interface{}{"round_id": activeRound.ID})
		JSONError(w, http.StatusInternalServerError, "Błąd rozliczania wypłaty Crash")
		return
	}

	h.hub.SendToUser(p.UserID, ws.Event{
		Type: ws.EventBalanceUpdate,
		Payload: ws.BalanceUpdatePayload{
			Balance: outcome.Balance,
			XP:      outcome.XP,
			Level:   outcome.Level,
		},
	})

	if won && payout > activeRound.Bet {
		h.broadcastWin(outcome.Round.ID, p.Nick, "crash", p.Avatar, payout, activeRound.Bet, resultText)
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":             true,
		"round":          ToPublicRound(outcome.Round),
		"balance":        outcome.Balance,
		"xp":             outcome.XP,
		"level":          outcome.Level,
		"roundsToday":    outcome.RoundsToday,
		"leveledUp":      outcome.LeveledUp,
		"levelUpBonus":   outcome.LevelUpBonus,
		"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
	})
}

func (h *CasinoHandler) handleSettleCrash(w http.ResponseWriter, r *http.Request, p *ledger.Player, body map[string]interface{}) {
	activeRound, err := h.ledger.GetActiveRound(r.Context(), p.UserID)
	if err != nil || activeRound == nil || activeRound.Game != "crash" {
		JSONError(w, http.StatusBadRequest, "Brak aktywnej gry Crash.")
		return
	}

	payload, err := crash.ParsePayload(activeRound.Payload)
	if err != nil {
		h.reportBackendError("CRASH_PAYLOAD_PARSE_ERROR", err, map[string]interface{}{"round_id": activeRound.ID})
		JSONError(w, http.StatusInternalServerError, "Błąd stanu gry Crash.")
		return
	}

	won := payload.AutoCashout >= 1.00 && payload.AutoCashout <= payload.CrashPoint

	var payout int64
	var resultText string
	var finalMult float64

	if won {
		finalMult = payload.AutoCashout
		payout = int64(math.Floor(float64(activeRound.Bet) * finalMult))
		resultText = fmt.Sprintf("Wypłacono przy %.2fx (Rozbicie: %.2fx) - Wygrana ×%.2f!", finalMult, payload.CrashPoint, finalMult)
	} else {
		finalMult = 0
		payout = 0
		resultText = fmt.Sprintf("Rakieta rozbiła się przy %.2fx - Przegrana", payload.CrashPoint)
	}

	finalPayload := crash.Payload{
		CrashPoint: payload.CrashPoint,
		CashedAt:   payload.AutoCashout,
		Won:        won,
		Multiplier: finalMult,
	}
	finalPayloadBytes, _ := json.Marshal(finalPayload)

	outcome, err := h.ledger.SettleActiveRound(r.Context(), activeRound.ID, p.UserID, payout, resultText, string(finalPayloadBytes))
	if err != nil {
		h.reportBackendError("SETTLE_CRASH_AUTO_ERROR", err, map[string]interface{}{"round_id": activeRound.ID})
		JSONError(w, http.StatusInternalServerError, "Błąd finalizacji gry Crash")
		return
	}

	h.hub.SendToUser(p.UserID, ws.Event{
		Type: ws.EventBalanceUpdate,
		Payload: ws.BalanceUpdatePayload{
			Balance: outcome.Balance,
			XP:      outcome.XP,
			Level:   outcome.Level,
		},
	})

	if won && payout > activeRound.Bet {
		h.broadcastWin(outcome.Round.ID, p.Nick, "crash", p.Avatar, payout, activeRound.Bet, resultText)
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":             true,
		"round":          ToPublicRound(outcome.Round),
		"balance":        outcome.Balance,
		"xp":             outcome.XP,
		"level":          outcome.Level,
		"roundsToday":    outcome.RoundsToday,
		"leveledUp":      outcome.LeveledUp,
		"levelUpBonus":   outcome.LevelUpBonus,
		"next_challenge": anticheat.GenerateBrowserChallenge(p.UserID, h.sessionSecret),
	})
}

// GetProvablyFairSeed handles GET /api/casino/provably-fair
func (h *CasinoHandler) GetProvablyFairSeed(w http.ResponseWriter, r *http.Request) {
	p := auth.GetPlayerFromContext(r.Context())
	if p == nil {
		JSONError(w, http.StatusUnauthorized, "Zaloguj się, aby zobaczyć stan Provably Fair.")
		return
	}

	seed, err := h.ledger.GetActiveProvablyFairSeed(r.Context(), p.UserID)
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd pobierania seeda Provably Fair")
		return
	}

	// Active server seed must remain hidden (only server hash is public)
	publicSeed := map[string]interface{}{
		"id":          seed.ID,
		"server_hash": seed.ServerHash,
		"client_seed": seed.ClientSeed,
		"nonce":       seed.Nonce,
		"created_at":  seed.CreatedAt,
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":   true,
		"seed": publicSeed,
	})
}

// RotateProvablyFairSeed handles POST /api/casino/provably-fair/rotate
func (h *CasinoHandler) RotateProvablyFairSeed(w http.ResponseWriter, r *http.Request) {
	p := auth.GetPlayerFromContext(r.Context())
	if p == nil {
		JSONError(w, http.StatusUnauthorized, "Zaloguj się, aby obrócić seed Provably Fair.")
		return
	}

	var req struct {
		ClientSeed string `json:"client_seed"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	revealed, newActive, err := h.ledger.RotateProvablyFairSeed(r.Context(), p.UserID, req.ClientSeed)
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd rotacji seeda Provably Fair")
		return
	}

	resp := map[string]interface{}{
		"ok": true,
		"active_seed": map[string]interface{}{
			"id":          newActive.ID,
			"server_hash": newActive.ServerHash,
			"client_seed": newActive.ClientSeed,
			"nonce":       newActive.Nonce,
			"created_at":  newActive.CreatedAt,
		},
	}
	if revealed != nil {
		resp["revealed_previous_seed"] = map[string]interface{}{
			"id":          revealed.ID,
			"server_seed": revealed.ServerSeed,
			"server_hash": revealed.ServerHash,
			"client_seed": revealed.ClientSeed,
			"nonce":       revealed.Nonce,
			"created_at":  revealed.CreatedAt,
			"revealed_at": revealed.RevealedAt,
		}
	}

	JSON(w, http.StatusOK, resp)
}

