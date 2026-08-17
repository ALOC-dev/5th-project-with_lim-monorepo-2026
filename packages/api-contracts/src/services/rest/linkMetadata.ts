import { z } from "zod";

export const LinkMetadataDataSchema = z
  .object({
    title: z.string().trim().min(1).max(200).nullable(),
    url: z.url(),
  })
  .strict();

export type LinkMetadataData = z.infer<typeof LinkMetadataDataSchema>;
