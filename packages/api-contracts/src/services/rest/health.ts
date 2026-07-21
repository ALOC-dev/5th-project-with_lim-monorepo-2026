import z from "zod";

export const HealthDataSchema = z.object({
  service: z.string(),
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
});

export type HealthData = z.infer<typeof HealthDataSchema>;
