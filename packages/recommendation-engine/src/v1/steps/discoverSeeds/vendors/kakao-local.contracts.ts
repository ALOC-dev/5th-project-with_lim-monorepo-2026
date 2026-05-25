import { z } from "zod";

const KakaoSameNameSchema = z
  .object({
    region: z.array(z.string()),
    keyword: z.string(),
    selected_region: z.string(),
  })
  .strict();

export const KakaoLocalMetaSchema = z
  .object({
    total_count: z.number().int().nonnegative(),
    pageable_count: z.number().int().nonnegative(),
    is_end: z.boolean(),
    same_name: KakaoSameNameSchema.nullable(),
  })
  .strict();

export const KakaoLocalItemSchema = z
  .object({
    id: z.string(),
    place_name: z.string(),
    category_name: z.string(),
    category_group_code: z.string(),
    category_group_name: z.string(),
    phone: z.string(),
    address_name: z.string(),
    road_address_name: z.string(),
    x: z.string(),
    y: z.string(),
    place_url: z.string(),
    distance: z.string(),
  })
  .strict();

export type KakaoLocalItem = z.infer<typeof KakaoLocalItemSchema>;

export const KakaoLocalSearchResponseSchema = z
  .object({
    meta: KakaoLocalMetaSchema,
    documents: z.array(KakaoLocalItemSchema),
  })
  .strict();

export type KakaoLocalSearchResponse = z.infer<typeof KakaoLocalSearchResponseSchema>;
