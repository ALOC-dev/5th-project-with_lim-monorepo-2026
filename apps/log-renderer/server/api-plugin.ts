import type { IncomingMessage, ServerResponse } from "node:http";

import type { Plugin } from "vite";

import { LogCatalog } from "./catalog";

const API_PREFIX = "/__log-renderer/api";

const sendJson = (response: ServerResponse, statusCode: number, value: unknown): void => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
};

const toNonNegativeInteger = (value: string | null, fallback: number): number => {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
};

const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  catalog: LogCatalog,
): Promise<boolean> => {
  if (!request.url || request.method !== "GET") return false;
  const url = new URL(request.url, "http://127.0.0.1");
  if (!url.pathname.startsWith(API_PREFIX)) return false;

  try {
    if (url.pathname === `${API_PREFIX}/runs`) {
      sendJson(response, 200, { runs: await catalog.listRuns() });
      return true;
    }

    const eventsMatch = new RegExp(`^${API_PREFIX}/runs/([^/]+)/events$`).exec(url.pathname);
    if (eventsMatch?.[1]) {
      const chunk = await catalog.readEvents(
        decodeURIComponent(eventsMatch[1]),
        toNonNegativeInteger(url.searchParams.get("offset"), 0),
        toNonNegativeInteger(url.searchParams.get("line"), 1),
        url.searchParams.get("fileToken") ?? undefined,
      );
      if (!chunk) sendJson(response, 404, { error: "Events artifact not found" });
      else sendJson(response, 200, chunk);
      return true;
    }

    const runMatch = new RegExp(`^${API_PREFIX}/runs/([^/]+)$`).exec(url.pathname);
    if (runMatch?.[1]) {
      const run = await catalog.getRun(decodeURIComponent(runMatch[1]));
      if (!run) sendJson(response, 404, { error: "Run not found" });
      else sendJson(response, 200, run);
      return true;
    }

    sendJson(response, 404, { error: "Unknown log renderer endpoint" });
    return true;
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
};

export const createLogRendererApiPlugin = ({ logRoot }: { logRoot: string }): Plugin => {
  const catalog = new LogCatalog(logRoot);
  return {
    name: "aloc-log-renderer-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        void handleRequest(request, response, catalog).then((handled) => {
          if (!handled) next();
        });
      });
    },
  };
};
