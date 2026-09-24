package api

import (
	"encoding/json"
	"math"
	"testing"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/games/blackjack"
	"github.com/drezzz666/kasyno/backend/internal/games/chicken"
	"github.com/drezzz666/kasyno/backend/internal/games/coinflip"
	"github.com/drezzz666/kasyno/backend/internal/games/crash"
	"github.com/drezzz666/kasyno/backend/internal/games/limbo"
	"github.com/drezzz666/kasyno/backend/internal/games/mines"
	"github.com/drezzz666/kasyno/backend/internal/games/plinko"
	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
	"github.com/drezzz666/kasyno/backend/internal/games/roulette"
	"github.com/drezzz666/kasyno/backend/internal/games/rps"
	"github.com/drezzz666/kasyno/backend/internal/games/slots"
)

// 1. GAME: COINFLIP (HEADS / TAILS)
func TestGameCoinflip_InteractiveSimulation(t *testing.T) {
	for _, choice := range []string{"heads", "tails"} {
		res, err := coinflip.PlayCoinflip(100, choice)
		if err != nil {
			t.Fatalf("coinflip: unexpected error: %v", err)
		}
		if res.Payload.Choice != choice {
			t.Fatalf("coinflip: invalid choice recorded %s", res.Payload.Choice)
		}
		if res.Payload.Outcome != "heads" && res.Payload.Outcome != "tails" {
			t.Fatalf("coinflip: invalid outcome %s", res.Payload.Outcome)
		}
		if res.Won {
			if res.Payout != 198 {
				t.Fatalf("coinflip: win payout error, got payout=%d", res.Payout)
			}
		} else {
			if res.Payout != 0 {
				t.Fatalf("coinflip: loss payout error, got payout=%d", res.Payout)
			}
		}
	}
}

// 2. GAME: ROCK PAPER SCISSORS (KPN)
func TestGameRPS_InteractiveSimulation(t *testing.T) {
	for _, choice := range []string{"rock", "paper", "scissors"} {
		res, err := rps.PlayRPS(100, choice)
		if err != nil {
			t.Fatalf("rps: unexpected error: %v", err)
		}
		if res.Payload.PlayerChoice != choice {
			t.Fatalf("rps: invalid choice recorded %s", res.Payload.PlayerChoice)
		}
		if res.Outcome == "win" {
			if res.Payout != 198 {
				t.Fatalf("rps: win payout error, got payout=%d", res.Payout)
			}
		} else if res.Outcome == "tie" { // Remis / Draw
			if res.Payout != 100 {
				t.Fatalf("rps: tie payout error, got payout=%d", res.Payout)
			}
		} else { // Loss
			if res.Payout != 0 {
				t.Fatalf("rps: loss payout error, got payout=%d", res.Payout)
			}
		}
	}
}

// 3. GAME: ROULETTE (EUROPEAN 37 NUMBERS)
func TestGameRoulette_InteractiveSimulation(t *testing.T) {
	// Test Straight Bet on number 17
	won17, payout17, mult17 := roulette.EvaluateSpin(17, "17", 10)
	if !won17 || mult17 != 36 || payout17 != 360 {
		t.Fatalf("roulette: straight win failed, got won=%v mult=%d payout=%d", won17, mult17, payout17)
	}
	wonMiss, payoutMiss, _ := roulette.EvaluateSpin(18, "17", 10)
	if wonMiss || payoutMiss != 0 {
		t.Fatalf("roulette: straight miss failed, got won=%v payout=%d", wonMiss, payoutMiss)
	}

	// Test Red / Black
	wonRed, payoutRed, multRed := roulette.EvaluateSpin(1, "red", 10) // 1 is Red
	if !wonRed || multRed != 2 || payoutRed != 20 {
		t.Fatalf("roulette: red win failed, got won=%v mult=%d payout=%d", wonRed, multRed, payoutRed)
	}

	// Test Green Zero
	wonZero, payoutZero, _ := roulette.EvaluateSpin(0, "red", 10)
	if wonZero || payoutZero != 0 {
		t.Fatalf("roulette: zero house edge failed, got won=%v payout=%d", wonZero, payoutZero)
	}
}

