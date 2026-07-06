import type { PlaceRecommendationItem, UserInput, UserOutput } from '@monorepo/recommendation-engine/v1/contracts';
import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nickname: text('nickname').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const placeRecommendationHistories = pgTable('place_recommendation_histories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userIds: uuid('user_ids').array().notNull().default(sql`'{}'`),
  input: jsonb('input').$type<UserInput>().notNull(),
  output: jsonb('output').$type<UserOutput>(),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const savedPlaces = pgTable('saved_places', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  historyId: uuid('history_id').references(() => placeRecommendationHistories.id, { onDelete: 'set null' }),
  placeData: jsonb('place_data').$type<PlaceRecommendationItem>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type PlaceRecommendationHistory = typeof placeRecommendationHistories.$inferSelect;
export type SavedPlace = typeof savedPlaces.$inferSelect;
