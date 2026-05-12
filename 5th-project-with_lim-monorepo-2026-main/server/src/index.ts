import express from "express";

import { createApiResponse, formatServiceName } from "@monorepo/common";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/health", (_req, res) => {
  res.json(
    createApiResponse({
      service: formatServiceName("server"),
      status: "ok"
    })
  );
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
