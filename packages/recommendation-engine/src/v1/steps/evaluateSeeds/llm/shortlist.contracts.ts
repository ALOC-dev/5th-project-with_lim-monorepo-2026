import { z } from "zod";

/**
 * 조사 대상을 고르기 위한 사전 평가.
 *
 * 점수는 **절대 기준**으로 매기게 한다. 후보가 많으면 나눠서 호출하는데, "이 묶음
 * 안에서 몇 등"으로 매기면 묶음마다 기준이 달라져 서로 비교할 수 없게 된다.
 * `diversity` 지표에서 실제로 그 문제를 겪었다 — 같은 업종만 모인 결과에서도
 * 점수가 35점씩 벌어졌다.
 */
export const LlmShortlistItemSchema = z
  .object({
    candidateId: z.string().trim().min(1),
    /** 0~100. 요청 조건에 얼마나 맞아 보이는지. */
    relevance: z.number().min(0).max(100),
  })
  .strict();

export const LlmShortlistResponseSchema = z
  .object({
    items: z.array(LlmShortlistItemSchema),
  })
  .strict();

export type LlmShortlistItem = z.infer<typeof LlmShortlistItemSchema>;
