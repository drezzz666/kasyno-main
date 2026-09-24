package discordbot

import (
	"strings"
	"testing"
)

func TestIsAllUsersIdentifier(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		{"*", true},
		{"all", true},
		{"wszyscy", true},
		{"@everyone", true},
		{"everyone", true},
		{"@here", true},
		{"global", true},
		{"gracz1", false},
		{"user123", false},
		{"gracz1, gracz2, gracz3", false},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			res := isAllUsersIdentifier(tt.input)
			if res != tt.expected {
				t.Errorf("isAllUsersIdentifier(%q) = %v, want %v", tt.input, res, tt.expected)
			}
		})
	}
}

func TestFormatFGT(t *testing.T) {
	tests := []struct {
		amount   int64
		expected string
	}{
		{0, "0 $FGT"},
		{500, "500 $FGT"},
		{1000, "1,000 $FGT"},
		{1000000, "1,000,000 $FGT"},
		{-500, "-500 $FGT"},
		{-1234567, "-1,234,567 $FGT"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			res := formatFGT(tt.amount)
			if res != tt.expected {
				t.Errorf("formatFGT(%d) = %q, want %q", tt.amount, res, tt.expected)
			}
		})
	}
}

func TestSlashCommandNames(t *testing.T) {
	if len(slashCommands) == 0 {
		t.Fatal("expected slash commands to be registered")
	}
	for _, cmd := range slashCommands {
		if cmd.Name == "" {
			t.Error("slash command has empty name")
		}
		if strings.HasPrefix(cmd.Name, "casino-") {
			t.Errorf("command %s still has legacy 'casino-' prefix", cmd.Name)
		}
		if cmd.Description == "" {
			t.Errorf("command %s has empty description", cmd.Name)
		}
	}
}

func TestMultiPlayerParsing(t *testing.T) {
	input := "alice, bob, charlie, alice,   david  "
	rawParts := strings.Split(input, ",")
	var players []string
	seen := make(map[string]bool)
	for _, p := range rawParts {
		clean := strings.TrimSpace(p)
		if clean != "" && !seen[strings.ToLower(clean)] {
			seen[strings.ToLower(clean)] = true
			players = append(players, clean)
		}
	}

	expected := []string{"alice", "bob", "charlie", "david"}
	if len(players) != len(expected) {
		t.Fatalf("expected %d players, got %d (%v)", len(expected), len(players), players)
	}
	for idx, name := range expected {
		if players[idx] != name {
			t.Errorf("player[%d] = %s, want %s", idx, players[idx], name)
		}
	}
}

func TestParseRevertTimestamp(t *testing.T) {
	tests := []struct {
		input       string
		shouldError bool
	}{
		{"10m", false},
		{"1h", false},
		{"24h", false},
		{"2d", false},
		{"15:30", false},
		{"15:30:45", false},
		{"2026-09-24 14:00", false},
		{"2026-09-24 14:00:00", false},
		{"2026-09-24 15:30:45", false},
		{"24.09.2026 14:00", false},
		{"24.09.2026 15:30:45", false},
		{"24-09-2026", false},
		{"24-09-2026 15:30:45", false},
		{"24-09-2026 14:00", false},
		{"24/09/2026 14:00", false},
		{"24/09/2026 15:30:45", false},
		{"today 15:30:00", false},
		{"dzisiaj 14:00:15", false},
		{"yesterday 20:00:00", false},
		{"wczoraj 18:30:00", false},
		{"2026-09-24", false},
		{"invalid-time-format-xyz", true},
		{"", true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			parsed, err := parseRevertTimestamp(tt.input)
			if tt.shouldError && err == nil {
				t.Errorf("parseRevertTimestamp(%q) expected error, got %v", tt.input, parsed)
			}
			if !tt.shouldError && err != nil {
				t.Errorf("parseRevertTimestamp(%q) unexpected error: %v", tt.input, err)
			}
		})
	}
}


