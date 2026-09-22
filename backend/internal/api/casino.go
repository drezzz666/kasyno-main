package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

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
	"github.com/drezzz666/kasyno/backend/internal/ws"
)

type CasinoHandler struct {
	ledger      *ledger.Service
	hub         *ws.Hub
	userLocks   *anticheat.UserLockManager
	rateLimiter *anticheat.RateLimiter
}

func NewCasinoHandler(ledgerService *ledger.Service, wsHub *ws.Hub) *CasinoHandler {
	return &CasinoHandler{
		ledger:      ledgerService,
		hub:         wsHub,
		userLocks:   anticheat.NewUserLockManager(),
		rateLimiter: anticheat.NewRateLimiter(),
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

// MaskActivePayload ensures dealer hole cards and hidden mines are never leaked during active game state
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
	leaders, _ := h.ledger.GetLeaderboard(r.Context(), 5)
	missions, missionNextReset, _ := h.ledger.GetDailyMissions(r.Context(), p.UserID)
	recentWins, _ := h.ledger.GetRecentGlobalWins(r.Context(), 15)

	resp := map[string]interface{}{
		"player":           p,
		"active":           ToPublicRound(activeRound),
		"history":          historyResp.Entries,
		"hasMoreHistory":   historyResp.HasMore,
		"roundsToday":      roundsToday,
		"missionClaimed":   missionClaimed,
		"missionReward":    250,
		"missions":         missions,
		"missionNextReset": missionNextReset,
		"leaders":          leaders,
		"today":            today,
		"recentWins":       recentWins,
	}

	JSON(w, http.StatusOK, resp)
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

	// 1. Anti-Cheat: Flood Protection (generous token bucket: 15 req/s sustained, burst 30)
	if !h.rateLimiter.Allow(p.UserID) {
		JSONError(w, http.StatusTooManyRequests, "Zbyt szybkie żądania. Zwolnij tempo.")
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

	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		JSONError(w, http.StatusBadRequest, "Nieprawidłowy format JSON")
		return
	}

	action, _ := body["action"].(string)

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
		"ok":      true,
		"amount":  amount,
		"balance": newBal,
		"streak":  streak,
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
	})
}

