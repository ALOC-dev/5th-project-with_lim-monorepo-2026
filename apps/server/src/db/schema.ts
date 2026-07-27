import type { PlaceRecommendationItem, UserInput, UserOutput } from '@monorepo/recommendation-engine/v1/contracts';
import { sql } from 'drizzle-orm';
import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const recommendationHistoryStatus = pgEnum('recommendation_history_status', [
  'PENDING',
  'COMPLETED',
  'FAILED',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nickname: text('nickname').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const emailVerifications = pgTable('email_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const placeRecommendationHistories = pgTable('place_recommendation_histories', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: text('job_id'),
  title: text('title').notNull(),
  status: recommendationHistoryStatus('status').notNull().default('PENDING'),
  userIds: uuid('user_ids').array().notNull().default(sql`'{}'`),
  input: jsonb('input').$type<UserInput>().notNull(),
  output: jsonb('output').$type<UserOutput>(),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const savedPlaces = pgTable(
  'saved_places',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    historyId: uuid('history_id').references(() => placeRecommendationHistories.id, { onDelete: 'set null' }),
    placeData: jsonb('place_data').$type<PlaceRecommendationItem>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('saved_places_user_place_id_unique').on(
      table.userId,
      sql`(${table.placeData}->>'id')`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type PlaceRecommendationHistory = typeof placeRecommendationHistories.$inferSelect;
export type SavedPlace = typeof savedPlaces.$inferSelect;
export type EmailVerification = typeof emailVerifications.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
