CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`original_key` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`cloud_safe` integer DEFAULT 0 NOT NULL,
	`deleted_at` text
);

--> statement-breakpoint
CREATE UNIQUE INDEX `assets_original_key_unique` ON `assets` (`original_key`);
--> statement-breakpoint
CREATE TABLE `audit` (
	`id` integer PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL
);

--> statement-breakpoint
CREATE TABLE `site_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`mutation_id` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `site_members`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TABLE `site_members` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`credit_name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`invite_expires` integer NOT NULL,
	`created_at` text NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX `site_members_user_id_unique` ON `site_members` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_members_email_unique` ON `site_members` (`email`);
--> statement-breakpoint
CREATE TABLE `site_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`part_number` integer NOT NULL,
	`object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `site_uploads`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE UNIQUE INDEX `site_parts_object_key_unique` ON `site_parts` (`object_key`);
--> statement-breakpoint
CREATE TABLE `site_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`revision` integer NOT NULL,
	`body` text NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `site_drafts`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE UNIQUE INDEX `site_preset_version` ON `site_presets` (`draft_id`,`revision`);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`asset_id` text NOT NULL,
	`revision` integer NOT NULL,
	`editor` text NOT NULL,
	`updated_at` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`asset_id`, `revision`),
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TABLE `site_submissions` (
	`draft_id` text NOT NULL,
	`revision` integer NOT NULL,
	`body` text NOT NULL,
	`sha256` text NOT NULL,
	`status` text NOT NULL,
	`reviewer` text,
	`reviewed_at` text,
	`mutation_id` text,
	PRIMARY KEY(`draft_id`, `revision`),
	FOREIGN KEY (`draft_id`) REFERENCES `site_drafts`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TABLE `site_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`author_id` text NOT NULL,
	`part_size` integer NOT NULL,
	`part_count` integer NOT NULL,
	`status` text NOT NULL,
	`object_key` text,
	`assembly_token` text,
	`lease_until` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `site_members`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE UNIQUE INDEX `site_upload_asset` ON `site_uploads` (`asset_id`);
--> statement-breakpoint
CREATE TABLE `site_draft_versions` (
	`draft_id` text NOT NULL,
	`revision` integer NOT NULL,
	`body` text NOT NULL,
	`sha256` text NOT NULL,
	PRIMARY KEY(`draft_id`, `revision`),
	FOREIGN KEY (`draft_id`) REFERENCES `site_drafts`(`id`) ON UPDATE no action ON DELETE no action
);

