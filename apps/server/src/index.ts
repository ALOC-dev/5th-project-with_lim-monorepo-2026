import { createApiResponse } from "@monorepo/api-contracts";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { parseServerEnvironment } from "./config/env.js";
import { createRecommendationRouter } from "./recommendation/router.js";
import authRouter from "./routes/auth.js";
import favoritesRouter from "./routes/favorites.js";
import placeRecommendationHistoriesRouter from "./routes/placeRecommendationHistories.js";
import savedPlacesRouter from "./routes/savedPlaces.js";
import usersRouter from "./routes/users.js";

const { config, secrets } = parseServerEnvironment(process.env);

const app = express();
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/place-recommendation-histories", placeRecommendationHistoriesRouter);
app.use("/api/recommend", createRecommendationRouter(secrets));
app.use("/api/saved-places", savedPlacesRouter);
app.use("/api/users", usersRouter);

const formatServiceName = (name: string): string => name.trim().toUpperCase();
app.get("/health", (_req, res) => {
  // api 받아서 처리
  res.json(
    createApiResponse({
      service: formatServiceName("server"),
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
  );
});

app.listen(config.port, () => {
  console.log(`Server is running on http://localhost:${config.port}`);
});
