CREATE TABLE "course_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"option_type" text NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"total_duration_minutes" integer NOT NULL,
	"total_travel_minutes" integer NOT NULL,
	"price_per_person_won" integer NOT NULL,
	"reason" text,
	"route_path" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_option_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"visit_time" text NOT NULL,
	"stay_duration_minutes" integer NOT NULL,
	"activity_type" text,
	"source" text NOT NULL,
	"kakao_place_id" text NOT NULL,
	"favorite_place_id" uuid,
	"name" text NOT NULL,
	"address" text,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_source_favorite" CHECK (("course_places"."source" = 'FAVORITE' AND "course_places"."favorite_place_id" IS NOT NULL) OR ("course_places"."source" = 'KAKAO' AND "course_places"."favorite_place_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"status" text NOT NULL,
	"input" jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "favorite_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kakao_place_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"category" text,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "password_reset_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_verification_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "place_recommendation_histories" ALTER COLUMN "title" SET DEFAULT '추천 기록';--> statement-breakpoint
ALTER TABLE "course_options" ADD CONSTRAINT "course_options_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_places" ADD CONSTRAINT "course_places_course_option_id_course_options_id_fk" FOREIGN KEY ("course_option_id") REFERENCES "public"."course_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_places" ADD CONSTRAINT "course_places_favorite_place_id_favorite_places_id_fk" FOREIGN KEY ("favorite_place_id") REFERENCES "public"."favorite_places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_places" ADD CONSTRAINT "favorite_places_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_kakao_place" ON "favorite_places" USING btree ("user_id","kakao_place_id") WHERE "favorite_places"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "place_recommendation_histories" DROP COLUMN "job_id";--> statement-breakpoint
ALTER TABLE "place_recommendation_histories" DROP COLUMN "status";--> statement-breakpoint
DROP TYPE "public"."recommendation_history_status";
