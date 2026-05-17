import { z } from "zod";

import { LocalSeedSchema } from "./vendors/types.js";

export const EvaluateSeedsRetryReasonSchema = z.enum([
  "LOW_QUALITY",
  "TOO_FEW_OPEN_NOW",
  "LOW_APPROACH_MATCH",
  "DUPLICATE_HEAVY",
]);

export type EvaluateSeedsRetryReason = z.infer<
  typeof EvaluateSeedsRetryReasonSchema
>;

export const SearchApproachSchema = z
  .object({
    name: z.string().min(1),
    weight: z.number().positive(),
  })
  .strict();

export type SearchApproach = z.infer<typeof SearchApproachSchema>;

export const DiscoveryContextSchema = z
  .object({
    attemptNo: z.number().int().positive(),
    targetSeedCount: z.number().int().positive(),
    excludedSeedKeys: z.array(z.string()),
    visitedSearchKeys: z.array(z.string()),
    previousFailureReason: EvaluateSeedsRetryReasonSchema.optional(),
    // evaluateSeeds가 직전 attempt 결과를 보고 "다음엔 이 접근들로 검색해라"라고
    // 풀스키마 SearchApproach[]로 직접 지시하는 채널.
    // 비어 있으면 discoverSeeds가 LLM으로 자연어 → 접근 추출을 수행한다.
    // 접근 추출(name/weight) 책임을 evaluateSeeds로 옮겨, drop/reweight/add 정책을
    // evaluateSeeds 내부에서 자유롭게 결정할 수 있게 한다.
    presetApproaches: z.array(SearchApproachSchema).optional(),
  })
  .strict();

export type DiscoveryContext = z.infer<typeof DiscoveryContextSchema>;

export const SearchQuerySchema = z
  .object({
    approachName: z.string().min(1),
    query: z.string().min(1),
    searchKey: z.string().min(1),
    page: z.number().int().positive(),
    count: z.number().int().positive(),
    location: z
      .object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-90).max(90),
        radiusKm: z.number().positive(),
      })
      .optional(),
  })
  .strict();

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SeedDiscoveryPlanSchema = z
  .object({
    attemptNo: z.number().int().positive(),
    approaches: z.array(SearchApproachSchema).min(1),
    queries: z.array(SearchQuerySchema).min(1),
    targetSeedCount: z.number().int().positive(),
    overfetchMultiplier: z.number().positive(),
  })
  .strict();

export type SeedDiscoveryPlan = z.infer<typeof SeedDiscoveryPlanSchema>;

export const DiscoverSeedsOutputSchema = z
  .object({
    plan: SeedDiscoveryPlanSchema,
    seeds: z.array(LocalSeedSchema),
    seedKeys: z.array(z.string()),
    excludedSeedKeysApplied: z.array(z.string()),
    visitedSearchKeysAdded: z.array(z.string()),
    attemptNo: z.number().int().positive(),
  })
  .strict();

export type DiscoverSeedsOutput = z.infer<typeof DiscoverSeedsOutputSchema>;

export type DiscoverSeedsProcessResult =
  | { ok: true; data: DiscoverSeedsOutput }
  | {
      ok: false;
      failedStep: "discoverSeeds";
      errorCode:
        | "DISCOVER_SEEDS_PLAN_ERROR"
        | "DISCOVER_SEEDS_PROVIDER_ERROR"
        | "DISCOVER_SEEDS_POSTPROCESSING_ERROR";
      message: string;
    };
