import type { PlaceRecommendationItem, UserInput, UserOutput } from '@monorepo/recommendation-engine/v1/contracts';
import { sql } from 'drizzle-orm';
import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nickname: text('nickname').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetCodes = pgTable('password_reset_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const signupVerificationCodes = pgTable('signup_verification_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }),
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
export type PasswordResetCode = typeof passwordResetCodes.$inferSelect;
export type SignupVerificationCode = typeof signupVerificationCodes.$inferSelect;
