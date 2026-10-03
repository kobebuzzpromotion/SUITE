CREATE TABLE `site_metrics` (
	`day` text PRIMARY KEY NOT NULL,
	`requests` integer NOT NULL,
	`r2_reads` integer NOT NULL,
	`r2_writes` integer NOT NULL,
	`d1_rows_read` integer NOT NULL,
	`d1_rows_written` integer NOT NULL,
	`d1_metadata_unknown` integer NOT NULL,
	`object_bytes_requested` integer NOT NULL,
	`wall_ms` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `site_operation_budget` (
	`period` text NOT NULL,
	`kind` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`period`, `kind`)
);

--> statement-breakpoint
CREATE TABLE `site_storage_reservations` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL
);

--> statement-breakpoint
CREATE TABLE `site_storage_objects` (
	`object_key` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`bytes` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL
);

