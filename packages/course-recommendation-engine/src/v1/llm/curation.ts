import { z } from "zod";

import type { CourseRecommendationItem } from "../contracts.js";
import { COURSE_LLM_MODEL_ID, generateCourseObject } from "./ai-sdk.js";

export const CourseCurationCandidateSchema = z
  .object({
    courseId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    placeNames: z.array(z.string().trim().min(1)),
    categories: z.array(z.string().trim().min(1)),
    timelineLabels: z.array(z.string().trim().min(1)),
    estimatedCostPerPerson: z.tuple([z.number().int().gte(0), z.number().int().gte(0)]),
    estimatedTotalMinutes: z.number().int().gte(0),
    estimatedTravelMinutes: z.number().int().gte(0),
    mealPlanStatus: z.string().trim().min(1),
    deterministicScore: z.number().min(0).max(100),
  })
  .strict();
export type CourseCurationCandidate = z.infer<typeof CourseCurationCandidateSchema>;

export const CourseCurationPickSchema = z
  .object({
    courseId: z.string().trim().min(1),
    title: z.string().trim().min(1).max(40),
    courseType: z
      .object({
        key: z.string().trim().min(1).max(30),
        label: z.string().trim().min(1).max(20),
        description: z.string().trim().min(1).max(80),
      })
      .strict(),
    selection: z
      .object({
        reasonCodes: z.array(z.string().trim().min(1).max(30)).min(1).max(5),
        reasonTexts: z.array(z.string().trim().min(1).max(70)).min(1).max(3),
        tradeoffs: z.array(z.string().trim().min(1).max(70)).max(3),
      })
      .strict(),
  })
  .strict();
export type CourseCurationPick = z.infer<typeof CourseCurationPickSchema>;

export const CourseCurationResponseSchema = z
  .object({
    picks: z.array(CourseCurationPickSchema).min(1),
  })
  .strict();
export type CourseCurationResponse = z.infer<typeof CourseCurationResponseSchema>;

export type CourseCurationRequest = {
  candidates: CourseCurationCandidate[];
  targetCourseCount: number;
  openAiApiKey?: string;
  signal?: AbortSignal;
};

export type CourseCurationClient = (
  request: CourseCurationRequest,
) => Promise<CourseCurationResponse>;

const CURATION_SYSTEM_PROMPT = `너는 코스 추천 결과 큐레이터다.
알고리즘이 만든 유효한 코스 후보 중에서 사용자에게 보여줄 코스를 고른다.

규칙:
- 입력된 courseId 중에서만 고른다.
- 같은 courseId를 중복 선택하지 않는다.
- 가능하면 서로 강점이 다른 코스를 고른다.
- 새 장소, 새 시간, 새 이동정보를 만들지 않는다.
- title은 코스의 성격이 드러나게 짧은 한국어로 작성한다.
- courseType.key와 selection.reasonCodes는 LOW_TRAVEL, DIVERSE_CATEGORIES, MEAL_INCLUDED, LONG_DURATION_FIT, RELAXED_FLOW, LOW_COST, SIMPLE_FLOW 같은 안정적인 대문자 코드로 작성한다.
- selection.reasonTexts는 후보 metrics와 timeline에 근거한 완결된 짧은 문장만 작성한다.
- selection.reasonTexts 한 문장에는 장소를 2개까지만 언급한다.
- selection.reasonTexts에 timeline 전체를 길게 복사하지 않는다.
- selection.tradeoffs는 이 코스의 약점이나 감안할 점만 작성하고, 없으면 빈 배열로 둔다.
- 출력은 JSON schema만 따른다.`;

export const createOpenAiCourseCurationClient =
  (modelId = COURSE_LLM_MODEL_ID): CourseCurationClient =>
  async ({ candidates, targetCourseCount, openAiApiKey, signal }) => {
    const response = await generateCourseObject({
      task: "course.curation",
      modelId,
      openAiApiKey,
      signal,
      schema: CourseCurationResponseSchema,
      system: CURATION_SYSTEM_PROMPT,
      prompt: [
        "다음 코스 후보 중 최종 추천 코스를 골라줘.",
        "```json",
        JSON.stringify(
          {
            targetCourseCount,
            candidates,
          },
          null,
          2,
        ),
        "```",
      ].join("\n"),
    });

    return validateCurationResponse(response, candidates, targetCourseCount);
  };

export const toCourseCurationCandidate = (
  course: CourseRecommendationItem,
): CourseCurationCandidate =>
  CourseCurationCandidateSchema.parse({
    courseId: course.id,
    title: course.title,
    placeNames: course.places.map((place) => place.name),
    categories: course.places.map((place) => `${place.mainCategory}/${place.subCategory}`),
    timelineLabels: course.timeline.map((item) => item.label),
    estimatedCostPerPerson: course.summary.estimatedCostPerPerson,
    estimatedTotalMinutes: course.summary.estimatedTotalMinutes,
    estimatedTravelMinutes: course.summary.estimatedTravelMinutes,
    mealPlanStatus: course.mealPlan.status,
    deterministicScore: course.score,
  });

const validateCurationResponse = (
  response: CourseCurationResponse,
  candidates: CourseCurationCandidate[],
  targetCourseCount: number,
): CourseCurationResponse => {
  const candidateIds = new Set(candidates.map((candidate) => candidate.courseId));
  const seenIds = new Set<string>();
  const picks: CourseCurationPick[] = [];

  for (const pick of response.picks) {
    if (!candidateIds.has(pick.courseId) || seenIds.has(pick.courseId)) continue;
    seenIds.add(pick.courseId);
    picks.push(pick);
    if (picks.length >= targetCourseCount) break;
  }

  if (picks.length === 0) {
    throw new Error("Course curation returned no valid course picks");
  }

  return { picks };
};
