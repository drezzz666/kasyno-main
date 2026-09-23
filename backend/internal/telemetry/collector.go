package telemetry

import (
	"fmt"
	"math"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// HTTPRouteStats holds latency and count metrics for an HTTP route.
type HTTPRouteStats struct {
	Count       int64   `json:"count"`
	TotalTimeMs float64 `json:"total_time_ms"`
	MinTimeMs   float64 `json:"min_time_ms"`
	MaxTimeMs   float64 `json:"max_time_ms"`
	AvgTimeMs   float64 `json:"avg_time_ms"`
	Status2xx   int64   `json:"status_2xx"`
	Status3xx   int64   `json:"status_3xx"`
	Status4xx   int64   `json:"status_4xx"`
	Status5xx   int64   `json:"status_5xx"`
}

// GameStats holds real-time telemetry and financial statistics for a casino game.
type GameStats struct {
	RoundsCount    int64     `json:"rounds_count"`
	WinsCount      int64     `json:"wins_count"`
	LossesCount    int64     `json:"losses_count"`
	PushesCount    int64     `json:"pushes_count"`
	TotalBet       int64     `json:"total_bet"`
	TotalPayout    int64     `json:"total_payout"`
	CasinoProfit   int64     `json:"casino_profit"`
	RTPPercent     float64   `json:"rtp_percent"`
	MaxMultiplier  float64   `json:"max_multiplier"`
	MaxWinPayout   int64     `json:"max_win_payout"`
	AvgBet         float64   `json:"avg_bet"`
	AvgPayout      float64   `json:"avg_payout"`
	TotalDurationMs float64  `json:"total_duration_ms"`
	AvgDurationMs  float64   `json:"avg_duration_ms"`
	LastPlayedAt   time.Time `json:"last_played_at"`
}

// SecurityStats holds telemetry for bot detection, anti-cheat, and challenges.
type SecurityStats struct {
	ChallengesGenerated int64            `json:"challenges_generated"`
	ChallengesSolved    int64            `json:"challenges_solved"`
	ChallengesFailed    int64            `json:"challenges_failed"`
	ChallengesExpired   int64            `json:"challenges_expired"`
	ChallengesReused    int64            `json:"challenges_reused"`
	RateLimitHits       int64            `json:"rate_limit_hits"`
	SecurityAlerts      map[string]int64 `json:"security_alerts"`
}

// SystemRuntimeStats holds Go runtime telemetry.
type SystemRuntimeStats struct {
	UptimeSeconds   int64  `json:"uptime_seconds"`
	Goroutines      int    `json:"goroutines"`
	AllocMB         float64 `json:"alloc_mb"`
	TotalAllocMB    float64 `json:"total_alloc_mb"`
	SysMB           float64 `json:"sys_mb"`
	NumGC           uint32  `json:"num_gc"`
	LastGCPauseMs   float64 `json:"last_gc_pause_ms"`
	ActiveWSClients int     `json:"active_ws_clients"`
}

// TelemetrySnapshot represents a complete point-in-time snapshot of casino telemetry.
type TelemetrySnapshot struct {
	Timestamp       time.Time                  `json:"timestamp"`
	UptimeFormatted string                     `json:"uptime_formatted"`
	System          SystemRuntimeStats         `json:"system"`
	TotalRequests   int64                      `json:"total_requests"`
	HTTPRoutes      map[string]*HTTPRouteStats `json:"http_routes"`
	Games           map[string]*GameStats      `json:"games"`
	OverallCasino   OverallCasinoStats         `json:"overall_casino"`
	Security        SecurityStats              `json:"security"`
	Errors          ErrorStats                 `json:"errors"`
}

// OverallCasinoStats aggregates all game metrics across the whole platform.
type OverallCasinoStats struct {
	TotalRounds  int64   `json:"total_rounds"`
	TotalWagered int64   `json:"total_wagered"`
	TotalPaidOut int64   `json:"total_paid_out"`
	HouseProfit  int64   `json:"house_profit"`
	OverallRTP   float64 `json:"overall_rtp"`
	TotalWins    int64   `json:"total_wins"`
	TotalLosses  int64   `json:"total_losses"`
	WinRate      float64 `json:"win_rate_percent"`
}

// ErrorStats holds error occurrence telemetry.
type ErrorStats struct {
	FrontendErrors map[string]int64 `json:"frontend_errors"`
	BackendErrors  map[string]int64 `json:"backend_errors"`
	PanicsCount    int64            `json:"panics_count"`
}

// Collector is a thread-safe, high-performance in-memory telemetry aggregator.
type Collector struct {
	startTime time.Time

	mu sync.RWMutex

	// HTTP telemetry
	totalHTTPRequests int64
	httpRoutes        map[string]*HTTPRouteStats

	// Game telemetry
	games map[string]*GameStats

	// WebSocket telemetry
	activeWSClients int64
	wsEventsSent    map[string]int64

	// Security & Anti-cheat telemetry
	challengesGenerated int64
	challengesSolved    int64
	challengesFailed    int64
	challengesExpired   int64
	challengesReused    int64
	rateLimitHits       int64
	securityAlerts      map[string]int64

	// Errors & Incidents telemetry
	frontendErrors map[string]int64
	backendErrors  map[string]int64
	panicsCount    int64
}

// Global default collector instance
var DefaultCollector = NewCollector()

func NewCollector() *Collector {
	return &Collector{
		startTime:      time.Now(),
		httpRoutes:     make(map[string]*HTTPRouteStats),
		games:          make(map[string]*GameStats),
		wsEventsSent:   make(map[string]int64),
		securityAlerts: make(map[string]int64),
		frontendErrors: make(map[string]int64),
		backendErrors:  make(map[string]int64),
	}
}

// RecordHTTPRequest records an HTTP request completion.
func (c *Collector) RecordHTTPRequest(method, route string, statusCode int, duration time.Duration) {
	if c == nil {
		return
	}
	atomic.AddInt64(&c.totalHTTPRequests, 1)

	durMs := float64(duration.Microseconds()) / 1000.0
	key := method + " " + route

	c.mu.Lock()
	defer c.mu.Unlock()

	stat, exists := c.httpRoutes[key]
	if !exists {
		stat = &HTTPRouteStats{
			MinTimeMs: durMs,
			MaxTimeMs: durMs,
		}
		c.httpRoutes[key] = stat
	}

	stat.Count++
	stat.TotalTimeMs += durMs
	stat.AvgTimeMs = stat.TotalTimeMs / float64(stat.Count)
	if durMs < stat.MinTimeMs {
		stat.MinTimeMs = durMs
	}
	if durMs > stat.MaxTimeMs {
		stat.MaxTimeMs = durMs
	}

	switch {
	case statusCode >= 200 && statusCode < 300:
		stat.Status2xx++
	case statusCode >= 300 && statusCode < 400:
		stat.Status3xx++
	case statusCode >= 400 && statusCode < 500:
		stat.Status4xx++
	case statusCode >= 500:
		stat.Status5xx++
	}
}

// RecordGameRound records the outcome and financial telemetry of a completed or updated game round.
func (c *Collector) RecordGameRound(game, action string, bet, payout int64, result string, multiplier float64, duration time.Duration) {
	if c == nil {
		return
	}
	game = strings.ToLower(strings.TrimSpace(game))
	if game == "" {
		game = "unknown"
	}

	durMs := float64(duration.Microseconds()) / 1000.0

	c.mu.Lock()
	defer c.mu.Unlock()

	g, exists := c.games[game]
	if !exists {
		g = &GameStats{}
		c.games[game] = g
	}

	g.RoundsCount++
	g.TotalBet += bet
	g.TotalPayout += payout
	g.CasinoProfit = g.TotalBet - g.TotalPayout
	if g.TotalBet > 0 {
		g.RTPPercent = (float64(g.TotalPayout) / float64(g.TotalBet)) * 100.0
	}
	g.AvgBet = float64(g.TotalBet) / float64(g.RoundsCount)
	g.AvgPayout = float64(g.TotalPayout) / float64(g.RoundsCount)

	g.TotalDurationMs += durMs
	g.AvgDurationMs = g.TotalDurationMs / float64(g.RoundsCount)
	g.LastPlayedAt = time.Now()

	if multiplier > g.MaxMultiplier {
		g.MaxMultiplier = multiplier
	}
	if payout > g.MaxWinPayout {
		g.MaxWinPayout = payout
	}

	resLower := strings.ToLower(result)
	switch {
	case resLower == "win" || payout > bet:
		g.WinsCount++
	case resLower == "loss" || resLower == "bust" || (payout == 0 && bet > 0):
		g.LossesCount++
	case resLower == "push" || resLower == "draw" || payout == bet:
		g.PushesCount++
	default:
		if payout > 0 {
			g.WinsCount++
		} else {
			g.LossesCount++
		}
	}
}

// RecordWSConnect tracks an active WebSocket client opening a connection.
func (c *Collector) RecordWSConnect() {
	if c == nil {
		return
	}
	atomic.AddInt64(&c.activeWSClients, 1)
}

// RecordWSDisconnect tracks a WebSocket client disconnection.
func (c *Collector) RecordWSDisconnect() {
	if c == nil {
		return
	}
	for {
		cur := atomic.LoadInt64(&c.activeWSClients)
		if cur <= 0 {
			break
		}
		if atomic.CompareAndSwapInt64(&c.activeWSClients, cur, cur-1) {
			break
		}
	}
}

// RecordWSEvent records an event broadcast via WebSockets.
func (c *Collector) RecordWSEvent(eventType string) {
	if c == nil || eventType == "" {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.wsEventsSent[eventType]++
}

// RecordChallengeEvent tracks browser anti-bot challenge outcomes.
func (c *Collector) RecordChallengeEvent(event string) {
	if c == nil {
		return
	}
	switch event {
	case "generated":
		atomic.AddInt64(&c.challengesGenerated, 1)
	case "solved":
		atomic.AddInt64(&c.challengesSolved, 1)
	case "failed":
		atomic.AddInt64(&c.challengesFailed, 1)
	case "expired":
		atomic.AddInt64(&c.challengesExpired, 1)
	case "reused":
		atomic.AddInt64(&c.challengesReused, 1)
	}
}

// RecordSecurityAlert records a security or bot detection incident.
func (c *Collector) RecordSecurityAlert(category string) {
	if c == nil {
		return
	}
	if category == "" {
		category = "UNKNOWN"
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.securityAlerts[category]++
}

// RecordRateLimitHit tracks rate limit threshold breaches.
func (c *Collector) RecordRateLimitHit() {
	if c == nil {
		return
	}
	atomic.AddInt64(&c.rateLimitHits, 1)
}

// RecordFrontendError tracks errors originating from the React frontend.
func (c *Collector) RecordFrontendError(errType string) {
	if c == nil {
		return
	}
	if errType == "" {
		errType = "UNKNOWN"
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.frontendErrors[errType]++
}

// RecordBackendError tracks server-side exceptions and database errors.
func (c *Collector) RecordBackendError(category string) {
	if c == nil {
		return
	}
	if category == "" {
		category = "UNKNOWN"
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.backendErrors[category]++
}

// RecordPanic records a server crash/panic caught by recovery middleware.
func (c *Collector) RecordPanic() {
	if c == nil {
		return
	}
	atomic.AddInt64(&c.panicsCount, 1)
}

// GetSnapshot captures a complete copy of all telemetry metrics.
func (c *Collector) GetSnapshot() TelemetrySnapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	uptime := time.Since(c.startTime)
	uptimeSec := int64(uptime.Seconds())

	// Copy routes
	routesCopy := make(map[string]*HTTPRouteStats, len(c.httpRoutes))
	for k, v := range c.httpRoutes {
		rCopy := *v
		routesCopy[k] = &rCopy
	}

	// Copy games
	gamesCopy := make(map[string]*GameStats, len(c.games))
	var totalRounds, totalWagered, totalPaidOut, totalWins, totalLosses int64
	for k, v := range c.games {
		gCopy := *v
		gamesCopy[k] = &gCopy
		totalRounds += v.RoundsCount
		totalWagered += v.TotalBet
		totalPaidOut += v.TotalPayout
		totalWins += v.WinsCount
		totalLosses += v.LossesCount
	}

	overallHouseProfit := totalWagered - totalPaidOut
	var overallRTP, winRate float64
	if totalWagered > 0 {
		overallRTP = (float64(totalPaidOut) / float64(totalWagered)) * 100.0
	}
	if totalRounds > 0 {
		winRate = (float64(totalWins) / float64(totalRounds)) * 100.0
	}

	secAlertsCopy := make(map[string]int64, len(c.securityAlerts))
	for k, v := range c.securityAlerts {
		secAlertsCopy[k] = v
	}

	feErrorsCopy := make(map[string]int64, len(c.frontendErrors))
	for k, v := range c.frontendErrors {
		feErrorsCopy[k] = v
	}

	beErrorsCopy := make(map[string]int64, len(c.backendErrors))
	for k, v := range c.backendErrors {
		beErrorsCopy[k] = v
	}

	lastGCPauseMs := 0.0
	if mem.NumGC > 0 {
		lastGCPauseMs = float64(mem.PauseNs[(mem.NumGC+255)%256]) / 1e6
	}

	return TelemetrySnapshot{
		Timestamp:       time.Now().UTC(),
		UptimeFormatted: formatDuration(uptime),
		System: SystemRuntimeStats{
			UptimeSeconds:   uptimeSec,
			Goroutines:      runtime.NumGoroutine(),
			AllocMB:         round2(float64(mem.Alloc) / 1024 / 1024),
			TotalAllocMB:    round2(float64(mem.TotalAlloc) / 1024 / 1024),
			SysMB:           round2(float64(mem.Sys) / 1024 / 1024),
			NumGC:           mem.NumGC,
			LastGCPauseMs:   round2(lastGCPauseMs),
			ActiveWSClients: int(atomic.LoadInt64(&c.activeWSClients)),
		},
		TotalRequests: atomic.LoadInt64(&c.totalHTTPRequests),
		HTTPRoutes:    routesCopy,
		Games:         gamesCopy,
		OverallCasino: OverallCasinoStats{
			TotalRounds:  totalRounds,
			TotalWagered: totalWagered,
			TotalPaidOut: totalPaidOut,
			HouseProfit:  overallHouseProfit,
			OverallRTP:   round2(overallRTP),
			TotalWins:    totalWins,
			TotalLosses:  totalLosses,
			WinRate:      round2(winRate),
		},
		Security: SecurityStats{
			ChallengesGenerated: atomic.LoadInt64(&c.challengesGenerated),
			ChallengesSolved:    atomic.LoadInt64(&c.challengesSolved),
			ChallengesFailed:    atomic.LoadInt64(&c.challengesFailed),
			ChallengesExpired:   atomic.LoadInt64(&c.challengesExpired),
			ChallengesReused:    atomic.LoadInt64(&c.challengesReused),
			RateLimitHits:       atomic.LoadInt64(&c.rateLimitHits),
			SecurityAlerts:      secAlertsCopy,
		},
		Errors: ErrorStats{
			FrontendErrors: feErrorsCopy,
			BackendErrors:  beErrorsCopy,
			PanicsCount:    atomic.LoadInt64(&c.panicsCount),
		},
	}
}

// ExportPrometheus generates standard Prometheus exposition format text.
func (c *Collector) ExportPrometheus() string {
	snap := c.GetSnapshot()

	var sb strings.Builder

	// Header comments
	sb.WriteString("# HELP casino_uptime_seconds Total server uptime in seconds\n")
	sb.WriteString("# TYPE casino_uptime_seconds gauge\n")
	sb.WriteString(fmt.Sprintf("casino_uptime_seconds %d\n\n", snap.System.UptimeSeconds))

	sb.WriteString("# HELP go_goroutines Number of running goroutines\n")
	sb.WriteString("# TYPE go_goroutines gauge\n")
	sb.WriteString(fmt.Sprintf("go_goroutines %d\n\n", snap.System.Goroutines))

	sb.WriteString("# HELP go_mem_alloc_bytes Number of allocated bytes in heap\n")
	sb.WriteString("# TYPE go_mem_alloc_bytes gauge\n")
	sb.WriteString(fmt.Sprintf("go_mem_alloc_bytes %.0f\n\n", snap.System.AllocMB*1024*1024))

	sb.WriteString("# HELP casino_ws_active_clients Current number of active WebSocket connections\n")
	sb.WriteString("# TYPE casino_ws_active_clients gauge\n")
	sb.WriteString(fmt.Sprintf("casino_ws_active_clients %d\n\n", snap.System.ActiveWSClients))

	// HTTP stats
	sb.WriteString("# HELP casino_http_requests_total Total HTTP requests handled\n")
	sb.WriteString("# TYPE casino_http_requests_total counter\n")
	sb.WriteString(fmt.Sprintf("casino_http_requests_total %d\n\n", snap.TotalRequests))

	sb.WriteString("# HELP casino_http_route_requests Total requests per route and status code group\n")
	sb.WriteString("# TYPE casino_http_route_requests counter\n")
	for route, s := range snap.HTTPRoutes {
		parts := strings.SplitN(route, " ", 2)
		method := "UNKNOWN"
		path := route
		if len(parts) == 2 {
			method = parts[0]
			path = parts[1]
		}
		if s.Status2xx > 0 {
			sb.WriteString(fmt.Sprintf("casino_http_route_requests{method=\"%s\",path=\"%s\",status=\"2xx\"} %d\n", escapeTag(method), escapeTag(path), s.Status2xx))
		}
		if s.Status3xx > 0 {
			sb.WriteString(fmt.Sprintf("casino_http_route_requests{method=\"%s\",path=\"%s\",status=\"3xx\"} %d\n", escapeTag(method), escapeTag(path), s.Status3xx))
		}
		if s.Status4xx > 0 {
			sb.WriteString(fmt.Sprintf("casino_http_route_requests{method=\"%s\",path=\"%s\",status=\"4xx\"} %d\n", escapeTag(method), escapeTag(path), s.Status4xx))
		}
		if s.Status5xx > 0 {
			sb.WriteString(fmt.Sprintf("casino_http_route_requests{method=\"%s\",path=\"%s\",status=\"5xx\"} %d\n", escapeTag(method), escapeTag(path), s.Status5xx))
		}
	}
	sb.WriteString("\n")

	sb.WriteString("# HELP casino_http_route_duration_ms Average duration of HTTP route in ms\n")
	sb.WriteString("# TYPE casino_http_route_duration_ms gauge\n")
	for route, s := range snap.HTTPRoutes {
		parts := strings.SplitN(route, " ", 2)
		method := "UNKNOWN"
		path := route
		if len(parts) == 2 {
			method = parts[0]
			path = parts[1]
		}
		sb.WriteString(fmt.Sprintf("casino_http_route_duration_ms{method=\"%s\",path=\"%s\"} %.2f\n", escapeTag(method), escapeTag(path), s.AvgTimeMs))
	}
	sb.WriteString("\n")

	// Game metrics
	sb.WriteString("# HELP casino_game_rounds_total Total game rounds played\n")
	sb.WriteString("# TYPE casino_game_rounds_total counter\n")
	for game, s := range snap.Games {
		sb.WriteString(fmt.Sprintf("casino_game_rounds_total{game=\"%s\"} %d\n", escapeTag(game), s.RoundsCount))
	}
	sb.WriteString("\n")

	sb.WriteString("# HELP casino_game_bet_credits_total Total credits wagered per game\n")
	sb.WriteString("# TYPE casino_game_bet_credits_total counter\n")
	for game, s := range snap.Games {
		sb.WriteString(fmt.Sprintf("casino_game_bet_credits_total{game=\"%s\"} %d\n", escapeTag(game), s.TotalBet))
	}
	sb.WriteString("\n")

	sb.WriteString("# HELP casino_game_payout_credits_total Total credits paid out to players per game\n")
	sb.WriteString("# TYPE casino_game_payout_credits_total counter\n")
	for game, s := range snap.Games {
		sb.WriteString(fmt.Sprintf("casino_game_payout_credits_total{game=\"%s\"} %d\n", escapeTag(game), s.TotalPayout))
	}
	sb.WriteString("\n")

	sb.WriteString("# HELP casino_game_rtp_percent Calculated Return To Player (RTP) percentage\n")
	sb.WriteString("# TYPE casino_game_rtp_percent gauge\n")
	for game, s := range snap.Games {
		sb.WriteString(fmt.Sprintf("casino_game_rtp_percent{game=\"%s\"} %.2f\n", escapeTag(game), s.RTPPercent))
	}
	sb.WriteString("\n")

	sb.WriteString("# HELP casino_game_profit_credits House profit (Wagered - Paid) per game\n")
	sb.WriteString("# TYPE casino_game_profit_credits gauge\n")
	for game, s := range snap.Games {
		sb.WriteString(fmt.Sprintf("casino_game_profit_credits{game=\"%s\"} %d\n", escapeTag(game), s.CasinoProfit))
	}
	sb.WriteString("\n")

	sb.WriteString("# HELP casino_game_max_multiplier Maximum multiplier won in game\n")
	sb.WriteString("# TYPE casino_game_max_multiplier gauge\n")
	for game, s := range snap.Games {
		sb.WriteString(fmt.Sprintf("casino_game_max_multiplier{game=\"%s\"} %.2f\n", escapeTag(game), s.MaxMultiplier))
	}
	sb.WriteString("\n")

	// Security metrics
	sb.WriteString("# HELP casino_anticheat_challenges_total Total anti-bot browser challenges\n")
	sb.WriteString("# TYPE casino_anticheat_challenges_total counter\n")
	sb.WriteString(fmt.Sprintf("casino_anticheat_challenges_total{status=\"generated\"} %d\n", snap.Security.ChallengesGenerated))
	sb.WriteString(fmt.Sprintf("casino_anticheat_challenges_total{status=\"solved\"} %d\n", snap.Security.ChallengesSolved))
	sb.WriteString(fmt.Sprintf("casino_anticheat_challenges_total{status=\"failed\"} %d\n", snap.Security.ChallengesFailed))
	sb.WriteString(fmt.Sprintf("casino_anticheat_challenges_total{status=\"expired\"} %d\n", snap.Security.ChallengesExpired))
	sb.WriteString(fmt.Sprintf("casino_anticheat_challenges_total{status=\"reused\"} %d\n\n", snap.Security.ChallengesReused))

	sb.WriteString("# HELP casino_rate_limit_hits_total Total rate limit triggers\n")
	sb.WriteString("# TYPE casino_rate_limit_hits_total counter\n")
	sb.WriteString(fmt.Sprintf("casino_rate_limit_hits_total %d\n\n", snap.Security.RateLimitHits))

	sb.WriteString("# HELP casino_security_alerts_total Security violations and bot detections\n")
	sb.WriteString("# TYPE casino_security_alerts_total counter\n")
	for cat, count := range snap.Security.SecurityAlerts {
		sb.WriteString(fmt.Sprintf("casino_security_alerts_total{category=\"%s\"} %d\n", escapeTag(cat), count))
	}
	sb.WriteString("\n")

	// Errors
	sb.WriteString("# HELP casino_errors_total System error occurrences\n")
	sb.WriteString("# TYPE casino_errors_total counter\n")
	sb.WriteString(fmt.Sprintf("casino_errors_total{type=\"panic\"} %d\n", snap.Errors.PanicsCount))
	for errType, count := range snap.Errors.FrontendErrors {
		sb.WriteString(fmt.Sprintf("casino_errors_total{type=\"frontend_%s\"} %d\n", escapeTag(errType), count))
	}
	for cat, count := range snap.Errors.BackendErrors {
		sb.WriteString(fmt.Sprintf("casino_errors_total{type=\"backend_%s\"} %d\n", escapeTag(cat), count))
	}

	return sb.String()
}

func escapeTag(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	s = strings.ReplaceAll(s, "\n", " ")
	return s
}

func round2(f float64) float64 {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0
	}
	return math.Round(f*100) / 100
}

func formatDuration(d time.Duration) string {
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	minutes := int(d.Minutes()) % 60
	seconds := int(d.Seconds()) % 60

	if days > 0 {
		return fmt.Sprintf("%dd %dh %dm %ds", days, hours, minutes, seconds)
	}
	if hours > 0 {
		return fmt.Sprintf("%dh %dm %ds", hours, minutes, seconds)
	}
	if minutes > 0 {
		return fmt.Sprintf("%dm %ds", minutes, seconds)
	}
	return fmt.Sprintf("%ds", seconds)
}
