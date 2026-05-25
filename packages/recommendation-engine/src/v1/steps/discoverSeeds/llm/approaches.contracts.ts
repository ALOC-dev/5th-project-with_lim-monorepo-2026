import { z } from "zod";

export const MIN_DISCOVERY_TERM_COUNT = 1;
export const MAX_DISCOVERY_TERM_COUNT = 4;

const LlmDiscoveryContextQuerySchema = z
  .object({
    query: z.string().trim().min(1),
    count: z.number().int().positive(),
    page: z.number().int().positive(),
  })
  .strict();

export const LlmDiscoveryContextResponseSchema = z
  .object({
    queries: z
      .array(LlmDiscoveryContextQuerySchema)
      .min(MIN_DISCOVERY_TERM_COUNT)
      .max(MAX_DISCOVERY_TERM_COUNT),
  })
  .strict();
