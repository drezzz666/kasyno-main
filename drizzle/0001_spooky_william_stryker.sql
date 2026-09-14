CREATE INDEX `idx_game_rounds_user_state` ON `game_rounds` (`user_id`,`state`);--> statement-breakpoint
CREATE INDEX `idx_game_rounds_user_created` ON `game_rounds` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_user_created` ON `ledger_entries` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_round` ON `ledger_entries` (`round_id`);