func (h *CasinoHandler) handleInstantGame(w http.ResponseWriter, r *http.Request, p *ledger.Player, body map[string]interface{}) {
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

	var payout int64
	var resultText string
	var payloadBytes []byte

	if game == "roulette" {
		choice, _ := body["choice"].(string)
		if choice == "" {
			choice = "red"
		}
		if err := anticheat.ValidateRouletteChoice(choice); err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		res, err := roulette.PlayRoulette(bet, choice)
		if err != nil {
			JSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		payout = res.Payout
		resultText = res.ResultText
		payloadBytes, _ = json.Marshal(res.Payload)
	} else if game == "slots" {
		res, err := slots.PlaySlots(bet)
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
		res, err := coinflip.PlayCoinflip(bet, choice)
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
		res, err := rps.PlayRPS(bet, choice)
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
		res, err := plinko.PlayPlinko(bet, rows, risk)
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
		res, err := limbo.PlayLimbo(bet, targetMult)
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
		res, err := crash.PlayCrash(bet, targetMult)
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
	if errors.Is(err, ledger.ErrInsufficientFunds) {
		JSONError(w, http.StatusBadRequest, "Niewystarczające saldo żetonów.")
		return
	}
	if err != nil {
		JSONError(w, http.StatusInternalServerError, "Błąd rozliczania rundy")
		return
	}

	// Broadcast wins to all live players
	if payout > 0 {
		h.broadcastWin(outcome.Round.ID, p.Nick, game, payout, bet, resultText)
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":          true,
		"round":       ToPublicRound(outcome.Round),
		"balance":     outcome.Balance,
		"xp":          outcome.XP,
		"level":       outcome.Level,
		"roundsToday": outcome.RoundsToday,
	})
}

func (h *CasinoHandler) broadcastWin(roundID, nick, game string, payout, bet int64, resultText string) {
	if payout > 0 {
		h.hub.Broadcast(ws.Event{
			Type: ws.EventGlobalWin,
			Payload: ws.GlobalWinPayload{
				ID:        roundID,
				Nick:      nick,
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
				h.broadcastWin(outcome.Round.ID, p.Nick, "blackjack", settleRes.Payout, bet, settleRes.ResultText)
			}
			JSON(w, http.StatusOK, map[string]interface{}{
				"ok":          true,
				"round":       ToPublicRound(outcome.Round),
				"balance":     outcome.Balance,
				"xp":          outcome.XP,
				"level":       outcome.Level,
				"roundsToday": outcome.RoundsToday,
			})
			return
		}
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":      true,
		"round":   ToPublicRound(round),
		"balance": balAfterBet,
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

		payload.Cards = append(payload.Cards, blackjack.RandomCard())
		newBet := activeRound.Bet * 2

		settleRes := blackjack.SettleBlackjack(newBet, *payload)
		finalPayloadBytes, _ := json.Marshal(settleRes.Payload)

		// Atomic double deduction + settlement
		_, err = h.ledger.DoubleBlackjackBet(r.Context(), activeRound.ID, p.UserID, activeRound.Revision, activeRound.Bet, string(finalPayloadBytes))
		if errors.Is(err, ledger.ErrRevisionConflict) {
			JSONError(w, http.StatusConflict, "Akcja została już przetworzona.")
			return
		}

		outcome, err := h.ledger.SettleActiveRound(r.Context(), activeRound.ID, p.UserID, settleRes.Payout, settleRes.ResultText, string(finalPayloadBytes))
		if err != nil {
			JSONError(w, http.StatusInternalServerError, "Błąd rozliczania podwojenia")
			return
		}

		if settleRes.Payout > 0 {
			h.broadcastWin(outcome.Round.ID, p.Nick, "blackjack", settleRes.Payout, newBet, settleRes.ResultText)
		}

		JSON(w, http.StatusOK, map[string]interface{}{
			"ok":          true,
			"round":       ToPublicRound(outcome.Round),
			"balance":     outcome.Balance,
			"xp":          outcome.XP,
			"level":       outcome.Level,
			"roundsToday": outcome.RoundsToday,
		})
		return
	}

	if move == "hit" {
		payload.Cards = append(payload.Cards, blackjack.RandomCard())
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
				"ok":    true,
				"round": ToPublicRound(activeRound),
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
		h.broadcastWin(outcome.Round.ID, p.Nick, "blackjack", settleRes.Payout, activeRound.Bet, settleRes.ResultText)
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"ok":          true,
		"round":       ToPublicRound(outcome.Round),
		"balance":     outcome.Balance,
		"xp":          outcome.XP,
		"level":       outcome.Level,
		"roundsToday": outcome.RoundsToday,
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
		"ok":      true,
		"round":   ToPublicRound(round),
		"balance": balAfterBet,
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
			h.broadcastWin(outcome.Round.ID, p.Nick, "mines", settleRes.Payout, activeRound.Bet, settleRes.ResultText)
		}

		JSON(w, http.StatusOK, map[string]interface{}{
			"ok":          true,
			"round":       ToPublicRound(outcome.Round),
			"balance":     outcome.Balance,
			"xp":          outcome.XP,
			"level":       outcome.Level,
			"roundsToday": outcome.RoundsToday,
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
			h.broadcastWin(outcome.Round.ID, p.Nick, "mines", settleRes.Payout, activeRound.Bet, settleRes.ResultText)
		}

		JSON(w, http.StatusOK, map[string]interface{}{
			"ok":          true,
			"round":       ToPublicRound(outcome.Round),
			"balance":     outcome.Balance,
			"xp":          outcome.XP,
			"level":       outcome.Level,
			"roundsToday": outcome.RoundsToday,
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
		"ok":    true,
		"round": ToPublicRound(activeRound),
	})
}
