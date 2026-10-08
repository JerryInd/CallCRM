CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`device_id` text NOT NULL,
	`clock_in_at` text NOT NULL,
	`clock_out_at` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`total_pause_seconds` integer DEFAULT 0 NOT NULL,
	`net_work_seconds` integer DEFAULT 0 NOT NULL,
	`calls_completed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`details` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'DIRECT' NOT NULL,
	`title` text,
	`lead_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`content` text NOT NULL,
	`lead_id` text,
	`status` text DEFAULT 'SENT' NOT NULL,
	`created_at` text NOT NULL,
	`delivered_at` text,
	`read_at` text
);
--> statement-breakpoint
CREATE TABLE `chat_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_read_at` text,
	`muted` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`public_key` text NOT NULL,
	`registration_code` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`agent_id` text,
	`push_token` text,
	`platform` text,
	`registered_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lead_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`device_id` text NOT NULL,
	`session_id` text NOT NULL,
	`reserved_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`name` text,
	`email` text,
	`phone` text,
	`account` text,
	`address` text,
	`brand` text,
	`comments` text,
	`social_trading` text,
	`type` text,
	`original_date` text,
	`poi` text,
	`lead_status` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_called` text,
	`last_response` text,
	`follow_up_date` text,
	`follow_up_time` text,
	`follow_up_assigned_to` text,
	`follow_up_status` text DEFAULT 'PENDING',
	`follow_up_assigned_at` text,
	`dnc` integer DEFAULT false NOT NULL,
	`conversion` text,
	`appointment` text,
	`pending_sync` integer DEFAULT false NOT NULL,
	`sheet_row` integer,
	`last_synced_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_lead_id_unique` ON `leads` (`lead_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`reference_id` text,
	`reference_type` text,
	`read` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text
);
--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`phone` text,
	`email` text,
	`agent_name` text NOT NULL,
	`response` text NOT NULL,
	`notes` text,
	`follow_up_date` text,
	`follow_up_time` text,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`pending_sync` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_pauses` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`duration_seconds` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
