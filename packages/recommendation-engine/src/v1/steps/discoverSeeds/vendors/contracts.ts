import { z } from "zod";

export const LocalSeedProviderSchema = z.enum(["kakao", "tmap"]);
export type LocalSeedProvider = z.infer<typeof LocalSeedProviderSchema>;

export const LocalSeedSchema = z
  .object({
    provider: LocalSeedProviderSchema,
    providerPlaceId: z.string().optional(),
    name: z.string(),
    category: z.string(),
    phone: z.string(),
    address: z.string(),
    roadAddress: z.string(),
    longitude: z.number(),
    latitude: z.number(),
    placeUrl: z.string().optional(),
    distanceMeters: z.number().optional(),
  })
  .strict();

export type LocalSeed = z.infer<typeof LocalSeedSchema>;

export const LocalSeedSearchResponseSchema = z
  .object({
    provider: LocalSeedProviderSchema,
    query: z.string(),
    page: z.number().int().positive(),
    count: z.number().int().positive(),
    totalCount: z.number().int().nonnegative(),
    isEnd: z.boolean(),
    seeds: z.array(LocalSeedSchema),
  })
  .strict();

export type LocalSeedSearchResponse = z.infer<typeof LocalSeedSearchResponseSchema>;
