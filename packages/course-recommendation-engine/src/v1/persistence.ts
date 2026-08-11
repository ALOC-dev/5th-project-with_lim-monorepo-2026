import type { PlaceRecommendationItem } from "@monorepo/recommendation-engine/v1/contracts";
import { z } from "zod";

import type { CourseRecommendationItem, CourseUserOutput } from "./contracts.js";

/**
 * 엔진 출력을 `course_options` / `course_places` 저장 형태로 옮긴다.
 *
 * 필드 이름은 DB 컬럼과 1:1로 맞추되 camelCase를 쓴다(drizzle 스키마 규약).
 * 컬럼이 없어서 담지 못하는 값은 버리지 않고 `unmapped`에 모아 두므로,
 * 나중에 컬럼이 생기면 매핑만 옮기면 된다.
 */

const time24hRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 코스 장소가 어디서 왔는지. `course_places.source`에 그대로 들어간다. */
export const COURSE_PLACE_SOURCE = {
  RECOMMENDATION: "RECOMMENDATION",
  FAVORITE: "FAVORITE",
} as const;
export type CoursePlaceSource = (typeof COURSE_PLACE_SOURCE)[keyof typeof COURSE_PLACE_SOURCE];

export const CourseOptionRowSchema = z
  .object({
    optionType: z.string().trim().min(1),
    totalDurationMinutes: z.number().int().gte(0),
    totalTravelMinutes: z.number().int().gte(0),
    pricePerPersonWon: z.number().int().gte(0),
    reason: z.string().trim().min(1),
    favorite: z.boolean(),
  })
  .strict();
export type CourseOptionRow = z.infer<typeof CourseOptionRowSchema>;

export const CoursePlaceRowSchema = z
  .object({
    sequence: z.number().int().positive(),
    source: z.string().trim().min(1),
    kakaoPlaceId: z.string().trim().min(1).nullable(),
    favoritePlaceId: z.string().trim().min(1).nullable(),
    name: z.string().trim().min(1),
    address: z.string().trim().min(1).nullable(),
    lat: z.number(),
    lng: z.number(),
    category: z.string().trim().min(1).nullable(),
    visitTime: z.string().regex(time24hRegex),
    stayDurationMinutes: z.number().int().positive(),
    activityType: z.string().trim().min(1).nullable(),
  })
  .strict();
export type CoursePlaceRow = z.infer<typeof CoursePlaceRowSchema>;

/** 현재 스키마에 담을 컬럼이 없는 값들. 버리지 않고 넘겨 둔다. */
export const CourseUnmappedFieldsSchema = z
  .object({
    engineCourseId: z.string(),
    title: z.string(),
    courseTypeLabel: z.string(),
    courseTypeDescription: z.string(),
    score: z.number(),
    scoreBreakdown: z.record(z.string(), z.number()),
    pricePerPersonWonRange: z.tuple([z.number().int(), z.number().int()]),
    reasonCodes: z.array(z.string()),
    reasonTexts: z.array(z.string()),
    tradeoffs: z.array(z.string()),
    mealPlanStatus: z.string(),
    mealPlanReason: z.string(),
    startTime24h: z.string(),
    endTime24h: z.string(),
    totalStayMinutes: z.number().int().gte(0),
    /** 장소별 이동/대기 시간. `course_places`에 대응 컬럼이 없다. */
    placeTravelMinutes: z.array(z.number().int().gte(0)),
    placeWaitMinutes: z.array(z.number().int().gte(0)),
  })
  .strict();
export type CourseUnmappedFields = z.infer<typeof CourseUnmappedFieldsSchema>;

export type CoursePersistencePayload = {
  option: CourseOptionRow;
  places: CoursePlaceRow[];
  unmapped: CourseUnmappedFields;
  /** 이 payload를 그대로 넣으면 스키마 제약에 걸리는 지점. */
  warnings: string[];
};

export type CoursePersistenceOptions = {
  /** 사용자가 이미 찜해둔 장소. 카카오 장소 ID -> favorite_places.id */
  favoritePlaceIdByKakaoPlaceId?: Record<string, string>;
  /** `course_options.favorite` 초기값. 기본 false(사용자가 나중에 고른다). */
  favorite?: boolean;
};

const KAKAO_PLACE_ID_PATTERN = /place\.map\.kakao\.com\/(\d+)/;

/**
 * 카카오 장소 ID는 `referenceUrls.kakaoMap`에만 존재하고 그 URL 자체가 optional이다.
 * (네이버맵만 있는 장소가 계약상 허용된다.) 숫자 ID만 인정하고, 없으면 null을 준다.
 */
