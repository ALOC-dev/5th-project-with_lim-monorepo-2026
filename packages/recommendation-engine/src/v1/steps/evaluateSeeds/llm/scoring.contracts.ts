import { z } from "zod";

export const LlmCandidateEvaluationSchema = z
  .object({
    candidateId: z.string().min(1),
    inputMatch: z.number().min(0).max(100),
    trust: z.number().min(0).max(100),
    accessibility: z.number().min(0).max(100),
    diversity: z.number().min(0).max(100),
    matchedSignals: z.array(
      z.object({
        label: z.string().min(1),
        evidenceRefs: z.array(z.string()),
        confidence: z.number().min(0).max(1),
      }),
    ),
    negativeSignals: z.array(
      z.object({
        label: z.string().min(1),
        evidenceRefs: z.array(z.string()),
        severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
      }),
    ),
    rationaleFacts: z.array(z.string().min(1)),
  })
  .strict();

export type LlmCandidateEvaluation = z.infer<
  typeof LlmCandidateEvaluationSchema
>;

export const LlmCandidateEvaluationsResponseSchema = z
  .object({
    evaluations: z.array(LlmCandidateEvaluationSchema),
  })
  .strict();

export type LlmCandidateEvaluationsResponse = z.infer<
  typeof LlmCandidateEvaluationsResponseSchema
>;
