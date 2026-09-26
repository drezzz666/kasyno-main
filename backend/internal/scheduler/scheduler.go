package scheduler

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/drezzz666/kasyno/backend/internal/config"
	"github.com/drezzz666/kasyno/backend/internal/db"
	"github.com/drezzz666/kasyno/backend/internal/ledger"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/robfig/cron/v3"
)

type ScheduledGrant struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	TargetUsers   string `json:"target_users"`
	Amount        int64  `json:"amount"`
	GrantType     string `json:"grant_type"`
	Reason        string `json:"reason"`
	CronExpr      string `json:"cron_expr"`
	HumanSchedule string `json:"human_schedule"`
	CreatedBy     string `json:"created_by"`
	CreatedAt     int64  `json:"created_at"`
	LastRunAt     *int64 `json:"last_run_at"`
	NextRunAt     *int64 `json:"next_run_at"`
	Enabled       bool   `json:"enabled"`
}

type GrantExecutionResult struct {
	Grant            *ScheduledGrant
	RecipientsCount  int
	TotalTransferred int64
	SuccessfulUsers  []string
	FailedUsers      []string
	ExecutedAt       time.Time
}

type AnnounceDropFunc func(ctx context.Context, res *GrantExecutionResult)

type Scheduler struct {
	db           *db.DB
	ledger       *ledger.Service
	cfg          *config.Config
	location     *time.Location
	parser       cron.Parser
	cronRunner   *cron.Cron
	entries      map[string]cron.EntryID
	mu           sync.RWMutex
	onAnnounce   AnnounceDropFunc
	ctx          context.Context
	cancel       context.CancelFunc
}

func New(cfg *config.Config, database *db.DB, ledgerSvc *ledger.Service) *Scheduler {
	tzName := "Europe/Warsaw"
	if cfg != nil && cfg.Timezone != "" {
		tzName = cfg.Timezone
	}

	loc, err := time.LoadLocation(tzName)
	if err != nil {
		log.Printf("⚠️ [Scheduler] Nie znaleziono strefy czasowej '%s': %v. Używam lokalnej strefy.", tzName, err)
		loc = time.Local
	}

	parser := cron.NewParser(
		cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor,
	)

	ctx, cancel := context.WithCancel(context.Background())

	s := &Scheduler{
		db:         database,
		ledger:     ledgerSvc,
		cfg:        cfg,
		location:   loc,
		parser:     parser,
		entries:    make(map[string]cron.EntryID),
		ctx:        ctx,
		cancel:     cancel,
	}

	s.cronRunner = cron.New(
		cron.WithLocation(loc),
		cron.WithParser(parser),
	)

	return s
}

func (s *Scheduler) SetAnnounceHandler(fn AnnounceDropFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onAnnounce = fn
}

func (s *Scheduler) Location() *time.Location {
	return s.location
}

// Start loads all active scheduled grants from the database and starts the cron runner.
func (s *Scheduler) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	log.Printf("🕒 [Scheduler] Uruchamianie harmonogramu zrzutów $FGT (Strefa: %s)...", s.location.String())

	grants, err := s.listGrantsFromDB(ctx, true)
	if err != nil {
		return fmt.Errorf("błąd pobierania zadań harmonogramu z bazy: %w", err)
	}

	for _, g := range grants {
		grantCopy := g
		s.scheduleJobLocked(&grantCopy)
	}

	s.cronRunner.Start()
	log.Printf("✅ [Scheduler] Harmonogram uruchomiony. Aktywnych zadań: %d", len(s.entries))
	return nil
}

// Stop stops the scheduler runner.
func (s *Scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
	if s.cronRunner != nil {
		ctx := s.cronRunner.Stop()
		<-ctx.Done()
		log.Println("🛑 [Scheduler] Harmonogram został zatrzymany.")
	}
}

