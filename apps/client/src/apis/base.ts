import ky from "ky";

const DEFAULT_SERVER_API_BASE_URL = "http://localhost:3000";

const serverApiBaseUrl =
  (import.meta.env.VITE_SERVER_API_BASE_URL as string | undefined)?.trim() ||
  DEFAULT_SERVER_API_BASE_URL;

export const serverApi = ky.create({
  prefix: serverApiBaseUrl,
  timeout: 10_000,
  credentials: "include",
  retry: {
    limit: 1,
    methods: ["get"],
    statusCodes: [408, 429, 500, 502, 503, 504],
    retryOnTimeout: true,
  },
  headers: {
    Accept: "application/json",
  },
});