// 4. GAME: SLOTS (MIDNIGHT SLOTS 5 REELS)
func TestGameSlots_InteractiveSimulation(t *testing.T) {
	for i := 0; i < 50; i++ {
		res, err := slots.PlaySlots(50)
		if err != nil {
			t.Fatalf("slots: unexpected error: %v", err)
		}
		if len(res.Payload.Reels) != 5 {
			t.Fatalf("slots: expected 5 reels, got %d", len(res.Payload.Reels))
		}
		if res.Payload.Multiplier > 0 && res.Payout != int64(math.Floor(50.0*res.Payload.Multiplier)) {
			t.Fatalf("slots: payout math mismatch, mult=%f payout=%d", res.Payload.Multiplier, res.Payout)
		}
	}
}

// 5. GAME: PLINKO
func TestGamePlinko_InteractiveSimulation(t *testing.T) {
	risks := []string{"low", "medium", "high"}
	validRowsList := []int{14, 16}

	// 1. Test Valid Balanced Rows (14 and 16)
	for _, risk := range risks {
		for _, rows := range validRowsList {
			res, err := plinko.PlayPlinko(100, rows, risk)
			if err != nil {
				t.Fatalf("plinko: unexpected error: %v", err)
			}
			if len(res.Payload.Path) != rows {
				t.Fatalf("plinko: path length %d != rows %d", len(res.Payload.Path), rows)
			}
			if res.Payload.Slot < 0 || res.Payload.Slot > rows {
				t.Fatalf("plinko: invalid landing slot %d for rows %d", res.Payload.Slot, rows)
			}
			if res.Payload.Multiplier <= 0 {
				t.Fatalf("plinko: non-positive multiplier %f", res.Payload.Multiplier)
			}
			expectedPayout := int64(math.Floor(100.0 * res.Payload.Multiplier))
			if res.Payout != expectedPayout {
				t.Fatalf("plinko: payout math mismatch got %d want %d", res.Payout, expectedPayout)
			}
		}
	}

	// 2. Test Exploit Prevention: rows 8-13 must be rejected to prevent RTP > 100% drain
	for _, invalidRow := range []int{8, 9, 10, 11, 12, 13, 17, 20} {
		_, err := plinko.PlayPlinko(100, invalidRow, "low")
		if err == nil {
			t.Fatalf("plinko: expected error rejecting unsafe row count %d", invalidRow)
		}
	}
}

// 6. GAME: LIMBO
func TestGameLimbo_InteractiveSimulation(t *testing.T) {
	targets := []float64{1.50, 2.00, 10.00, 100.00, 10000.00}
	for _, target := range targets {
		res, err := limbo.PlayLimbo(10, target)
		if err != nil {
			t.Fatalf("limbo: unexpected error: %v", err)
		}
		if res.Payload.TargetMultiplier != target {
			t.Fatalf("limbo: target mismatch %f != %f", res.Payload.TargetMultiplier, target)
		}
		if res.Won {
			if res.Payload.ResultMultiplier < target {
				t.Fatalf("limbo: won with roll %f < target %f", res.Payload.ResultMultiplier, target)
			}
			expectedPayout := int64(math.Floor(10.0 * target))
			if res.Payout != expectedPayout {
				t.Fatalf("limbo: won payout mismatch %d != %d", res.Payout, expectedPayout)
			}
		} else {
			if res.Payload.ResultMultiplier >= target {
				t.Fatalf("limbo: lost with roll %f >= target %f", res.Payload.ResultMultiplier, target)
			}
			if res.Payout != 0 {
				t.Fatalf("limbo: lost payout != 0 (%d)", res.Payout)
			}
		}
	}
}

// 7. GAME: MINES (SAPER)
func TestGameMines_InteractiveSimulation(t *testing.T) {
	// 1. Start round with 3 mines
	mPayload := mines.InitialStart(3)
	if len(mPayload.Mines) != 3 {
		t.Fatalf("mines: expected 3 mines, got %d", len(mPayload.Mines))
	}
	if len(mPayload.Revealed) != 0 {
		t.Fatalf("mines: initial revealed should be empty")
	}

	// 2. Zero-Knowledge mask test: client MUST NOT see mine positions
	masked := mines.MaskMines(mPayload)
	if len(masked.Mines) != 0 {
		t.Fatalf("SECURITY LEAK: active mines payload leaked mine positions: %v", masked.Mines)
	}

	// 3. Find a safe tile and a mine tile
	mineSet := make(map[int]bool)
	for _, m := range mPayload.Mines {
		mineSet[m] = true
	}
	safeTile := -1
	mineTile := -1
	for i := 0; i < 25; i++ {
		if !mineSet[i] && safeTile == -1 {
			safeTile = i
		}
		if mineSet[i] && mineTile == -1 {
			mineTile = i
		}
	}

	// Reveal safe tile
	settled, settleRes, err := mines.RevealTile(100, &mPayload, safeTile)
	if err != nil {
		t.Fatalf("mines: error on safe reveal: %v", err)
	}
	if settled || settleRes != nil {
		t.Fatalf("mines: first safe tile should not settle round")
	}
	if mPayload.Multiplier <= 1.0 {
		t.Fatalf("mines: multiplier after safe reveal should be > 1.0, got %f", mPayload.Multiplier)
	}

	// Test Cashout on safe state
	cashRes, err := mines.Cashout(100, mPayload)
	if err != nil {
		t.Fatalf("mines: cashout error: %v", err)
	}
	if cashRes.State != "settled" {
		t.Fatalf("mines: cashout state should be settled")
	}
	if cashRes.Payout <= 100 {
		t.Fatalf("mines: cashout payout should be > bet")
	}

	// Test Hit Mine -> instant loss
	mPayload2 := mines.InitialStart(3)
	hitSettled, hitRes, err := mines.RevealTile(100, &mPayload2, mPayload2.Mines[0])
	if err != nil {
		t.Fatalf("mines: error on mine reveal: %v", err)
	}
	if !hitSettled || hitRes == nil || hitRes.Payout != 0 {
		t.Fatalf("mines: hit mine should settle round with 0 payout")
	}
}

