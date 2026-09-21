import { bigint, index, integer, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";

export const players = pgTable(
  "players",
  {
    userId: text("user_id").primaryKey(),
    email: text("email").notNull(),
    nick: text("nick").notNull(),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(1),
    streak: integer("streak").notNull().default(0),
    lastBonusDay: text("last_bonus_day"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("idx_players_nick_unique").on(table.nick)]
);

export const dailyClaims = pgTable(
  "daily_claims",
  {
    userId: text("user_id").notNull(),
    claimDay: text("claim_day").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.claimDay] })]
);

export const dailyMissionClaims = pgTable(
  "daily_mission_claims",
  {
    userId: text("user_id").notNull(),
    claimDay: text("claim_day").notNull(),
    missionId: text("mission_id").notNull().default("daily_5_rounds"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.claimDay, table.missionId] })]
);

export const gameRounds = pgTable(
  "game_rounds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    game: text("game").notNull(),
    state: text("state").notNull(),
    bet: bigint("bet", { mode: "number" }).notNull(),
    payout: bigint("payout", { mode: "number" }).notNull().default(0),
    result: text("result").notNull(),
    payload: text("payload").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    settledAt: bigint("settled_at", { mode: "number" }),
  },
  (table) => [
    index("idx_game_rounds_user_state").on(table.userId, table.state),
    index("idx_game_rounds_user_created").on(table.userId, table.createdAt),
  ]
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    roundId: text("round_id"),
    type: text("type").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_ledger_entries_user_created").on(table.userId, table.createdAt),
    index("idx_ledger_entries_round").on(table.roundId),
  ]
);

export const fraudLogs = pgTable(
  "fraud_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    nick: text("nick").notNull(),
    previousBalance: bigint("previous_balance", { mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    restoredAt: bigint("restored_at", { mode: "number" }),
  },
  (table) => [
    index("idx_fraud_logs_user").on(table.userId),
    index("idx_fraud_logs_created").on(table.createdAt),
  ]
);
