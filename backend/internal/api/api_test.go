package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

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
