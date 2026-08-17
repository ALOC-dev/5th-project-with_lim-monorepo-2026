ALTER TABLE "saved_places" DROP CONSTRAINT "saved_places_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;