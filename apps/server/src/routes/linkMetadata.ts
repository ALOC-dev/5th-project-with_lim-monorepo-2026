import { createApiError, createApiResponse, LinkMetadataDataSchema } from "@monorepo/api-contracts";
import { getOrFetchStaticUrl } from "@monorepo/recommendation-engine";
import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const LinkMetadataQuerySchema = z
  .object({
    url: z.url(),
  })
  .strict();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = LinkMetadataQuerySchema.safeParse({ url: req.query.url });
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid link URL"));
      return;
    }

    try {
      const { snapshot } = await getOrFetchStaticUrl(parsed.data.url, {});
      res.status(200).json(
        createApiResponse(
          LinkMetadataDataSchema.parse({
            title: snapshot.title ?? null,
            url: snapshot.url,
          }),
        ),
      );
    } catch {
      res.status(200).json(
        createApiResponse({
          title: null,
          url: parsed.data.url,
        }),
      );
    }
  }),
);

export default router;
