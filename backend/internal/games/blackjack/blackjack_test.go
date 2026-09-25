package blackjack

import (
	"testing"
)

func TestHandValues(t *testing.T) {
	// Ace + King = 21 (Blackjack)
	bj := []Card{{Rank: "A", Suit: "♠"}, {Rank: "K", Suit: "♥"}}
	if HandValue(bj) != 21 {
		t.Errorf("expected 21, got %d", HandValue(bj))
	}
	if !IsNaturalBlackjack(bj) {
		t.Errorf("expected natural blackjack")
	}

	// Ace + Ace + 9 = 21
	softAce := []Card{{Rank: "A", Suit: "♠"}, {Rank: "A", Suit: "♥"}, {Rank: "9", Suit: "♦"}}
	if HandValue(softAce) != 21 {
		t.Errorf("expected 21 for A+A+9, got %d", HandValue(softAce))
	}

	// 10 + 7 + 8 = 25 (Bust)
	bust := []Card{{Rank: "10", Suit: "♠"}, {Rank: "7", Suit: "♥"}, {Rank: "8", Suit: "♦"}}
	if HandValue(bust) != 25 {
		t.Errorf("expected 25 for bust, got %d", HandValue(bust))
	}
}

func TestSettleNaturalBlackjack(t *testing.T) {
	p := Payload{
		Cards:  []Card{{Rank: "A", Suit: "♠"}, {Rank: "K", Suit: "♥"}},
		Dealer: []Card{{Rank: "10", Suit: "♣"}, {Rank: "9", Suit: "♦"}},
	}
	res := SettleBlackjack(100, p)
	if res.Payout != 250 {
		t.Errorf("expected 250 payout for 3:2 natural blackjack, got %d", res.Payout)
	}
}

func TestSettlePlayerBust(t *testing.T) {
	p := Payload{
		Cards:  []Card{{Rank: "10", Suit: "♠"}, {Rank: "8", Suit: "♥"}, {Rank: "5", Suit: "♦"}},
		Dealer: []Card{{Rank: "10", Suit: "♣"}, {Rank: "5", Suit: "♦"}},
	}
	res := SettleBlackjack(100, p)
	if res.Payout != 0 {
		t.Errorf("expected 0 payout for bust, got %d", res.Payout)
	}
	// Dealer should not draw when player busted
	if len(res.Payload.Dealer) != 2 {
		t.Errorf("dealer should not draw when player busted, got %d cards", len(res.Payload.Dealer))
	}
}

func TestSettlePush(t *testing.T) {
	p := Payload{
		Cards:  []Card{{Rank: "10", Suit: "♠"}, {Rank: "9", Suit: "♥"}},
		Dealer: []Card{{Rank: "10", Suit: "♣"}, {Rank: "9", Suit: "♦"}},
	}
	res := SettleBlackjack(100, p)
	if res.Payout != 100 {
		t.Errorf("expected push payout 100, got %d", res.Payout)
	}
}

func TestSettleDealerNaturalVsPlayerMultiCard21(t *testing.T) {
	// Dealer has natural blackjack (A + K = 21 in 2 cards)
	// Player has 21 with 3 cards (7 + 7 + 7 = 21)
	// Under standard casino rules, Dealer Natural Blackjack beats a 3-card 21 (Player loses)
	p := Payload{
		Cards:  []Card{{Rank: "7", Suit: "♠"}, {Rank: "7", Suit: "♥"}, {Rank: "7", Suit: "♦"}},
		Dealer: []Card{{Rank: "A", Suit: "♣"}, {Rank: "K", Suit: "♦"}},
	}
	res := SettleBlackjack(100, p)
	if res.Payout != 0 {
		t.Errorf("expected 0 payout (dealer natural beats 3-card 21), got %d (result: %s)", res.Payout, res.ResultText)
	}
}

