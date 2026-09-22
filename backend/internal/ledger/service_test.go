package ledger

import (
	"testing"
	"time"
)

func TestDailyBonusAmount(t *testing.T) {
	tests := []struct {
		streak   int
		expected int64
	}{
		{streak: 0, expected: 100},
		{streak: 1, expected: 150},
		{streak: 5, expected: 350},
		{streak: 18, expected: 1000},
		{streak: 50, expected: 1000}, // Max bonus cap is 1000
	}

	for _, tt := range tests {
		got := DailyBonusAmount(tt.streak)
		if got != tt.expected {
			t.Errorf("streak %d: expected %d, got %d", tt.streak, tt.expected, got)
		}
	}
}

func TestGetMissionWindow(t *testing.T) {
	// Fixed test time: 2026-09-22 14:30:00 UTC (slot 2: 12:00 -> 18:00)
	fixedTime := time.Date(2026, 9, 22, 14, 30, 0, 0, time.UTC)
	startMs, nextResetMs, periodKey := GetMissionWindow(fixedTime)

	expectedStart := time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC).UnixMilli()
	expectedReset := time.Date(2026, 9, 22, 18, 0, 0, 0, time.UTC).UnixMilli()
	expectedKey := "2026-09-22_12h"

	if startMs != expectedStart {
		t.Errorf("expected start %d, got %d", expectedStart, startMs)
	}
	if nextResetMs != expectedReset {
		t.Errorf("expected nextReset %d, got %d", expectedReset, nextResetMs)
	}
	if periodKey != expectedKey {
		t.Errorf("expected periodKey %s, got %s", expectedKey, periodKey)
	}
}

func TestGetActiveMissionsForWindow(t *testing.T) {
	missions1 := getActiveMissionsForWindow("2026-09-22_12h")
	missions2 := getActiveMissionsForWindow("2026-09-22_12h")

	if len(missions1) != 4 {
		t.Errorf("expected 4 active missions, got %d", len(missions1))
	}

	// Deterministic selection check
	for i := range missions1 {
		if missions1[i].ID != missions2[i].ID {
			t.Errorf("expected deterministic mission list for identical periodKey")
		}
	}
}
