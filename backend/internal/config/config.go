package config

import (
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                 string
	AppURL               string
	DatabaseURL          string
	SessionSecret        string
	AuthentikIssuer      string
	AuthentikClientID    string
	AuthentikClientSecret string
	AuthentikAuthURL     string
	AuthentikTokenURL    string
	AuthentikUserinfoURL string
	AuthentikEndSessionURL string
	DevAuthEnabled        bool
	DefaultBalance        int64
	DailyMissionTarget    int
	DailyMissionReward    int64
	DiscordErrorWebhookURL string
}

func Load() *Config {
	// Load .env if present (ignore error if file doesn't exist)
	_ = godotenv.Load()
	_ = godotenv.Load("../.env")

	port := getEnv("PORT", "8080")
	appURL := strings.TrimRight(getEnv("APP_URL", "http://localhost:3000"), "/")
	dbURL := getEnv("DATABASE_URL", "postgres://kasyno:kasyno_pass@127.0.0.1:5432/kasyno")
	sessionSecret := getEnv("SESSION_SECRET", "kasyno-2fgt-secret-key-replace-in-env-production-32-chars")
	
	authentikIssuer := strings.TrimRight(getEnv("AUTHENTIK_ISSUER", "https://login.2fgt.pl/application/o/kasyno/"), "/")
	authentikClientID := getEnv("AUTHENTIK_CLIENT_ID", "")
	authentikClientSecret := getEnv("AUTHENTIK_CLIENT_SECRET", "")

	devAuth := getEnvBool("DEV_AUTH_ENABLED", false)

	discordWebhook := getEnv("DISCORD_ERROR_WEBHOOK_URL", "")
	if discordWebhook == "" {
		discordWebhook = getEnv("DISCORD_WEBHOOK_URL", "")
	}

	return &Config{
		Port:                  port,
		AppURL:                appURL,
		DatabaseURL:           dbURL,
		SessionSecret:         sessionSecret,
		AuthentikIssuer:       authentikIssuer,
		AuthentikClientID:     authentikClientID,
		AuthentikClientSecret: authentikClientSecret,
		AuthentikAuthURL:      getEnv("AUTHENTIK_AUTH_URL", ""),
		AuthentikTokenURL:     getEnv("AUTHENTIK_TOKEN_URL", ""),
		AuthentikUserinfoURL:  getEnv("AUTHENTIK_USERINFO_URL", ""),
		AuthentikEndSessionURL: getEnv("AUTHENTIK_END_SESSION_URL", ""),
		DevAuthEnabled:        devAuth,
		DefaultBalance:        getEnvInt64("DEFAULT_BALANCE", 1000),
		DailyMissionTarget:    getEnvInt("DAILY_MISSION_TARGET", 5),
		DailyMissionReward:    getEnvInt64("DAILY_MISSION_REWARD", 250),
		DiscordErrorWebhookURL: discordWebhook,
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	b, err := strconv.ParseBool(val)
	if err != nil {
		return fallback
	}
	return b
}

func getEnvInt(key string, fallback int) int {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		return fallback
	}
	return n
}

func getEnvInt64(key string, fallback int64) int64 {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	n, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return fallback
	}
	return n
}
