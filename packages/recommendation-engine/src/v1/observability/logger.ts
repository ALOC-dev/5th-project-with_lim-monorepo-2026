// Recommendation engine 전용 로깅 인프라.
//
// 설계 원칙:
// - 구조화 이벤트(LogEvent)만 emit하고, 표시 방식은 sink에 위임한다.
// - 각 단계(engine / discoverSeeds / evaluateSeeds)는 자신의 phase 이벤트만 책임진다.
// - 기본은 noop (라이브러리적 침묵). 엔진의 loggingActivated 옵션이 켜진 경우에만 출력된다.
// - withContext로 attemptNo/retryNo 같은 누적 맥락을 자동 첨부할 수 있다.
// - startTimer로 phase의 소요 시간(durationMs)을 측정해 success 이벤트와 함께 기록한다.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEvent = {
  ts: string;
  level: LogLevel;
  phase: string;
  attemptNo?: number;
  retryNo?: number;
  durationMs?: number;
  context?: Record<string, string>;
  data?: Record<string, unknown>;
  error?: { name: string; message: string };
};

export type LogSink = (event: LogEvent) => void;

type LoggerContext = {
  attemptNo?: number;
  retryNo?: number;
  // fan-out 식별자 (client name, candidateId 등). 임의 key 허용.
  extra?: Record<string, string>;
};

export type Logger = {
  debug(phase: string, data?: Record<string, unknown>): void;
  info(phase: string, data?: Record<string, unknown>): void;
  warn(phase: string, data?: Record<string, unknown>): void;
  error(phase: string, error: unknown, data?: Record<string, unknown>): void;
  // 누적 맥락을 가진 자식 로거를 만든다.
  // 예: engineLogger.withContext({ attemptNo: 1 }).withContext({ retryNo: 0 })
  withContext(extra: LoggerContext): Logger;
  // 호출 시점에 타이머를 시작하고, 반환 함수를 호출할 때 phase의 success 이벤트를 durationMs와 함께 emit한다.
  startTimer(phase: string): (data?: Record<string, unknown>) => void;
};

const toErrorPayload = (
  error: unknown,
): { name: string; message: string } => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "UnknownError", message: String(error) };
};

const buildLogger = (sink: LogSink, ctx: LoggerContext = {}): Logger => {
  const emit = (
    level: LogLevel,
    phase: string,
    data?: Record<string, unknown>,
    error?: unknown,
    durationMs?: number,
  ): void => {
    const event: LogEvent = {
      ts: new Date().toISOString(),
      level,
      phase,
      ...(ctx.attemptNo !== undefined ? { attemptNo: ctx.attemptNo } : {}),
      ...(ctx.retryNo !== undefined ? { retryNo: ctx.retryNo } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(ctx.extra && Object.keys(ctx.extra).length > 0
        ? { context: ctx.extra }
        : {}),
      ...(data ? { data } : {}),
      ...(error ? { error: toErrorPayload(error) } : {}),
    };
    try {
      sink(event);
    } catch {
      // Observability must never change recommendation behavior.
    }
  };

  return {
    debug: (phase, data) => emit("debug", phase, data),
    info: (phase, data) => emit("info", phase, data),
    warn: (phase, data) => emit("warn", phase, data),
    error: (phase, error, data) => emit("error", phase, data, error),
    withContext: (delta) =>
      buildLogger(sink, {
        ...ctx,
        ...(delta.attemptNo !== undefined ? { attemptNo: delta.attemptNo } : {}),
        ...(delta.retryNo !== undefined ? { retryNo: delta.retryNo } : {}),
        ...(delta.extra
          ? { extra: { ...(ctx.extra ?? {}), ...delta.extra } }
          : {}),
      }),
    startTimer: (phase) => {
      const start = performance.now();
      return (data) =>
        emit(
          "info",
          phase,
          data,
          undefined,
          Math.round(performance.now() - start),
        );
    },
  };
};

// 아무것도 출력하지 않는다. 라이브러리 기본값.
export const noopSink: LogSink = () => {};

// JSON 한 줄씩 stdout/stderr로 출력한다. 개발/스모크 테스트용.
export const consoleSink: LogSink = (event) => {
  const line = JSON.stringify(event);
  if (event.level === "error") console.error(line);
  else if (event.level === "warn") console.warn(line);
  else console.log(line);
};

export const createLogger = (sink: LogSink = noopSink): Logger =>
  buildLogger(sink);

// 자주 쓰는 두 가지 프리셋.
export const noopLogger: Logger = createLogger(noopSink);
export const consoleLogger: Logger = createLogger(consoleSink);
