import ky from "ky";

const DEFAULT_SERVER_API_BASE_URL =
  import.meta.env.DEV && typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000";

export const serverApiBaseUrl =
  (import.meta.env.VITE_SERVER_API_BASE_URL as string | undefined)?.trim() ||
  DEFAULT_SERVER_API_BASE_URL;

// AuthProvider가 마운트 시 등록한다. 세션이 만료된 뒤 어떤 요청이든 401을 받으면
// 로그인 화면으로 돌아갈 수 있도록 인증 상태를 초기화해야 하는데, 이 모듈은 React
// 트리 바깥에 있어 context를 직접 쓸 수 없으므로 콜백을 주입받는 방식을 쓴다.
let unauthorizedHandler: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  unauthorizedHandler = handler;
};

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
  hooks: {
    afterResponse: [
      ({ response }) => {
        if (response.status === 401) {
          unauthorizedHandler?.();
        }
        return response;
      },
    ],
  },
});
