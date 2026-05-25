import express from "express";
import cors from "cors";
import { createApiResponse, formatServiceName } from "@monorepo/api-contracts";

const app = express();
app.use(cors());

const port = 3000;

app.get("/health", (_req, res) => {
  res.json(
    createApiResponse({
      service: formatServiceName("server"),
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
  );
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
