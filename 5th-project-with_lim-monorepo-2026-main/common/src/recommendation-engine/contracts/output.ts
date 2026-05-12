import { z } from "zod";

import { LocationItemSchema, PriceRangeSchema } from "./common.js";
import { UserInputSchema } from "./input.js"; //input에서 읽어오기

const time24hRegex = /^([01]\d|2[0-3]):[0-5]\d$/;  // 24시간 형식 (예: "19:00")
const trimmedUrlSchema = z.string().trim().pipe(z.url());  // URL 형식이면서 앞뒤 공백이 없는 문자열

export const OutputLocationItemSchema = LocationItemSchema.extend({
  placeName: z.string().trim().min(1), // 장소 명칭
  roadAddressKo: z.string().trim().min(1), // 한국어 도로명 주소
}).strict();
export type OutputLocationItem = z.infer<typeof OutputLocationItemSchema>; 

const BreakTimeSchema = z
  .object({
    start: z.string().regex(time24hRegex),  // 브레이크 타임 시작 시각 (24시간 형식, 예: "15:00")
    end: z.string().regex(time24hRegex),  // 브레이크 타임 종료 시각 (24시간 형식, 예: "16:00")
  })
  .strict();

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

const DaysOfWeekSchema = z.array(DayOfWeekSchema).min(1); 

const OpenOperationScheduleSchema = z
  .object({
    daysOfWeek: DaysOfWeekSchema, // 같은 운영 시간이 적용되는 요일 목록
    status: z.literal("OPEN"),
    open: z.string().regex(time24hRegex), // 영업 시작 시각 (24시간 형식, 예: "10:00")
    close: z.string().regex(time24hRegex), // 영업 종료 시각 (24시간 형식, 예: "22:00")
    breakTimes: z.array(BreakTimeSchema), // 브레이크 타임. 없으면 빈 배열
    lastOrderTime: z.string().regex(time24hRegex).optional(), // 라스트 오더 시간 (선택 사항)
  })
  .strict();

const ClosedOperationScheduleSchema = z
  .object({
    daysOfWeek: DaysOfWeekSchema, // 휴무 요일 목록
    status: z.literal("CLOSED"),
  })
  .strict();

const OperationScheduleSchema = z.discriminatedUnion("status", [
  OpenOperationScheduleSchema, // 영업 일정
  ClosedOperationScheduleSchema, // 휴무 일정
]);
export type OperationSchedule = z.infer<typeof OperationScheduleSchema>;

export const OperationInfoSchema = z
  .object({
    timezone: z.literal("Asia/Seoul"),  // 시간대 (현재는 "Asia/Seoul"로 고정)
    schedules: z.array(OperationScheduleSchema).min(1),  // 운영 일정 목록 (최소 1개)
  })
  .strict()
  .superRefine((operationInfo, ctx) => {
    const seenDays = new Set<DayOfWeek>();  // 중복된 요일 체크

    operationInfo.schedules.forEach((schedule, scheduleIndex) => {   // 각 일정의 요일을 순회하며 중복 여부 확인
      schedule.daysOfWeek.forEach((dayOfWeek, dayIndex) => {  // 중복된 요일이 이미 seenDays에 있는지 확인
        if (seenDays.has(dayOfWeek)) {  // 중복된 요일이 있으면 에러 추가
          ctx.addIssue({
            code: "custom",
            message: `duplicate operation schedule for ${dayOfWeek}`,
            path: ["schedules", scheduleIndex, "daysOfWeek", dayIndex],
          });
          return;
        }
        seenDays.add(dayOfWeek);
      });
    });

    const missingDays = dayOfWeekValues.filter((dayOfWeek) => !seenDays.has(dayOfWeek));  // 모든 요일이 커버되는지 확인, 누락된 요일이 있으면 에러 추가
    if (missingDays.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `missing operation schedules for ${missingDays.join(", ")}`,
        path: ["schedules"],
      });
    }
  });
export type OperationInfo = z.infer<typeof OperationInfoSchema>;

const ReferenceUrlsSchema = z  // 참고 URL 목록 
  .object({
    kakaoMap: trimmedUrlSchema, // 카카오맵 URL
    naverMap: trimmedUrlSchema, // 네이버맵 URL
    instagram: trimmedUrlSchema.optional(), // 인스타그램 URL (optional)
    others: z.array(trimmedUrlSchema).optional(), // 기타 참고 URL (optional)
  })
  .strict();

export const PlaceRecommendationItemSchema = z
  .object({
    id: z.string().trim().min(1), // 장소 식별자 (내부 ID)
    name: z.string().trim().min(1), // 상호명
    tags: z.array(z.string().trim().min(1)).min(1).max(5), // 태그 1~5개
    contentSummary: z.string().trim().min(1), // 주력 컨텐츠 요약

    mainCategory: z.string().trim().min(1), // 1차 카테고리 (예: "식당", "카페", "술집")
    subCategory: z.string().trim().min(1), // 2차 카테고리 (예: "한식", "이탈리안", "커피숍", "바")

    operationInfo: OperationInfoSchema,  // 운영 정보 (영업 시간, 휴무일 등)
    referenceUrls: ReferenceUrlsSchema, // 참고 URL 목록 (카카오맵, 네이버맵, 인스타그램 등)

    location: OutputLocationItemSchema,  // 장소 위치 정보 (위도, 경도, 도로명 주소 등)
    priceRangePerPerson: PriceRangeSchema, // 예상 인당 가격 범위 (원 단위)
    score: z.number().min(0).max(100), // 추천 점수 (0~100)
    reasons: z.array(z.string().trim().min(1)).min(1), // 추천 근거
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
