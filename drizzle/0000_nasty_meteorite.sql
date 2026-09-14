CREATE TABLE `game_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`state` text NOT NULL,
	`bet` integer NOT NULL,
	`payout` integer DEFAULT 0 NOT NULL,
	`result` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`settled_at` integer
);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`round_id` text,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`nick` text NOT NULL,
	`balance` integer DEFAULT 25000 NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	`last_bonus_day` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
