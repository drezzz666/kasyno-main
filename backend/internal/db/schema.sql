CREATE TABLE IF NOT EXISTS players (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    nick TEXT NOT NULL,
    avatar TEXT,
    xp BIGINT NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    streak INTEGER NOT NULL DEFAULT 0,
    last_bonus_day TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS tos_accepted BIGINT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS musor_lepsza_boxes INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_nick_unique ON players (nick);

CREATE TABLE IF NOT EXISTS musor_drop_daily (
    user_id TEXT NOT NULL,
    day_key TEXT NOT NULL,
    box_type TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day_key, box_type)
);

CREATE INDEX IF NOT EXISTS idx_musor_drop_daily_user ON musor_drop_daily (user_id, day_key);

CREATE TABLE IF NOT EXISTS daily_claims (
    user_id TEXT NOT NULL,
    claim_day TEXT NOT NULL,
    amount BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, claim_day)
);

CREATE TABLE IF NOT EXISTS daily_mission_claims (
    user_id TEXT NOT NULL,
    claim_day TEXT NOT NULL,
    mission_id TEXT NOT NULL DEFAULT 'daily_5_rounds',
    amount BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, claim_day, mission_id)
);

CREATE TABLE IF NOT EXISTS game_rounds (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    game TEXT NOT NULL,
    state TEXT NOT NULL,
    bet BIGINT NOT NULL,
    payout BIGINT NOT NULL DEFAULT 0,
    result TEXT NOT NULL,
    payload TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL,
    settled_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_game_rounds_user_state ON game_rounds (user_id, state);
CREATE INDEX IF NOT EXISTS idx_game_rounds_user_created ON game_rounds (user_id, created_at);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    round_id TEXT,
    type TEXT NOT NULL,
    amount BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    description TEXT
);

ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_user_created ON ledger_entries (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_round ON ledger_entries (round_id);

CREATE TABLE IF NOT EXISTS provably_fair_seeds (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    server_hash TEXT NOT NULL,
    client_seed TEXT NOT NULL,
    nonce BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    revealed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_provably_fair_seeds_user ON provably_fair_seeds (user_id, created_at);

CREATE TABLE IF NOT EXISTS fraud_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    nick TEXT NOT NULL,
    previous_balance BIGINT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT,
    created_at BIGINT NOT NULL,
    restored_at BIGINT
);

CREATE TABLE IF NOT EXISTS login_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    nick TEXT NOT NULL,
    ip TEXT NOT NULL,
    user_agent TEXT,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs (created_at);

CREATE TABLE IF NOT EXISTS scheduled_grants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target_users TEXT NOT NULL,
    amount BIGINT NOT NULL,
    grant_type TEXT NOT NULL DEFAULT 'money',
    reason TEXT NOT NULL,
    cron_expr TEXT NOT NULL,
    human_schedule TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    last_run_at BIGINT,
    next_run_at BIGINT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE scheduled_grants ADD COLUMN IF NOT EXISTS grant_type TEXT NOT NULL DEFAULT 'money';

CREATE INDEX IF NOT EXISTS idx_scheduled_grants_enabled ON scheduled_grants (enabled);

CREATE TABLE IF NOT EXISTS live_events (
    id SERIAL PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.25,
    started_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    started_by VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_live_events_active ON live_events (is_active, ends_at);


