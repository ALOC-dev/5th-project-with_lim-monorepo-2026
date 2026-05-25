import { z } from "zod";

import { LocalSeedSchema } from "./vendors/contracts.js";

export const EvaluateSeedsRetryReasonSchema = z.enum([
  "ZERO_SEEDS",
  "LOW_QUALITY",
  "TOO_FEW_OPEN_NOW",
  "LOW_APPROACH_MATCH",
  "DUPLICATE_HEAVY",
  "REFERENCE_URL_REJECTED_HEAVY",
]);

export type EvaluateSeedsRetryReason = z.infer<typeof EvaluateSeedsRetryReasonSchema>;

export const SearchQuerySchema = z
  .object({
    query: z.string().min(1),
    page: z.number().int().positive().default(1),
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

export const DiscoveryContextSchema = z
  .object({
    attemptNo: z.number().int().positive(),
    targetSeedCount: z.number().int().positive(),
    queries: z.array(SearchQuerySchema),
    alreadyCheckedIds: z.array(z.string()),
    previousFailureReason: EvaluateSeedsRetryReasonSchema.optional(),
  })
  .superRefine((context, issues) => {
    if (context.attemptNo === 1 && context.queries.length === 0) {
      issues.addIssue({
        code: z.ZodIssueCode.custom,
        message: "initial DiscoveryContext must include at least one query",
        path: ["queries"],
      });
      return;
    }

    const totalRequested = context.queries.reduce((total, query) => total + query.count, 0);
    if (context.attemptNo === 1 && totalRequested !== context.targetSeedCount) {
      issues.addIssue({
        code: z.ZodIssueCode.custom,
        message: `queries[].count sum must equal targetSeedCount (${context.targetSeedCount}), but got ${totalRequested}`,
        path: ["queries"],
      });
    }
    if (context.attemptNo > 1 && totalRequested > context.targetSeedCount) {
      issues.addIssue({
        code: z.ZodIssueCode.custom,
        message: `retry queries[].count sum must not exceed targetSeedCount (${context.targetSeedCount}), but got ${totalRequested}`,
        path: ["queries"],
      });
    }
  })
  .strict();

export type DiscoveryContext = z.infer<typeof DiscoveryContextSchema>;

export const DiscoverSeedsOutputSchema = z
  .object({
    seeds: z.array(LocalSeedSchema),
    seedKeys: z.array(z.string()),
    excludedSeedKeysApplied: z.array(z.string()),
    nextQueries: z.array(SearchQuerySchema),
    attemptNo: z.number().int().positive(),
  })
  .strict();

export type DiscoverSeedsOutput = z.infer<typeof DiscoverSeedsOutputSchema>;