func (s *Scheduler) scheduleJobLocked(g *ScheduledGrant) {
	if !g.Enabled {
		return
	}

	// If entry already exists, remove it first
	if oldEntryID, exists := s.entries[g.ID]; exists {
		s.cronRunner.Remove(oldEntryID)
		delete(s.entries, g.ID)
	}

	grantID := g.ID
	entryID, err := s.cronRunner.AddFunc(g.CronExpr, func() {
		execCtx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		if _, err := s.ExecuteGrant(execCtx, grantID); err != nil {
			log.Printf("❌ [Scheduler] Błąd wykonania automatycznego zrzutu '%s' (ID: %s): %v", g.Name, grantID, err)
		}
	})

	if err != nil {
		log.Printf("⚠️ [Scheduler] Błąd rejestracji zadania cron '%s' (%s): %v", g.Name, g.CronExpr, err)
		return
	}

	s.entries[g.ID] = entryID

	// Update next_run_at in DB
	entry := s.cronRunner.Entry(entryID)
	if !entry.Next.IsZero() {
		nextMs := entry.Next.UnixMilli()
		g.NextRunAt = &nextMs
		_, _ = s.db.Pool.Exec(context.Background(), `UPDATE scheduled_grants SET next_run_at = $1 WHERE id = $2`, nextMs, g.ID)
	}
}

type CreateGrantParams struct {
	Name        string
	TargetUsers string
	Amount      int64
	GrantType   string
	Reason      string
	DayOfWeek   string
	TimeOfDay   string
	CustomCron  string
	CreatedBy   string
}

// BuildSchedule synthesizes cron expression and human schedule string.
func BuildSchedule(dayOfWeek, timeOfDay, customCron, timezoneName string) (cronExpr string, humanSchedule string, err error) {
	customCron = strings.TrimSpace(customCron)
	if customCron != "" {
		// Handle standard macros if needed, or 5-token cron
		parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)
		sched, parseErr := parser.Parse(customCron)
		if parseErr != nil {
			return "", "", fmt.Errorf("niepoprawne wyrażenie cron '%s': %w", customCron, parseErr)
		}
		_ = sched

		humanSchedule = fmt.Sprintf("Cron: `%s` (strefa: %s)", customCron, timezoneName)
		if strings.HasPrefix(customCron, "@") {
			switch strings.ToLower(customCron) {
			case "@yearly", "@annually":
				humanSchedule = fmt.Sprintf("Co rok (1 stycznia o 00:00, strefa: %s)", timezoneName)
			case "@monthly":
				humanSchedule = fmt.Sprintf("Co miesiąc (1. dzień miesiąca o 00:00, strefa: %s)", timezoneName)
			case "@weekly":
				humanSchedule = fmt.Sprintf("Co tydzień (Niedziela o 00:00, strefa: %s)", timezoneName)
			case "@daily", "@midnight":
				humanSchedule = fmt.Sprintf("Codziennie o 00:00 (strefa: %s)", timezoneName)
			case "@hourly":
				humanSchedule = fmt.Sprintf("Co godzinę (strefa: %s)", timezoneName)
			}
		}
		return customCron, humanSchedule, nil
	}

	dowNorm := strings.ToLower(strings.TrimSpace(dayOfWeek))
	dowMap := map[string]struct{ token, label string }{
		"":             {"*", "Codziennie"},
		"*":            {"*", "Codziennie"},
		"all":          {"*", "Codziennie"},
		"codziennie":   {"*", "Codziennie"},
		"everyday":     {"*", "Codziennie"},
		"daily":        {"*", "Codziennie"},
		"poniedzialek": {"1", "W każdy Poniedziałek"},
		"poniedziałek": {"1", "W każdy Poniedziałek"},
		"pn":           {"1", "W każdy Poniedziałek"},
		"mon":          {"1", "W każdy Poniedziałek"},
		"monday":       {"1", "W każdy Poniedziałek"},
		"1":            {"1", "W każdy Poniedziałek"},
		"wtorek":       {"2", "W każdy Wtorek"},
		"wt":           {"2", "W każdy Wtorek"},
		"tue":          {"2", "W każdy Wtorek"},
		"tuesday":      {"2", "W każdy Wtorek"},
		"2":            {"2", "W każdy Wtorek"},
		"sroda":        {"3", "W każdą Środę"},
		"środa":        {"3", "W każdą Środę"},
		"sr":           {"3", "W każdą Środę"},
		"śr":           {"3", "W każdą Środę"},
		"wed":          {"3", "W każdą Środę"},
		"wednesday":    {"3", "W każdą Środę"},
		"3":            {"3", "W każdą Środę"},
		"czwartek":     {"4", "W każdy Czwartek"},
		"czw":          {"4", "W każdy Czwartek"},
		"thu":          {"4", "W każdy Czwartek"},
		"thursday":     {"4", "W każdy Czwartek"},
		"4":            {"4", "W każdy Czwartek"},
		"piatek":       {"5", "W każdy Piątek"},
		"piątek":       {"5", "W każdy Piątek"},
		"pt":           {"5", "W każdy Piątek"},
		"fri":          {"5", "W każdy Piątek"},
		"friday":       {"5", "W każdy Piątek"},
		"5":            {"5", "W każdy Piątek"},
		"sobota":       {"6", "W każdą Sobotę"},
		"sb":           {"6", "W każdą Sobotę"},
		"sat":          {"6", "W każdą Sobotę"},
		"saturday":     {"6", "W każdą Sobotę"},
		"6":            {"6", "W każdą Sobotę"},
		"niedziela":    {"0", "W każdą Niedzielę"},
		"nd":           {"0", "W każdą Niedzielę"},
		"sun":          {"0", "W każdą Niedzielę"},
		"sunday":       {"0", "W każdą Niedzielę"},
		"0":            {"0", "W każdą Niedzielę"},
		"7":            {"0", "W każdą Niedzielę"},
	}

	dowInfo, ok := dowMap[dowNorm]
	if !ok {
		return "", "", fmt.Errorf("nieznany dzień tygodnia: '%s'", dayOfWeek)
	}
	dowToken := dowInfo.token
	dowLabel := dowInfo.label

	// Parse hour:minute
	timeOfDay = strings.TrimSpace(timeOfDay)
	if timeOfDay == "" {
		timeOfDay = "18:00"
	}

	parts := strings.Split(timeOfDay, ":")
	hour, err := strconv.Atoi(parts[0])
	if err != nil || hour < 0 || hour > 23 {
		return "", "", fmt.Errorf("niepoprawna godzina: '%s' (dozwolone 00-23)", parts[0])
	}

	minute := 0
	if len(parts) > 1 {
		minute, err = strconv.Atoi(parts[1])
		if err != nil || minute < 0 || minute > 59 {
			return "", "", fmt.Errorf("niepoprawne minuty: '%s' (dozwolone 00-59)", parts[1])
		}
	}

	cronExpr = fmt.Sprintf("%d %d * * %s", minute, hour, dowToken)
	humanSchedule = fmt.Sprintf("%s o %02d:%02d (strefa: %s)", dowLabel, hour, minute, timezoneName)

	return cronExpr, humanSchedule, nil
}

