import { z } from "zod";

import { LocationItemSchema, PriceRangeSchema } from "./common.contracts.js";
import { UserInputSchema } from "./input.contracts.js";

const time24hRegex = /^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const trimmedUrlSchema = z.string().trim().pipe(z.url());
const compactLabelSchema = z.string().trim().min(1).max(20);
const contentSummarySchema = z.string().trim().min(1).max(140);
const recommendationReasonSchema = z.string().trim().min(1).max(90);
const nonNegativeNumberSchema = z.number().gte(0);

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
    kakaoMap: trimmedUrlSchema.optional(), // 검증된 카카오맵 URL
    naverMap: trimmedUrlSchema.optional(), // 검증된 네이버맵 URL
    instagram: trimmedUrlSchema.optional(), // 인스타그램 URL (optional)
    others: z.array(trimmedUrlSchema).optional(), // 검증된 기타 참고 URL (optional)
  })
  .refine((urls) => urls.kakaoMap || urls.naverMap, {
    message: "referenceUrls must include at least one verified map URL",
  })
  .strict();

export const RecommendationAvailabilitySchema = z
  .object({
    status: z.enum(["OPEN", "CLOSED", "UNKNOWN"]),
    requestedDateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    requestedTime24h: z.string().regex(time24hRegex),
    stayDurationMinutes: z.number().int().positive(),
    reason: z.string().trim().min(1),
  })
  .strict();
export type RecommendationAvailability = z.infer<typeof RecommendationAvailabilitySchema>;

export const RecommendationAccessibilityPerOriginSchema = z
  .object({
    originId: z.string().trim().min(1),
    distanceMeters: nonNegativeNumberSchema,
    estimatedTravelMinutes: z.number().int().positive().optional(),
  })
  .strict();

export const RecommendationAccessibilitySchema = z
  .object({
    score: z.number().min(0).max(100),
    distanceMeters: nonNegativeNumberSchema.optional(),
    estimatedTravelMinutes: z.number().int().positive().optional(),
    perOrigin: z.array(RecommendationAccessibilityPerOriginSchema),
  })
  .strict();
export type RecommendationAccessibility = z.infer<typeof RecommendationAccessibilitySchema>;

export const RecommendationScoreBreakdownSchema = z
  .object({
    inputMatch: z.number().min(0).max(100),
    trust: z.number().min(0).max(100),
    accessibility: z.number().min(0).max(100),
    diversity: z.number().min(0).max(100),
    total: z.number().min(0).max(100),
  })
  .strict();
export type RecommendationScoreBreakdown = z.infer<typeof RecommendationScoreBreakdownSchema>;

export const PlaceRecommendationItemSchema = z
  .object({
    id: z.string().trim().min(1), // 장소 식별자 (내부 ID)
    name: z.string().trim().min(1), // 상호명
    phoneNumber: z.string().trim().min(1).nullable(), // 전화번호. 출처에서 없으면 null
    tags: z.array(compactLabelSchema).min(1).max(5), // 태그 1~5개
    contentSummary: contentSummarySchema, // 주력 컨텐츠 요약

    mainCategory: z.string().trim().min(1), // 1차 카테고리 (예: "식당", "카페", "술집")
    subCategory: z.string().trim().min(1), // 2차 카테고리 (예: "한식", "이탈리안", "커피숍", "바")

    operationInfo: OperationInfoSchema,
    availabilityAtRequestedTime: RecommendationAvailabilitySchema,
    referenceUrls: ReferenceUrlsSchema,
    accessibility: RecommendationAccessibilitySchema,

    location: OutputLocationItemSchema,
    priceRangePerPerson: PriceRangeSchema, // 예상 인당 가격 범위 (원 단위)
    /**
     * 위 가격 범위의 출처.
     *
     * `SOURCE`는 실제 페이지에서 읽은 가격, `CATEGORY_ESTIMATE`는 가격 근거를
     * 찾지 못해 업종만 보고 넣은 추정치다. 실측에서 추천 10건 중 6건이 추정치인데
     * 출력만 봐서는 구분할 수 없었다. 사용자에게 "18,000~35,000원"이라고 단정해
     * 보여주면 근거 없는 값을 사실처럼 전달하게 된다. 예산 적합도를 판단할 때도
     * 추정치를 실제 가격처럼 쓰면 안 되므로 출처를 함께 실어 보낸다.
     */
    priceRangeSource: z.enum(["SOURCE", "CATEGORY_ESTIMATE"]),

    score: z.number().int().min(0).max(100), // 추천 점수 (0~100)
    scoreBreakdown: RecommendationScoreBreakdownSchema,
    reasons: z.array(recommendationReasonSchema).min(1).max(3), // 추천 근거
  })
  .strict();

export type PlaceRecommendationItem = z.infer<typeof PlaceRecommendationItemSchema>;

export const RecommendationOriginSchema = z
  .object({
    id: z.string().trim().min(1),
    role: z.enum(["HOST", "MEMBER"]),
    label: z.string().trim().min(1),
    location: LocationItemSchema,
  })
  .strict();
export type RecommendationOrigin = z.infer<typeof RecommendationOriginSchema>;

export const RecommendationOriginContextSchema = z
  .object({
    mode: z.enum(["SINGLE", "GROUP"]),
    origins: z.array(RecommendationOriginSchema),
    center: LocationItemSchema.optional(),
  })
  .strict();
export type RecommendationOriginContext = z.infer<typeof RecommendationOriginContextSchema>;

export const UserOutputSchema = z
  .object({
    originContext: RecommendationOriginContextSchema,
    recommendations: z.array(PlaceRecommendationItemSchema),
  })
  .strict();

export type UserOutput = z.infer<typeof UserOutputSchema>;

/**
 * 실행 진단 정보.
 *
 * 예전에는 실패해도 에러 코드 하나만 나와서, 영업시간 때문인지 거리 때문인지
 * 지도 참조 때문인지 알 수 없었다. 운영 중 원인 파악이 불가능했다.
 */
export const EngineMetaSchema = z
  .object({
    attemptCount: z.number().int().positive(),
    discoveredSeedCount: z.number().int().gte(0),
    /** 요청 지점에서 너무 멀어 조사 전에 제외한 수. */
    tooFarCount: z.number().int().gte(0),
    /** 실제로 조사(enrichment)한 수. */
    enrichedCount: z.number().int().gte(0),
    /** 영업시간이 확인된 수. */
    operationVerifiedCount: z.number().int().gte(0),
    /** 영업시간 미확인이지만 예비로 채택한 수. */
    operationUnverifiedUsedCount: z.number().int().gte(0),
    /** 지도 참조 URL을 못 찾아 제외한 수. */
    referenceRejectedCount: z.number().int().gte(0),
    durationMs: z.number().gte(0),
  })
  .strict();
export type EngineMeta = z.infer<typeof EngineMetaSchema>;

const EngineOutputCommonSchema = z
  .object({
    userInput: UserInputSchema, // echo back the user input for reference
    meta: EngineMetaSchema.optional(),
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
