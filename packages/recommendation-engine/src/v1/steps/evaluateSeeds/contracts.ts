import { z } from "zod";

import { PlaceRecommendationItemSchema } from "../../interfaces/output.contracts.js";

export const ScoreBreakdownSchema = z
  .object({
    inputMatch: z.number().min(0).max(100),
    trust: z.number().min(0).max(100),
    accessibility: z.number().min(0).max(100),
    diversity: z.number().min(0).max(100),
    total: z.number().min(0).max(100),
  })
  .strict();
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const MatchedSignalSchema = z
  .object({
    label: z.string().trim().min(1),
    evidenceRefs: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const NegativeSignalSchema = z
  .object({
    label: z.string().trim().min(1),
    evidenceRefs: z.array(z.string()),
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  })
  .strict();

export const EvaluateSeedsEvaluationSchema = z
  .object({
    itemId: z.string().min(1),
    scores: ScoreBreakdownSchema,
    matchedSignals: z.array(MatchedSignalSchema),
    negativeSignals: z.array(NegativeSignalSchema),
    rationaleFacts: z.array(z.string().min(1)),
  })
  .strict();
export type EvaluateSeedsEvaluation = z.infer<
  typeof EvaluateSeedsEvaluationSchema
>;

export const EvaluateSeedsOutputSchema = z
  .object({
    items: z.array(PlaceRecommendationItemSchema),
    evaluations: z.array(EvaluateSeedsEvaluationSchema),
  })
  .strict();
export type EvaluateSeedsOutput = z.infer<typeof EvaluateSeedsOutputSchema>;