// AddScheduledGrant inserts a new schedule into DB and registers it with the runner.
func (s *Scheduler) AddScheduledGrant(ctx context.Context, params CreateGrantParams) (*ScheduledGrant, error) {
	if strings.TrimSpace(params.Name) == "" {
		return nil, fmt.Errorf("nazwa zadania nie może być pusta")
	}
	if params.Amount <= 0 {
		return nil, fmt.Errorf("kwota/ilość musi być większa od zera")
	}
	if strings.TrimSpace(params.TargetUsers) == "" {
		return nil, fmt.Errorf("musisz podać odbiorców (np. '*' lub 'gracz1, gracz2')")
	}
	if strings.TrimSpace(params.Reason) == "" {
		if params.GrantType == "musordrop" {
			params.Reason = "Automatyczny zrzut skrzynek Musor Drop"
		} else {
			params.Reason = "Automatyczny zrzut $FGT"
		}
	}
	grantType := strings.TrimSpace(params.GrantType)
	if grantType == "" {
		grantType = "money"
	}

	cronExpr, humanSched, err := BuildSchedule(params.DayOfWeek, params.TimeOfDay, params.CustomCron, s.location.String())
	if err != nil {
		return nil, err
	}

	sched, err := s.parser.Parse(cronExpr)
	if err != nil {
		return nil, fmt.Errorf("błąd walidacji cron: %w", err)
	}

	now := time.Now().In(s.location)
	nextTime := sched.Next(now)
	var nextMs *int64
	if !nextTime.IsZero() {
		val := nextTime.UnixMilli()
		nextMs = &val
	}

	g := &ScheduledGrant{
		ID:            uuid.NewString(),
		Name:          strings.TrimSpace(params.Name),
		TargetUsers:   strings.TrimSpace(params.TargetUsers),
		Amount:        params.Amount,
		GrantType:     grantType,
		Reason:        strings.TrimSpace(params.Reason),
		CronExpr:      cronExpr,
		HumanSchedule: humanSched,
		CreatedBy:     params.CreatedBy,
		CreatedAt:     now.UnixMilli(),
		NextRunAt:     nextMs,
		Enabled:       true,
	}

	query := `
		INSERT INTO scheduled_grants (id, name, target_users, amount, grant_type, reason, cron_expr, human_schedule, created_by, created_at, next_run_at, enabled)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`
	_, err = s.db.Pool.Exec(ctx, query, g.ID, g.Name, g.TargetUsers, g.Amount, g.GrantType, g.Reason, g.CronExpr, g.HumanSchedule, g.CreatedBy, g.CreatedAt, g.NextRunAt, g.Enabled)
	if err != nil {
		return nil, fmt.Errorf("błąd zapisu do bazy danych: %w", err)
	}

	s.mu.Lock()
	s.scheduleJobLocked(g)
	s.mu.Unlock()

	return g, nil
}