// 8. GAME: CHICKEN CROSS
func TestGameChicken_InteractiveSimulation(t *testing.T) {
	difficulties := []string{"easy", "medium", "hard", "expert"}

	for _, diff := range difficulties {
		initP := chicken.InitialStart(diff)
		if initP.CurrentLane != 0 {
			t.Fatalf("chicken: start lane should be 0")
		}
		if initP.TotalLanes != 10 {
			t.Fatalf("chicken: total lanes should be 10")
		}
		if len(initP.Multipliers) != 10 {
			t.Fatalf("chicken: multipliers count should be 10")
		}

		// Verify Warmup Multipliers on Medium/Hard/Expert
		if diff == "medium" && initP.Multipliers[0] >= 1.0 {
			t.Fatalf("chicken: medium lane 0 multiplier %f should be < 1.0", initP.Multipliers[0])
		}
		if diff == "hard" && initP.Multipliers[0] >= 1.0 {
			t.Fatalf("chicken: hard lane 0 multiplier %f should be < 1.0", initP.Multipliers[0])
		}
		if diff == "expert" && initP.Multipliers[0] >= 1.0 {
			t.Fatalf("chicken: expert lane 0 multiplier %f should be < 1.0", initP.Multipliers[0])
		}

		// Zero-Knowledge mask test: active payload MUST NOT leak hazardLane / hazardType
		masked := chicken.MaskChicken(initP)
		if masked.HazardLane != 0 || masked.HazardType != "" {
			t.Fatalf("SECURITY LEAK: active chicken payload leaked hazard info")
		}

		// Test Step simulation
		settled, stepSettle, err := chicken.Step(100, &initP)
		if err != nil {
			t.Fatalf("chicken: step error: %v", err)
		}
		if !settled {
			if initP.CurrentLane != 1 {
				t.Fatalf("chicken: step 1 currentLane should be 1, got %d", initP.CurrentLane)
			}
			// Test Cashout
			cashRes, err := chicken.Cashout(100, initP)
			if err != nil {
				t.Fatalf("chicken: cashout error: %v", err)
			}
			if cashRes.State != "settled" {
				t.Fatalf("chicken: cashout state should be settled")
			}
		} else { // Hit vehicle on lane 1
			if stepSettle.Payout != 0 {
				t.Fatalf("chicken: collision payout should be 0, got %d", stepSettle.Payout)
			}
		}
	}
}

