CREATE TABLE "saved_course_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_course_option_id" uuid,
	"snapshot" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "courses" ADD COLUMN "input_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "engine_input" jsonb;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "engine_meta" jsonb;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "candidate_decisions" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "progress_step" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "error_retryable" boolean;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "run_token" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "chk_course_status" CHECK ("status" IN ('PENDING', 'RUNNING', 'SUCCESS', 'EMPTY', 'FAILED', 'CANCELLED'));--> statement-breakpoint
CREATE INDEX "courses_recovery_idx" ON "courses" USING btree ("status", "lease_expires_at");--> statement-breakpoint

ALTER TABLE "course_options" ADD COLUMN "rank" integer;--> statement-breakpoint
WITH ranked_options AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "course_id"
		ORDER BY "created_at", "id"
	) AS "computed_rank"
	FROM "course_options"
)
UPDATE "course_options"
SET "rank" = ranked_options."computed_rank"
FROM ranked_options
WHERE "course_options"."id" = ranked_options."id";--> statement-breakpoint
ALTER TABLE "course_options" ALTER COLUMN "rank" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "course_options" ADD COLUMN "engine_course_id" text;--> statement-breakpoint
ALTER TABLE "course_options" ADD COLUMN "engine_output" jsonb;--> statement-breakpoint
ALTER TABLE "course_options" ADD COLUMN "candidate_decisions" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_options" ADD COLUMN "route_path_source" text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "course_options_course_rank_unique" ON "course_options" USING btree ("course_id", "rank");--> statement-breakpoint
CREATE UNIQUE INDEX "course_options_engine_course_unique" ON "course_options" USING btree ("course_id", "engine_course_id") WHERE "course_options"."engine_course_id" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "course_places" DROP CONSTRAINT IF EXISTS "chk_source_favorite";--> statement-breakpoint
ALTER TABLE "course_places" ALTER COLUMN "kakao_place_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "course_places" ADD COLUMN "engine_place_id" text;--> statement-breakpoint
ALTER TABLE "course_places" ADD COLUMN "saved_place_id" uuid;--> statement-breakpoint
ALTER TABLE "course_places" ADD COLUMN "place_data" jsonb;--> statement-breakpoint
ALTER TABLE "course_places" ADD COLUMN "travel_minutes_from_previous" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "course_places" ADD COLUMN "wait_minutes_from_previous" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "course_places" ADD CONSTRAINT "course_places_saved_place_id_saved_places_id_fk" FOREIGN KEY ("saved_place_id") REFERENCES "public"."saved_places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_places" ADD CONSTRAINT "chk_course_place_source" CHECK ("source" IN ('FAVORITE', 'KAKAO', 'SAVED_PLACE', 'DIRECT_SEARCH', 'RECOMMENDATION'));--> statement-breakpoint
CREATE UNIQUE INDEX "course_places_option_sequence_unique" ON "course_places" USING btree ("course_option_id", "sequence");--> statement-breakpoint

ALTER TABLE "saved_course_options" ADD CONSTRAINT "saved_course_options_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_course_options" ADD CONSTRAINT "saved_course_options_source_course_option_id_course_options_id_fk" FOREIGN KEY ("source_course_option_id") REFERENCES "public"."course_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_course_options_user_source_unique" ON "saved_course_options" USING btree ("user_id", "source_course_option_id") WHERE "saved_course_options"."source_course_option_id" IS NOT NULL;
