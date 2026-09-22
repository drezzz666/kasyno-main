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

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_nick_unique ON players (nick);

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
    created_at BIGINT NOT NULL
);

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

CREATE INDEX IF NOT EXISTS idx_fraud_logs_user ON fraud_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_logs_created ON fraud_logs (created_at);