// ListGrants retrieves all scheduled grants.
func (s *Scheduler) ListGrants(ctx context.Context) ([]ScheduledGrant, error) {
	return s.listGrantsFromDB(ctx, false)
}

func (s *Scheduler) listGrantsFromDB(ctx context.Context, onlyEnabled bool) ([]ScheduledGrant, error) {
	query := `
		SELECT id, name, target_users, amount, COALESCE(grant_type, 'money'), reason, cron_expr, human_schedule, created_by, created_at, last_run_at, next_run_at, enabled
		FROM scheduled_grants
	`
	if onlyEnabled {
		query += " WHERE enabled = TRUE"
	}
	query += " ORDER BY created_at DESC"

	rows, err := s.db.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var grants []ScheduledGrant
	for rows.Next() {
		var g ScheduledGrant
		if err := rows.Scan(&g.ID, &g.Name, &g.TargetUsers, &g.Amount, &g.GrantType, &g.Reason, &g.CronExpr, &g.HumanSchedule, &g.CreatedBy, &g.CreatedAt, &g.LastRunAt, &g.NextRunAt, &g.Enabled); err != nil {
			return nil, err
		}
		grants = append(grants, g)
	}

	return grants, nil
}

// GetGrant retrieves a single grant by ID or name substring.
func (s *Scheduler) GetGrant(ctx context.Context, idOrName string) (*ScheduledGrant, error) {
	var g ScheduledGrant
	query := `
		SELECT id, name, target_users, amount, COALESCE(grant_type, 'money'), reason, cron_expr, human_schedule, created_by, created_at, last_run_at, next_run_at, enabled
		FROM scheduled_grants
		WHERE id = $1 OR LOWER(name) = LOWER($1) OR id LIKE $2
		LIMIT 1
	`
	prefix := idOrName + "%"
	err := s.db.Pool.QueryRow(ctx, query, idOrName, prefix).Scan(
		&g.ID, &g.Name, &g.TargetUsers, &g.Amount, &g.GrantType, &g.Reason, &g.CronExpr, &g.HumanSchedule, &g.CreatedBy, &g.CreatedAt, &g.LastRunAt, &g.NextRunAt, &g.Enabled,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("nie znaleziono harmonogramu o identyfikatorze: '%s'", idOrName)
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// RemoveGrant deletes a grant from DB and cancels its cron runner entry.
func (s *Scheduler) RemoveGrant(ctx context.Context, idOrName string) (*ScheduledGrant, error) {
	g, err := s.GetGrant(ctx, idOrName)
	if err != nil {
		return nil, err
	}

	_, err = s.db.Pool.Exec(ctx, `DELETE FROM scheduled_grants WHERE id = $1`, g.ID)
	if err != nil {
		return nil, fmt.Errorf("błąd usuwania z bazy danych: %w", err)
	}

	s.mu.Lock()
	if entryID, ok := s.entries[g.ID]; ok {
		s.cronRunner.Remove(entryID)
		delete(s.entries, g.ID)
	}
	s.mu.Unlock()

	return g, nil
}

// ToggleGrant enables or disables a scheduled grant.
func (s *Scheduler) ToggleGrant(ctx context.Context, idOrName string, enable bool) (*ScheduledGrant, error) {
	g, err := s.GetGrant(ctx, idOrName)
	if err != nil {
		return nil, err
	}

	g.Enabled = enable
	_, err = s.db.Pool.Exec(ctx, `UPDATE scheduled_grants SET enabled = $1 WHERE id = $2`, enable, g.ID)
	if err != nil {
		return nil, fmt.Errorf("błąd aktualizacji statusu: %w", err)
	}

	s.mu.Lock()
	if enable {
		s.scheduleJobLocked(g)
	} else {
		if entryID, ok := s.entries[g.ID]; ok {
			s.cronRunner.Remove(entryID)
			delete(s.entries, g.ID)
		}
	}
	s.mu.Unlock()

	return g, nil
}

// ExecuteGrant immediately runs the specified grant, distributing funds and notifying discord channel.
func (s *Scheduler) ExecuteGrant(ctx context.Context, grantID string) (*GrantExecutionResult, error) {
	g, err := s.GetGrant(ctx, grantID)
	if err != nil {
		return nil, err
	}

	execTime := time.Now().In(s.location)
	result := &GrantExecutionResult{
		Grant:      g,
		ExecutedAt: execTime,
	}

	target := strings.TrimSpace(g.TargetUsers)
	isAll := target == "*" || strings.EqualFold(target, "all") || strings.EqualFold(target, "wszyscy") || strings.EqualFold(target, "@everyone")

	if g.GrantType == "musordrop" || g.GrantType == "musor_box" || g.GrantType == "box" {
		if isAll {
			count, total, err := s.ledger.GrantMusorBoxesAll(ctx, int(g.Amount), g.Reason)
			if err != nil {
				return nil, fmt.Errorf("błąd masowego zrzutu skrzynek dla wszystkich graczy: %w", err)
			}
			result.RecipientsCount = count
			result.TotalTransferred = int64(total)
			result.SuccessfulUsers = []string{"* (Wszyscy gracze)"}
		} else {
			rawUsers := strings.Split(target, ",")
			var successful []string
			var failed []string
			var totalTransferred int64

			for _, rawUser := range rawUsers {
				u := strings.TrimSpace(rawUser)
				if u == "" {
					continue
				}
				nick, _, _, grantErr := s.ledger.GrantMusorBoxes(ctx, u, int(g.Amount), g.Reason)
				if grantErr != nil {
					failed = append(failed, fmt.Sprintf("%s (%v)", u, grantErr))
				} else {
					successful = append(successful, nick)
					totalTransferred += g.Amount
				}
			}

			result.RecipientsCount = len(successful)
			result.TotalTransferred = totalTransferred
			result.SuccessfulUsers = successful
			result.FailedUsers = failed

			if len(successful) == 0 && len(failed) > 0 {
				return nil, fmt.Errorf("nie udało się nadać skrzynek żadnemu z podanych graczy: %s", strings.Join(failed, ", "))
			}
		}
	} else {
		if isAll {
			count, total, err := s.ledger.GrantBalanceAllWithType(ctx, g.Amount, "scheduled_grant", g.Reason)
			if err != nil {
				return nil, fmt.Errorf("błąd masowego zrzutu dla wszystkich graczy: %w", err)
			}
			result.RecipientsCount = count
			result.TotalTransferred = total
			result.SuccessfulUsers = []string{"* (Wszyscy gracze)"}
		} else {
			// Multi-user target: split comma-separated list of nicks/IDs
			rawUsers := strings.Split(target, ",")
			var successful []string
			var failed []string
			var totalTransferred int64

			for _, rawUser := range rawUsers {
				u := strings.TrimSpace(rawUser)
				if u == "" {
					continue
				}
				nick, _, _, grantErr := s.ledger.GrantBalanceWithType(ctx, u, g.Amount, "scheduled_grant", g.Reason)
				if grantErr != nil {
					failed = append(failed, fmt.Sprintf("%s (%v)", u, grantErr))
				} else {
					successful = append(successful, nick)
					totalTransferred += g.Amount
				}
			}

			result.RecipientsCount = len(successful)
			result.TotalTransferred = totalTransferred
			result.SuccessfulUsers = successful
			result.FailedUsers = failed

			if len(successful) == 0 && len(failed) > 0 {
				return nil, fmt.Errorf("nie udało się nadać środków żadnemu z podanych graczy: %s", strings.Join(failed, ", "))
			}
		}
	}

	// Update DB last_run_at & next_run_at
	nowMs := execTime.UnixMilli()
	g.LastRunAt = &nowMs

	sched, err := s.parser.Parse(g.CronExpr)
	if err == nil {
		nextTime := sched.Next(execTime)
		if !nextTime.IsZero() {
			val := nextTime.UnixMilli()
			g.NextRunAt = &val
		}
	}

	_, _ = s.db.Pool.Exec(ctx, `UPDATE scheduled_grants SET last_run_at = $1, next_run_at = $2 WHERE id = $3`, g.LastRunAt, g.NextRunAt, g.ID)

	// Call announcement callback
	s.mu.RLock()
	announceHandler := s.onAnnounce
	s.mu.RUnlock()

	if announceHandler != nil {
		go announceHandler(context.Background(), result)
	}

	return result, nil
}