const toKakaoPlaceId = (place: PlaceRecommendationItem): string | null => {
  const url = place.referenceUrls.kakaoMap;
  if (!url) return null;
  return KAKAO_PLACE_ID_PATTERN.exec(url)?.[1] ?? null;
};

const toPricePerPersonWon = (range: readonly [number, number]): number =>
  Math.round((range[0] + range[1]) / 2);

export const toCoursePersistencePayload = (
  course: CourseRecommendationItem,
  options: CoursePersistenceOptions = {},
): CoursePersistencePayload => {
  const favoriteIdByKakaoId = options.favoritePlaceIdByKakaoPlaceId ?? {};
  const placeById = new Map(course.places.map((place) => [place.id, place]));
  const warnings: string[] = [];

  const places = course.timeline.map((item, index) => {
    const place = placeById.get(item.placeId);
    if (!place) throw new Error(`Timeline references unknown place: ${item.placeId}`);

    const kakaoPlaceId = toKakaoPlaceId(place);
    if (kakaoPlaceId === null) {
      warnings.push(
        `${place.name}: 카카오 장소 ID가 없어 kakao_place_id를 채울 수 없습니다 (NOT NULL 컬럼).`,
      );
    }

    const favoritePlaceId = kakaoPlaceId ? (favoriteIdByKakaoId[kakaoPlaceId] ?? null) : null;

    return CoursePlaceRowSchema.parse({
      sequence: index + 1,
      source: favoritePlaceId ? COURSE_PLACE_SOURCE.FAVORITE : COURSE_PLACE_SOURCE.RECOMMENDATION,
      kakaoPlaceId,
      favoritePlaceId,
      name: place.name,
      address: place.location.roadAddressKo,
      lat: place.location.lat,
      lng: place.location.lng,
      // 2단 카테고리를 두 컬럼에 나눠 담는다.
      // category   <- 무슨 종류의 장소인가 (한식, 커피숍, 미디어아트)
      // activity_type <- 거기서 무엇을 하는가 (식당, 카페, 전시)
      category: place.subCategory,
      visitTime: item.time24h,
      stayDurationMinutes: item.stayDurationMinutes,
      activityType: place.mainCategory,
    });
  });

  const option = CourseOptionRowSchema.parse({
    optionType: course.courseType.key,
    totalDurationMinutes: course.summary.estimatedTotalMinutes,
    totalTravelMinutes: course.summary.estimatedTravelMinutes,
    // price_per_person_won이 단일 int4라 범위를 중간값으로 접는다.
    // 원본 범위는 unmapped.pricePerPersonWonRange에 남는다.
    pricePerPersonWon: toPricePerPersonWon(course.summary.estimatedCostPerPerson),
    // reason이 단일 text라 문장들을 이어 붙인다. 원본 배열은 unmapped에 남는다.
    reason: course.selection.reasonTexts.join(" "),
    favorite: options.favorite ?? false,
  });

  if (course.summary.estimatedCostPerPerson[0] !== course.summary.estimatedCostPerPerson[1]) {
    warnings.push(
      `1인당 비용이 ${course.summary.estimatedCostPerPerson[0]}~${course.summary.estimatedCostPerPerson[1]}원 범위인데 ` +
        `price_per_person_won이 단일 값이라 중간값 ${option.pricePerPersonWon}원으로 접었습니다.`,
    );
  }

  const unmapped = CourseUnmappedFieldsSchema.parse({
    engineCourseId: course.id,
    title: course.title,
    courseTypeLabel: course.courseType.label,
    courseTypeDescription: course.courseType.description,
    score: course.score,
    scoreBreakdown: course.scoreBreakdown,
    pricePerPersonWonRange: course.summary.estimatedCostPerPerson,
    reasonCodes: course.selection.reasonCodes,
    reasonTexts: course.selection.reasonTexts,
    tradeoffs: course.selection.tradeoffs,
    mealPlanStatus: course.mealPlan.status,
    mealPlanReason: course.mealPlan.reason,
    startTime24h: course.startTime24h,
    endTime24h: course.endTime24h,
    totalStayMinutes: course.totalStayMinutes,
    placeTravelMinutes: course.timeline.map((item) => item.travelMinutesFromPrevious),
    placeWaitMinutes: course.timeline.map((item) => item.waitMinutesFromPrevious),
  });

  return { option, places, unmapped, warnings };
};

/** 코스 추천 결과 전체를 `courses` 1건에 달릴 옵션들로 변환한다. */
export const toCoursePersistencePayloads = (
  output: CourseUserOutput,
  options: CoursePersistenceOptions = {},
): CoursePersistencePayload[] =>
  output.courses.map((course) => toCoursePersistencePayload(course, options));
