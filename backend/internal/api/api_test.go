package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/drezzz666/kasyno/backend/internal/anticheat"
	"github.com/drezzz666/kasyno/backend/internal/auth"
	"github.com/drezzz666/kasyno/backend/internal/config"
	"github.com/drezzz666/kasyno/backend/internal/games/blackjack"
	"github.com/drezzz666/kasyno/backend/internal/games/mines"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
)

func TestJSONHelpers(t *testing.T) {
	rec := httptest.NewRecorder()
	JSON(rec, http.StatusOK, map[string]string{"test": "val"})
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if rec.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Errorf("expected JSON header, got %s", rec.Header().Get("Content-Type"))
	}

	recErr := httptest.NewRecorder()
	JSONError(recErr, http.StatusBadRequest, "Invalid parameter")
	if recErr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", recErr.Code)
	}
	var errBody map[string]string
	_ = json.NewDecoder(recErr.Body).Decode(&errBody)
	if errBody["error"] != "Invalid parameter" {
		t.Errorf("expected error message 'Invalid parameter', got %s", errBody["error"])
	}
}

func TestMaskActivePayload(t *testing.T) {
	// 1. Blackjack dealer card masking
	deal := blackjack.InitialDeal()
	dealBytes, _ := json.Marshal(deal)
	maskedBJ := MaskActivePayload("blackjack", string(dealBytes))
	bjPayload, ok := maskedBJ.(blackjack.Payload)
	if !ok {
		t.Fatalf("expected blackjack.Payload type")
	}
	if len(bjPayload.Dealer) > 1 && bjPayload.Dealer[1].Rank != "?" {
		t.Errorf("expected dealer hole card to be masked with '?', got %s", bjPayload.Dealer[1].Rank)
	}

	// 2. Mines bomb location masking
	minesPayload := mines.Payload{
		MineCount: 5,
		Mines:     mines.GenerateMines(5),
		Revealed:  []int{0, 1},
	}
	minesBytes, _ := json.Marshal(minesPayload)
	maskedMines := MaskActivePayload("mines", string(minesBytes))
	mPayload, ok := maskedMines.(mines.Payload)
	if !ok {
		t.Fatalf("expected mines.Payload type")
	}
	if len(mPayload.Mines) != 0 {
		t.Errorf("expected active mines array to be hidden, got %v", mPayload.Mines)
	}

}

func TestToPublicRound(t *testing.T) {
	if ToPublicRound(nil) != nil {
		t.Errorf("expected nil for nil round")
	}

	r := &ledger.GameRound{
		ID:        "round_test_1",
		UserID:    "user_123",
		Game:      "coinflip",
		State:     "settled",
		Bet:       100,
		Payout:    198,
		Result:    "Wygrana",
		Payload:   `{"choice":"heads","outcome":"heads","won":true,"multiplier":1.98}`,
		Revision:  1,
		CreatedAt: 100000,
	}

	pub := ToPublicRound(r)
	if pub.ID != "round_test_1" || pub.Payout != 198 || pub.Game != "coinflip" {
		t.Errorf("unexpected public round mapping: %+v", pub)
	}
}

func TestVerifyEndpoint(t *testing.T) {
	cfg := &config.Config{
		SessionSecret: "test-secret-32-chars-long-at-least-123456",
	}
	handler := NewAuthHandler(cfg, nil, nil)

	// 1. Unauthenticated request -> 401
	reqUnauth := httptest.NewRequest("GET", "/api/auth/verify", nil)
	recUnauth := httptest.NewRecorder()
	handler.Verify(recUnauth, reqUnauth)
	if recUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauthenticated request, got %d", recUnauth.Code)
	}

	// 2. Authenticated request with valid signed cookie -> 200
	user := auth.SessionUser{
		UserID: "user_test_123",
		Email:  "test@example.com",
		Nick:   "Tester",
	}
	token, err := auth.SignSession(user, cfg.SessionSecret)
	if err != nil {
		t.Fatalf("failed to sign session: %v", err)
	}

	reqAuth := httptest.NewRequest("GET", "/api/auth/verify", nil)
	reqAuth.AddCookie(&http.Cookie{
		Name:  auth.CookieName,
		Value: token,
	})
	recAuth := httptest.NewRecorder()
	handler.Verify(recAuth, reqAuth)
	if recAuth.Code != http.StatusOK {
		t.Errorf("expected 200 for authenticated request, got %d", recAuth.Code)
	}
}

func TestOpaqueReplayAndChallengeResponses(t *testing.T) {
	secret := "test-secret-key-12345"
	userID := "user_replay_test"

	// 1. Generate challenge
	c := anticheat.GenerateBrowserChallenge(userID, secret)

	// 2. Solve challenge
	solvedNonce := ""
	prefix := "000"
	for i := 0; ; i++ {
		nonceCand := string(rune('0' + (i % 10)))
		nonceCand = strconv.Itoa(i)
		h := sha256.Sum256([]byte(c.ID + ":" + c.Salt + ":" + nonceCand))
		if strings.HasPrefix(hex.EncodeToString(h[:]), prefix) {
			solvedNonce = nonceCand
			break
		}
	}

	proofHeader := c.ID + ":" + c.Salt + ":" + strconv.FormatInt(c.IssuedAt, 10) + ":" + strconv.Itoa(c.Difficulty) + ":" + c.Signature + ":" + solvedNonce

	// 3. First verification -> PASS
	if err := anticheat.VerifyBrowserProof(userID, secret, proofHeader); err != nil {
		t.Fatalf("first verification failed: %v", err)
	}

	// 4. Second verification (Replay Attack) -> FAIL with ErrChallengeReused
	err := anticheat.VerifyBrowserProof(userID, secret, proofHeader)
	if err != anticheat.ErrChallengeReused {
		t.Fatalf("expected ErrChallengeReused on replay, got: %v", err)
	}
}
