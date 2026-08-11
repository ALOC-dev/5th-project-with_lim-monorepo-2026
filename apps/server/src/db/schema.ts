import type { CourseRoutePoint, CreateCourseRequest } from '@monorepo/api-contracts';
import type { PlaceRecommendationItem, UserInput, UserOutput } from '@monorepo/recommendation-engine/v1/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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

// 장소 추천 요청/결과 기록 (입력·결과 보존, 요청 회복)
export const placeRecommendationHistories = pgTable('place_recommendation_histories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userIds: uuid('user_ids').array().notNull().default(sql`'{}'`),
  title: text('title').notNull().default('추천 기록'),
  input: jsonb('input').$type<UserInput>().notNull(),
  output: jsonb('output').$type<UserOutput>(),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 추천 결과에서 저장(하트)한 장소 스냅샷
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

// 즐겨찾기 장소
export const favoritePlaces = pgTable(
  'favorite_places',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kakaoPlaceId: text('kakao_place_id').notNull(), // 카카오 로컬 API의 장소 고유 ID
    name: text('name').notNull(),
    address: text('address'),
    lat: numeric('lat', { precision: 10, scale: 7 }).notNull(),
    lng: numeric('lng', { precision: 10, scale: 7 }).notNull(),
    category: text('category'),
    memo: text('memo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft delete (Delete Confirm 플로우 대응)
  },
  (table) => [
    // 소프트 삭제된 행은 유니크 제약에서 제외 — 삭제 후 같은 장소 재즐겨찾기 가능하게
    uniqueIndex('uq_user_kakao_place')
      .on(table.userId, table.kakaoPlaceId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

// 코스 추천 요청 (기록 화면의 한 줄 단위 — 요청 시작하면 PENDING으로 즉시 생성)
export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'), // rename 가능
  status: text('status').notNull(), // 'PENDING' | 'SUCCESS' | 'FAILED'
  input: jsonb('input').$type<CreateCourseRequest>().notNull(),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 코스 옵션 (요청 1건당 optionType별 후보. 성공 시 최대 4개 생성)
export const courseOptions = pgTable('course_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  optionType: text('option_type').notNull(), // '이동최소' | '느긋한흐름' | '장소다양성' | '식사우선'
  favorite: boolean('favorite').notNull().default(false), // 찜하기 토글
  totalDurationMinutes: integer('total_duration_minutes').notNull(),
  totalTravelMinutes: integer('total_travel_minutes').notNull(),
  pricePerPersonWon: integer('price_per_person_won').notNull(),
  reason: text('reason'), // "코스 구성 이유" 설명문
  routePath: jsonb('route_path').$type<readonly CourseRoutePoint[]>().notNull().default(sql`'[]'`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 코스 옵션에 속한 장소 (스냅샷 + 출처 참조, 시간순)
export const coursePlaces = pgTable(
  'course_places',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseOptionId: uuid('course_option_id')
      .notNull()
      .references(() => courseOptions.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(), // 코스 내 방문 순서
    visitTime: text('visit_time').notNull(), // 방문 시각, "HH:MM" (24시간)
    stayDurationMinutes: integer('stay_duration_minutes').notNull(), // 해당 장소 체류 시간(분)
    activityType: text('activity_type'), // '식사' | '관람' | '대화' 등 (표시용, ActivityTypeSchema와는 별개)
    source: text('source').notNull(), // 'KAKAO' | 'FAVORITE'
    kakaoPlaceId: text('kakao_place_id').notNull(), // 항상 존재 (공통 축)
    favoritePlaceId: uuid('favorite_place_id').references(() => favoritePlaces.id, { onDelete: 'set null' }), // source='FAVORITE'일 때만
    // 스냅샷 필드 (추천 당시 값 고정)
    name: text('name').notNull(),
    address: text('address'),
    lat: numeric('lat', { precision: 10, scale: 7 }).notNull(),
    lng: numeric('lng', { precision: 10, scale: 7 }).notNull(),
    category: text('category'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'chk_source_favorite',
      sql`(${table.source} = 'FAVORITE' AND ${table.favoritePlaceId} IS NOT NULL) OR (${table.source} = 'KAKAO' AND ${table.favoritePlaceId} IS NULL)`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type PlaceRecommendationHistory = typeof placeRecommendationHistories.$inferSelect;
export type SavedPlace = typeof savedPlaces.$inferSelect;
export type PasswordResetCode = typeof passwordResetCodes.$inferSelect;
export type SignupVerificationCode = typeof signupVerificationCodes.$inferSelect;
export type FavoritePlace = typeof favoritePlaces.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type CourseOption = typeof courseOptions.$inferSelect;
export type CoursePlace = typeof coursePlaces.$inferSelect;
