import { z } from "zod";

const nonNegativeFiniteNumberSchema = z.number().gte(0);

export const LocationItemSchema = z
  .object({
    lat: z.number().min(-90).max(90), // 위도
    lng: z.number().min(-180).max(180), // 경도
  })
  .strict();
export type LocationItem = z.infer<typeof LocationItemSchema>;

export const LocationListSchema = z.array(LocationItemSchema);
export type LocationList = z.infer<typeof LocationListSchema>;

export const LocationInputSchema = LocationListSchema;
export type LocationInput = z.infer<typeof LocationInputSchema>;

export const PartyTypeSchema = z.enum(["FAMILY", "FRIENDS", "LOVERS", "COLLEAGUES"]);
export type PartyType = z.infer<typeof PartyTypeSchema>;

export const BudgetRangeSchema = z
  .tuple([nonNegativeFiniteNumberSchema, nonNegativeFiniteNumberSchema]) // 예산 범위 [최소, 최대]
  .refine(([min, max]) => min <= max, {
    message: "budget min must be less than or equal to max",
  });
export type BudgetRange = z.infer<typeof BudgetRangeSchema>;

export const PriceRangeSchema = BudgetRangeSchema;
export type PriceRange = z.infer<typeof PriceRangeSchema>;
