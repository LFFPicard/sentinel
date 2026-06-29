ALTER TABLE "api_keys" ADD COLUMN "key_prefix" text;--> statement-breakpoint
UPDATE "api_keys" SET "key_prefix" = 'legacy_' || id::text;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "key_prefix" SET NOT NULL;
