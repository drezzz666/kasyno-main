package discordbot

import (
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
