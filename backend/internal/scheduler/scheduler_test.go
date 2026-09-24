package scheduler

import (
	"testing"
	"time"
)

func TestBuildSchedule(t *testing.T) {
	tz := "Europe/Warsaw"

	tests := []struct {
		name         string
		dayOfWeek    string
		timeOfDay    string
		customCron   string
		expectedCron string
		wantErr      bool
	}{
		{
			name:         "Everyday at 18:00",
			dayOfWeek:    "Codziennie",
			timeOfDay:    "18:00",
			customCron:   "",
			expectedCron: "0 18 * * *",
			wantErr:      false,
		},
		{
			name:         "Friday at 20:30 (Polish)",
			dayOfWeek:    "Piątek",
			timeOfDay:    "20:30",
			customCron:   "",
			expectedCron: "30 20 * * 5",
			wantErr:      false,
		},
		{
			name:         "Monday at 09:00",
			dayOfWeek:    "poniedziałek",
			timeOfDay:    "09:00",
			customCron:   "",
			expectedCron: "0 9 * * 1",
			wantErr:      false,
		},
		{
			name:         "Sunday at 12:00",
			dayOfWeek:    "niedziela",
			timeOfDay:    "12:00",
			customCron:   "",
			expectedCron: "0 12 * * 0",
			wantErr:      false,
		},
		{
			name:         "Custom cron overrides day and time",
			dayOfWeek:    "Piątek",
			timeOfDay:    "20:00",
			customCron:   "0 0 1 1 *", // Every Jan 1st
			expectedCron: "0 0 1 1 *",
			wantErr:      false,
		},
		{
			name:         "Custom macro @monthly",
			dayOfWeek:    "",
			timeOfDay:    "",
			customCron:   "@monthly",
			expectedCron: "@monthly",
			wantErr:      false,
		},
		{
			name:         "Custom macro @yearly",
			dayOfWeek:    "",
			timeOfDay:    "",
			customCron:   "@yearly",
			expectedCron: "@yearly",
			wantErr:      false,
		},
		{
			name:         "Invalid day of week",
			dayOfWeek:    "NieistniejącyDzień",
			timeOfDay:    "12:00",
			customCron:   "",
			expectedCron: "",
			wantErr:      true,
		},
		{
			name:         "Invalid hour",
			dayOfWeek:    "Piątek",
			timeOfDay:    "25:00",
			customCron:   "",
			expectedCron: "",
			wantErr:      true,
		},
		{
			name:         "Invalid custom cron",
			dayOfWeek:    "",
			timeOfDay:    "",
			customCron:   "niepoprawny cron string",
			expectedCron: "",
			wantErr:      true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cronExpr, humanSched, err := BuildSchedule(tt.dayOfWeek, tt.timeOfDay, tt.customCron, tz)
			if (err != nil) != tt.wantErr {
				t.Fatalf("BuildSchedule() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr {
				if cronExpr != tt.expectedCron {
					t.Errorf("BuildSchedule() cronExpr = %v, want %v", cronExpr, tt.expectedCron)
				}
				if humanSched == "" {
					t.Errorf("BuildSchedule() humanSched is empty")
				}
			}
		})
	}
}

func TestTimezoneCalculation(t *testing.T) {
	loc, err := time.LoadLocation("Europe/Warsaw")
	if err != nil {
		t.Skipf("Europe/Warsaw timezone not available: %v", err)
	}

	now := time.Date(2026, 9, 24, 10, 0, 0, 0, loc) // Thursday
	cronExpr, _, err := BuildSchedule("Piątek", "20:00", "", "Europe/Warsaw")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parser := New(nil, nil, nil).parser
	sched, err := parser.Parse(cronExpr)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	next := sched.Next(now)
	if next.Weekday() != time.Friday {
		t.Errorf("expected next run on Friday, got %v", next.Weekday())
	}
	if next.Hour() != 20 || next.Minute() != 0 {
		t.Errorf("expected 20:00, got %02d:%02d", next.Hour(), next.Minute())
	}
}
