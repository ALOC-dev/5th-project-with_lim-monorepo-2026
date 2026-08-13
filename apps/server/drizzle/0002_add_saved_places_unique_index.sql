CREATE UNIQUE INDEX IF NOT EXISTS "saved_places_user_place_id_unique"
  ON "saved_places" USING btree ("user_id", ("place_data"->>'id'));