// 9. GAME: BLACKJACK 21
func TestGameBlackjack_InteractiveSimulation(t *testing.T) {
	deal := blackjack.InitialDeal()
	if len(deal.Cards) != 2 || len(deal.Dealer) != 2 {
		t.Fatalf("blackjack: initial deal card counts invalid")
	}

	// Zero-Knowledge mask test: dealer second card MUST be masked as '?'
	masked := blackjack.MaskDealerCard(deal)
	if masked.Dealer[1].Rank != "?" {
		t.Fatalf("SECURITY LEAK: dealer hole card rank not masked: %s", masked.Dealer[1].Rank)
	}

	// 1. Natural Blackjack (3:2 payout -> 2.5x total payout)
	natPayload := blackjack.Payload{
		Cards:  []blackjack.Card{{Rank: "A", Suit: "♠"}, {Rank: "K", Suit: "♠"}},
		Dealer: []blackjack.Card{{Rank: "9", Suit: "♥"}, {Rank: "8", Suit: "♦"}},
	}
	resNat := blackjack.SettleBlackjack(100, natPayload)
	if resNat.Payout != 250 { // 100 bet + 150 profit = 250
		t.Fatalf("blackjack: natural blackjack payout expected 250, got %d", resNat.Payout)
	}

	// 2. Dealer Stand on 17+
	dealerDraws := blackjack.FinishDealerDraws([]blackjack.Card{{Rank: "10", Suit: "♠"}, {Rank: "7", Suit: "♥"}}, false)
	if blackjack.HandValue(dealerDraws) < 17 {
		t.Fatalf("blackjack: dealer must stand on 17+, got %d", blackjack.HandValue(dealerDraws))
	}

	// 3. Player Bust
	bustPayload := blackjack.Payload{
		Cards:  []blackjack.Card{{Rank: "10", Suit: "♠"}, {Rank: "8", Suit: "♥"}, {Rank: "7", Suit: "♦"}}, // 25
		Dealer: []blackjack.Card{{Rank: "10", Suit: "♦"}, {Rank: "7", Suit: "♣"}},
	}
	resBust := blackjack.SettleBlackjack(100, bustPayload)
	if resBust.Payout != 0 {
		t.Fatalf("blackjack: bust payout expected 0, got %d", resBust.Payout)
	}
}

// 10. GAME: CRASH (ROCKET)
func TestGameCrash_InteractiveSimulation(t *testing.T) {
	// 1. Multiplier formula starts at 0.80x
	m0 := crash.MultiplierAtElapsed(0, crash.FlightSpeed)
	if m0 != 0.80 {
		t.Fatalf("crash: start multiplier at t=0 must be 0.80, got %f", m0)
	}

	m10 := crash.MultiplierAtElapsed(10, crash.FlightSpeed)
	expectedM10 := math.Floor(0.80*math.Exp(crash.FlightSpeed*10)*100.0) / 100.0
	if m10 != expectedM10 {
		t.Fatalf("crash: multiplier formula mismatch at t=10: got %f want %f", m10, expectedM10)
	}

	// 2. Zero-Knowledge mask: crash_point must NOT be exposed in Active state
	active := crash.ActivePayload{
		CrashPoint:  5.42,
		AutoCashout: 2.00,
		StartedAt:   time.Now().UnixMilli(),
		FlightSpeed: crash.FlightSpeed,
	}
	masked := crash.MaskActive(active)
	maskedBytes, _ := json.Marshal(masked)
	var maskedMap map[string]interface{}
	_ = json.Unmarshal(maskedBytes, &maskedMap)

	if _, exists := maskedMap["crash_point"]; exists {
		t.Fatalf("SECURITY LEAK: active crash payload exposed crash_point!")
	}

	// 3. PlayCrash evaluation with instant multiplier
	res, err := crash.PlayCrash(100, 2.00)
	if err != nil {
		t.Fatalf("crash: unexpected error: %v", err)
	}
	if res.Won {
		if res.Payout <= 0 || res.Payload.CashedAt != 2.00 {
			t.Fatalf("crash: cashout payout mismatch")
		}
	} else {
		if res.Payout != 0 {
			t.Fatalf("crash: loss payout != 0")
		}
	}
}

// 11. PROVABLY FAIR DETERMINISM ACROSS ALL GAMES
func TestProvablyFair_DeterminismAcrossRuns(t *testing.T) {
	serverSeed := "test_server_seed_9876543210abcdef"
	clientSeed := "test_client_seed_12345"
	nonce := int64(42)

	serverHash := provablyfair.HashServerSeed(serverSeed)
	if len(serverHash) != 64 {
		t.Fatalf("invalid server hash length: %d", len(serverHash))
	}

	float1 := provablyfair.GenerateFloat(serverSeed, clientSeed, nonce)
	float2 := provablyfair.GenerateFloat(serverSeed, clientSeed, nonce)
	if float1 != float2 || float1 < 0.0 || float1 >= 1.0 {
		t.Fatalf("provably fair float non-deterministic or out of range [0, 1): %f", float1)
	}

	int1 := provablyfair.GenerateInt(serverSeed, clientSeed, nonce, 37)
	int2 := provablyfair.GenerateInt(serverSeed, clientSeed, nonce, 37)
	if int1 != int2 || int1 < 0 || int1 >= 37 {
		t.Fatalf("provably fair int non-deterministic or out of range [0, 37): %d", int1)
	}
}
