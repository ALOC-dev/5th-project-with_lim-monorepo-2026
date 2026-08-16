import { z } from "zod";

/**
 * The display metadata for a form origin. The recommendation engine only needs
 * coordinates, while a retry needs the label and road address that the user saw.
 */
export const PlaceRecommendationFormLocationSnapshotSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    placeName: z.string().max(120).optional(),
    roadNameAddress: z
      .string()
      .min(1)
      .max(240)
      .refine((value) => value.trim().length > 0, "roadNameAddress must not be blank"),
  })
  .strict();

export type PlaceRecommendationFormLocationSnapshot = z.infer<
  typeof PlaceRecommendationFormLocationSnapshotSchema
>;

/**
 * Public request body for creating a recommendation job. `input` intentionally
 * remains opaque here because the engine owns its input contract; the server
 * validates it with `UserInputSchema` at the engine boundary.
 */
export const PlaceRecommendationJobRequestSchema = z
  .object({
    input: z.unknown(),
    formLocations: z.array(PlaceRecommendationFormLocationSnapshotSchema).min(1).max(8),
  })
  .strict();

export type PlaceRecommendationJobRequest = z.infer<
  typeof PlaceRecommendationJobRequestSchema
>;
