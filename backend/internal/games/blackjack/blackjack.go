package blackjack

import (
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/drezzz666/kasyno/backend/internal/games/provablyfair"
)

var ranks = []string{"A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"}
var suits = []string{"♠", "♥", "♦", "♣"}

type Card struct {
	Rank string `json:"rank"`
	Suit string `json:"suit"`
}

type Payload struct {
	Cards   []Card   `json:"cards"`
	Dealer  []Card   `json:"dealer"`
	Actions []string `json:"actions,omitempty"`
}

type SettleResult struct {
	State      string  `json:"state"`
	Bet        int64   `json:"bet"`
	Payout     int64   `json:"payout"`
	ResultText string  `json:"result"`
	Payload    Payload `json:"payload"`
}

func RandomCard() Card {
	rIdx := provablyfair.MustCryptoRandInt(len(ranks))
	sIdx := provablyfair.MustCryptoRandInt(len(suits))
	return Card{Rank: ranks[rIdx], Suit: suits[sIdx]}
}

// HandValue calculates standard blackjack hand score with Ace adjustment
func HandValue(cards []Card) int {
	score := 0
	aces := 0

	for _, c := range cards {
		if c.Rank == "A" {
			score += 11
			aces++
		} else if c.Rank == "J" || c.Rank == "Q" || c.Rank == "K" {
			score += 10
		} else if n, err := strconv.Atoi(c.Rank); err == nil {
			score += n
		}
	}

	for score > 21 && aces > 0 {
		score -= 10
		aces--
	}
	return score
}

// IsNaturalBlackjack checks if 2-card hand is 21
func IsNaturalBlackjack(cards []Card) bool {
	return len(cards) == 2 && HandValue(cards) == 21
}

// InitialDeal deals 2 cards to player and 2 cards to dealer
func InitialDeal() Payload {
	return Payload{
		Cards:   []Card{RandomCard(), RandomCard()},
		Dealer:  []Card{RandomCard(), RandomCard()},
		Actions: []string{"hit", "stand", "double"},
	}
}

// MaskDealerCard hides the dealer hole card for active game state
func MaskDealerCard(p Payload) Payload {
	masked := p
	if len(p.Dealer) > 1 {
		masked.Dealer = []Card{
			p.Dealer[0],
			{Rank: "?", Suit: ""},
		}
	}
	return masked
}

// FinishDealerDraws draws cards for the dealer until value >= 17 (only if player didn't bust)
func FinishDealerDraws(dealerCards []Card, playerBusted bool) []Card {
	res := make([]Card, len(dealerCards))
	copy(res, dealerCards)

	if playerBusted {
		return res
	}

	for HandValue(res) < 17 {
		res = append(res, RandomCard())
	}
	return res
}

// SettleBlackjack evaluates the outcome and calculates payout
func SettleBlackjack(bet int64, payload Payload) *SettleResult {
	playerVal := HandValue(payload.Cards)
	playerBust := playerVal > 21

	finalDealer := FinishDealerDraws(payload.Dealer, playerBust)
	dealerVal := HandValue(finalDealer)
	dealerBust := dealerVal > 21

	playerNatural := IsNaturalBlackjack(payload.Cards)
	dealerNatural := IsNaturalBlackjack(payload.Dealer)

	var payout int64 = 0
	resultText := "Przegrana"

	if playerBust {
		payout = 0
		resultText = "Fura (przegrana)"
	} else if playerNatural && dealerNatural {
		payout = bet
		resultText = "Remis (Blackjack u obu)"
	} else if playerNatural {
		// Natural Blackjack pays 3:2 (2.5x total returned)
		payout = int64(float64(bet) * 2.5)
		resultText = "Blackjack 3:2!"
	} else if dealerBust {
		payout = bet * 2
		resultText = "Wygrana (krupier fura)"
	} else if playerVal > dealerVal {
		payout = bet * 2
		resultText = "Wygrana"
	} else if playerVal == dealerVal {
		payout = bet
		resultText = "Remis"
	} else {
		payout = 0
		resultText = "Przegrana"
	}

	payload.Dealer = finalDealer
	payload.Actions = nil

	return &SettleResult{
		State:      "settled",
		Bet:        bet,
		Payout:     payout,
		ResultText: resultText,
		Payload:    payload,
	}
}

// ParsePayload deserializes JSON string into Payload
func ParsePayload(jsonStr string) (*Payload, error) {
	var p Payload
	if err := json.Unmarshal([]byte(jsonStr), &p); err != nil {
		return nil, fmt.Errorf("invalid blackjack payload: %w", err)
	}
	return &p, nil
}
