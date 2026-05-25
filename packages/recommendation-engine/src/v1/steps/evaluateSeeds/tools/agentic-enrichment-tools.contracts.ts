import { z } from "zod";

const AgenticEnrichmentSourceSchema = z.enum([
  "agentic",
  "kakao-local",
  "naver-search",
  "naver-map",
]);

export const AgenticFinalizeCandidateEvidenceSchema = z
  .object({
    selectedSource: AgenticEnrichmentSourceSchema,
    rawTextSnippet: z.string().default(""),
    sourceUrls: z.array(z.string().url()).default([]),
    reason: z.string().min(1),
    confidence: z.number().min(0).max(1).default(0),
    identityMatchScore: z.number().min(0).max(1).optional(),
    webMentionCount: z.number().int().nonnegative().optional(),
    sourceAgreementCount: z.number().int().nonnegative().optional(),
  })
  .strict();

export type AgenticFinalizeCandidateEvidence = z.infer<
  typeof AgenticFinalizeCandidateEvidenceSchema
>;

export const EmptyToolInputSchema = z.object({});

export const AgenticSearchEvidenceInputSchema = z.object({
  query: z
    .string()
    .min(2)
    .describe("Korean search query including place name and 영업시간."),
});

export const AgenticFetchUrlInputSchema = z.object({
  url: z.string().url(),
});
