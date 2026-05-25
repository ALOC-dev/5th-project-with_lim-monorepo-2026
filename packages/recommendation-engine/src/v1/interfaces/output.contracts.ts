import { z } from "zod";

import {
  LocationItemSchema,
  PriceRangeSchema,
} from "./common.contracts.js";
import { UserInputSchema } from "./input.contracts.js";

const time24hRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const trimmedUrlSchema = z.string().trim().pipe(z.url());
const compactLabelSchema = z.string().trim().min(1).max(20);
const contentSummarySchema = z.string().trim().min(1).max(140);
const recommendationReasonSchema = z.string().trim().min(1).max(90);

export const OutputLocationItemSchema = LocationItemSchema.extend({
  placeName: z.string().trim().min(1), // 장소 명칭
  roadAddressKo: z.string().trim().min(1), // 한국어 도로명 주소
}).strict();
export type OutputLocationItem = z.infer<typeof OutputLocationItemSchema>;

export const BreakTimeSchema = z
  .object({
    start: z.string().regex(time24hRegex),
    end: z.string().regex(time24hRegex),
  })
  .strict();
export type BreakTime = z.infer<typeof BreakTimeSchema>;

export const dayOfWeekValues = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export const DayOfWeekSchema = z.enum(dayOfWeekValues);
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

const OpenDailyOperationInfoSchema = z
  .object({
    status: z.literal("OPEN"),
    open: z.string().regex(time24hRegex), // 영업 시작 시각 (24시간 형식, 예: "10:00")
    close: z.string().regex(time24hRegex), // 영업 종료 시각 (24시간 형식, 예: "22:00")
    breakTimes: z.array(BreakTimeSchema), // 휴식 시간. 없으면 빈 배열
    lastOrderTime: z.string().regex(time24hRegex).optional(), // 라스트 오더 시간 (optional)
  })
  .strict();

const ClosedDailyOperationInfoSchema = z
  .object({
    status: z.literal("CLOSED"),
  })
  .strict();

const UnknownDailyOperationInfoSchema = z
  .object({
    status: z.literal("UNKNOWN"),
  })
  .strict();

export const DailyOperationInfoSchema = z.discriminatedUnion("status", [
  OpenDailyOperationInfoSchema,
  ClosedDailyOperationInfoSchema,
  UnknownDailyOperationInfoSchema,
]);
export type DailyOperationInfo = z.infer<typeof DailyOperationInfoSchema>;

export const OperationSchedulesSchema = z
  .object({
    MONDAY: DailyOperationInfoSchema,
    TUESDAY: DailyOperationInfoSchema,
    WEDNESDAY: DailyOperationInfoSchema,
    THURSDAY: DailyOperationInfoSchema,
    FRIDAY: DailyOperationInfoSchema,
    SATURDAY: DailyOperationInfoSchema,
    SUNDAY: DailyOperationInfoSchema,
  })
  .strict();
export type OperationSchedules = z.infer<typeof OperationSchedulesSchema>;

export const OperationInfoSchema = z
  .object({
    timezone: z.literal("Asia/Seoul"),
    schedules: OperationSchedulesSchema,
  })
  .strict();

export const CompleteWeeklyOperationInfoSchema = OperationInfoSchema;

export type OperationInfo = z.infer<typeof OperationInfoSchema>;

export const ReferenceUrlsSchema = z
  .object({
    kakaoMap: trimmedUrlSchema, // 검증된 카카오맵 URL
    naverMap: trimmedUrlSchema, // 검증된 네이버맵 URL
    instagram: trimmedUrlSchema.optional(), // 인스타그램 URL (optional)
    others: z.array(trimmedUrlSchema).optional(), // 검증된 기타 참고 URL (optional)
  })
  .strict();

export const PlaceRecommendationItemSchema = z
  .object({
    id: z.string().trim().min(1), // 장소 식별자 (내부 ID)
    name: z.string().trim().min(1), // 상호명
    tags: z.array(compactLabelSchema).min(1).max(5), // 태그 1~5개
    contentSummary: contentSummarySchema, // 주력 컨텐츠 요약

    mainCategory: z.string().trim().min(1), // 1차 카테고리 (예: "식당", "카페", "술집")
    subCategory: z.string().trim().min(1), // 2차 카테고리 (예: "한식", "이탈리안", "커피숍", "바")

    operationInfo: OperationInfoSchema,
    referenceUrls: ReferenceUrlsSchema,

    location: OutputLocationItemSchema,
    priceRangePerPerson: PriceRangeSchema, // 예상 인당 가격 범위 (원 단위)

    score: z.number().int().min(0).max(100), // 추천 점수 (0~100)
    reasons: z.array(recommendationReasonSchema).min(1).max(3), // 추천 근거
  })
  .strict();

export type PlaceRecommendationItem = z.infer<
  typeof PlaceRecommendationItemSchema
>;

export const UserOutputSchema = z
  .object({
    recommendations: z.array(PlaceRecommendationItemSchema),
  })
  .strict();

export type UserOutput = z.infer<typeof UserOutputSchema>;

const EngineOutputCommonSchema = z
  .object({
    userInput: UserInputSchema, // echo back the user input for reference
    meta: z.unknown().optional(),
  })
  .strict();

const EngineOutputSuccessSchema = EngineOutputCommonSchema.extend({
  status: z.literal("SUCCESS"),
  userOutput: UserOutputSchema,
}).strict();

const EngineOutputErrorSchema = EngineOutputCommonSchema.extend({
  status: z.literal("ERROR"),
  error: z
    .object({
      code: z.string().trim().min(1), // 에러 코드 (예: "INVALID_INPUT", "EXTERNAL_API_FAILURE")
      message: z.string().trim().min(1), // 에러 메시지 (예: "입력값이 유효하지 않습니다.")
    })
    .strict(),
}).strict();

export const EngineOutputSchema = z.discriminatedUnion("status", [
  EngineOutputSuccessSchema,
  EngineOutputErrorSchema,
]);

export type EngineOutput = z.infer<typeof EngineOutputSchema>;
