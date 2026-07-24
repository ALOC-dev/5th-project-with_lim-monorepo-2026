import { z } from "zod";

export const PaginationQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const NextCursorSchema = z.string().trim().min(1).nullable();
