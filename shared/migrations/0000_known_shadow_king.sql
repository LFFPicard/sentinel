CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	"label" text NOT NULL,
	"tier" text NOT NULL,
	"last_used" integer,
	"created_at" integer NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"total" integer,
	"processed" integer DEFAULT 0,
	"errors" integer DEFAULT 0,
	"error_log" text,
	"started_at" integer,
	"completed_at" integer,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "libraries" (
	"id" serial PRIMARY KEY NOT NULL,
	"plex_key" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"agent" text,
	"thumb" text,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "libraries_plex_key_unique" UNIQUE("plex_key")
);
--> statement-breakpoint
CREATE TABLE "metadata" (
	"id" serial PRIMARY KEY NOT NULL,
	"rating_key" text NOT NULL,
	"parent_key" text,
	"grandparent_key" text,
	"library_id" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"grandparent_title" text,
	"parent_title" text,
	"year" integer,
	"thumb" text,
	"art" text,
	"duration" integer,
	"studio" text,
	"content_rating" text,
	"summary" text,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "metadata_rating_key_unique" UNIQUE("rating_key")
);
--> statement-breakpoint
CREATE TABLE "session_history" (
	"id" bigserial NOT NULL,
	"user_id" integer,
	"metadata_id" integer,
	"session_key" text,
	"started_at" integer NOT NULL,
	"stopped_at" integer,
	"duration" integer,
	"progress" integer,
	"complete" boolean DEFAULT false,
	"platform" text,
	"player" text,
	"ip_address" text,
	"transcode_decision" text,
	"video_decision" text,
	"audio_decision" text,
	"quality_profile" text,
	"imported" boolean DEFAULT false,
	"year" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"plex_id" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"email" text,
	"thumb" text,
	"is_owner" boolean DEFAULT false,
	"hidden" boolean DEFAULT false,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "users_plex_id_unique" UNIQUE("plex_id")
);
--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_history" ADD CONSTRAINT "session_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_history" ADD CONSTRAINT "session_history_metadata_id_metadata_id_fk" FOREIGN KEY ("metadata_id") REFERENCES "public"."metadata"("id") ON DELETE no action ON UPDATE no action;