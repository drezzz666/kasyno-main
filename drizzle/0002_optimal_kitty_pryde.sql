CREATE TABLE `daily_claims` (
	`user_id` text NOT NULL,
	`claim_day` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `claim_day`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_players_nick_unique` ON `players` (`nick`);