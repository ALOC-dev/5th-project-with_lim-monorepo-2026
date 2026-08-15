import type { Logger } from "../../../../observability/logger.js";

const DEFAULT_MIN_INTERVAL_MS = 250;
const DEFAULT_MAX_COOLDOWN_MS = 15_000;
const MAX_ADAPTIVE_INTERVAL_MS = 2_000;
const SUCCESSFUL_REQUESTS_TO_RELAX_INTERVAL = 4;

type QueueTask<T> = {
  endpoint: "blog" | "webkr";
  enqueuedAt: number;
  logger?: Logger;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export type NaverSearchQueueOptions = {
  minIntervalMs?: number;
  maxCooldownMs?: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
};

/**
 * Naver Search API는 서버 process 전체에서 quota를 공유한다. 후보별 cascade만
 * 제한하면 동시 요청 여러 건이 다시 burst를 만들므로, blog/webkr 모두 이 FIFO lane을
 * 통과시킨다. 429를 낸 작업은 재시도하지 않고 실패시키되, 뒤의 작업은 cooldown 뒤에
 * 원래 순서대로 재개한다.
 */
export class NaverSearchQueue {
  private readonly queue: QueueTask<unknown>[] = [];
  private readonly minIntervalMs: number;
  private readonly maxCooldownMs: number;
  private readonly now: () => number;
  private readonly wait: (ms: number) => Promise<void>;
  private draining = false;
  private nextEligibleAt = 0;
  private consecutive429Count = 0;
  private adaptiveIntervalMs: number;
  private successfulRequestsSinceRateLimit = 0;

  constructor(options: NaverSearchQueueOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    this.maxCooldownMs = options.maxCooldownMs ?? DEFAULT_MAX_COOLDOWN_MS;
    this.now = options.now ?? Date.now;
    this.wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.adaptiveIntervalMs = this.minIntervalMs;
  }

  schedule<T>(
    endpoint: "blog" | "webkr",
    run: () => Promise<T>,
    logger?: Logger,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        endpoint,
        enqueuedAt: this.now(),
        logger,
        run,
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.drain();
    });
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    void this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift();
        if (!task) continue;
        const waitMs = Math.max(0, this.nextEligibleAt - this.now());
        if (waitMs > 0) await this.wait(waitMs);

        const startedAt = this.now();
        task.logger?.info("evaluateSeeds.naver_search_queue.dispatch", {
          endpoint: task.endpoint,
          queueWaitMs: Math.max(0, startedAt - task.enqueuedAt),
          inFlight: 1,
          queuedCount: this.queue.length,
          cooldownMs: waitMs,
          requestIntervalMs: this.adaptiveIntervalMs,
        });

        try {
          const result = await task.run();
          this.consecutive429Count = 0;
          this.successfulRequestsSinceRateLimit += 1;
          if (
            this.adaptiveIntervalMs > this.minIntervalMs &&
            this.successfulRequestsSinceRateLimit >= SUCCESSFUL_REQUESTS_TO_RELAX_INTERVAL
          ) {
            this.adaptiveIntervalMs = Math.max(
              this.minIntervalMs,
              Math.floor(this.adaptiveIntervalMs / 2),
            );
            this.successfulRequestsSinceRateLimit = 0;
          }
          this.nextEligibleAt = this.now() + this.adaptiveIntervalMs;
          task.resolve(result);
        } catch (error) {
          if (getHttpStatus(error) === 429) {
            this.consecutive429Count += 1;
            this.successfulRequestsSinceRateLimit = 0;
            this.adaptiveIntervalMs = Math.min(
              MAX_ADAPTIVE_INTERVAL_MS,
              Math.max(this.minIntervalMs, this.adaptiveIntervalMs || this.minIntervalMs) * 2,
            );
            const cooldownMs = getCooldownMs(error, this.consecutive429Count, this.maxCooldownMs, this.now);
            this.nextEligibleAt = Math.max(this.nextEligibleAt, this.now() + cooldownMs);
            task.logger?.warn("evaluateSeeds.naver_search_queue.rate_limited", {
              endpoint: task.endpoint,
              statusCode: 429,
              consecutive429Count: this.consecutive429Count,
              cooldownMs,
              requestIntervalMs: this.adaptiveIntervalMs,
              queuedCount: this.queue.length,
            });
          } else {
            this.nextEligibleAt = this.now() + this.minIntervalMs;
          }
          task.reject(error);
        }
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0) this.drain();
    }
  }
}

export const naverSearchQueue = new NaverSearchQueue();

const getHttpStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const response = "response" in error ? error.response : undefined;
  if (!response || typeof response !== "object" || !("status" in response)) return undefined;
  return typeof response.status === "number" ? response.status : undefined;
};

const getCooldownMs = (
  error: unknown,
  consecutive429Count: number,
  maxCooldownMs: number,
  now: () => number,
): number => {
  const retryAfter = getRetryAfterMs(error, now());
  if (retryAfter !== undefined) return Math.min(maxCooldownMs, retryAfter);
  return Math.min(maxCooldownMs, 1_000 * 2 ** Math.min(consecutive429Count - 1, 4));
};

const getRetryAfterMs = (error: unknown, now: number): number | undefined => {
  if (!error || typeof error !== "object" || !("response" in error)) return undefined;
  const response = error.response;
  if (!response || typeof response !== "object" || !("headers" in response)) return undefined;
  const headers = response.headers;
  if (!hasHeaderGetter(headers)) return undefined;
  const raw = headers.get("retry-after");
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
};

const hasHeaderGetter = (value: unknown): value is { get(name: string): string | null } =>
  value !== null &&
  typeof value === "object" &&
  "get" in value &&
  typeof value.get === "function";
