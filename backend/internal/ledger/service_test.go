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
		{streak: 0, expected: 200},
		{streak: 1, expected: 300},
		{streak: 5, expected: 700},
		{streak: 18, expected: 2000},
		{streak: 50, expected: 2000}, // Max bonus cap is 2000
	}

	for _, tt := range tests {
		got := DailyBonusAmount(tt.streak)
		if got != tt.expected {
			t.Errorf("streak %d: expected %d, got %d", tt.streak, tt.expected, got)
		}
	}
}

func TestDailyBonusStreakDateMath(t *testing.T) {
	tests := []struct {
		name          string
		lastBonusDay  string
		today         string
		initialStreak int
		expectedStreak int
	}{
		{
			name:           "Consecutive day standard",
			lastBonusDay:   "2026-09-23",
			today:          "2026-09-24",
			initialStreak:  3,
			expectedStreak: 4,
		},
		{
			name:           "Month transition (30 -> 1)",
			lastBonusDay:   "2026-09-30",
			today:          "2026-10-01",
			initialStreak:  5,
			expectedStreak: 6,
		},
		{
			name:           "Year transition (Dec 31 -> Jan 1)",
			lastBonusDay:   "2026-12-31",
			today:          "2027-01-01",
			initialStreak:  10,
			expectedStreak: 11,
		},
		{
			name:           "Skipped 1 day (Broken streak)",
			lastBonusDay:   "2026-09-21",
			today:          "2026-09-23",
			initialStreak:  5,
			expectedStreak: 1,
		},
		{
			name:           "Skipped many days",
			lastBonusDay:   "2026-01-01",
			today:          "2026-09-24",
			initialStreak:  20,
			expectedStreak: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			prevDate, err1 := time.Parse("2006-01-02", tt.lastBonusDay)
			todayDate, err2 := time.Parse("2006-01-02", tt.today)
			if err1 != nil || err2 != nil {
				t.Fatalf("date parse error: %v %v", err1, err2)
			}

			streak := 1
			if prevDate.AddDate(0, 0, 1).Equal(todayDate) {
				streak = tt.initialStreak + 1
			}

			if streak != tt.expectedStreak {
				t.Errorf("expected streak %d, got %d", tt.expectedStreak, streak)
			}
		})
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
