import { z } from "zod";

export const NaverSearchItemSchema = z
  .object({
    title: z.string().default(""),
    link: z.string().default(""),
    description: z.string().default(""),
  })
  .passthrough();

export type NaverSearchItem = z.infer<typeof NaverSearchItemSchema>;

export const NaverSearchResponseSchema = z
  .object({
    total: z.number().int().nonnegative().default(0),
    items: z.array(NaverSearchItemSchema).default([]),
  })
  .passthrough();

export type NaverSearchResponse = z.infer<typeof NaverSearchResponseSchema>;
