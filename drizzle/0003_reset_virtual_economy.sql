-- Reset all existing virtual-currency accounts to the new 100 zł starting balance.
-- History and active rounds are cleared so the reset is complete and consistent.
DELETE FROM `ledger_entries`;
--> statement-breakpoint
DELETE FROM `game_rounds`;
--> statement-breakpoint
DELETE FROM `daily_claims`;
--> statement-breakpoint
UPDATE `players`
SET `balance` = 100,
    `xp` = 0,
    `level` = 1,
    `streak` = 0,
    `last_bonus_day` = NULL,
    `updated_at` = CAST(strftime('%s', 'now') AS INTEGER) * 1000;
