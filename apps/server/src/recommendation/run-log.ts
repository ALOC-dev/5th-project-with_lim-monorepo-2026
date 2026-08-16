import { promises as fs } from "node:fs";
import path from "node:path";

import {
  combineSinks,
  consoleSink,
  createJsonlFileSink,
  createLogger,
  type EngineOutput,
  type Logger,
  type UserInput,
} from "@monorepo/recommendation-engine";

/**
 * 추천 실행 1건의 로그와 결과를 파일로 남긴다.
 *
 * 라우터는 `loggingActivated: true`만 켜고 있었는데 그건 stdout 전용이라, 배포된
 * 서버에서는 터미널을 놓치면 근거가 사라졌다. 코스 추천 스크립트처럼 실행 단위로
 * 파일을 남겨 나중에 "왜 결과가 안 나왔는지"를 되짚을 수 있게 한다.
 *
 * 파일 3종:
 *   {prefix}.log.jsonl     엔진 이벤트 스트림 (한 줄에 이벤트 하나)
 *   {prefix}.input.json    요청 입력
 *   {prefix}.result.json   최종 결과 또는 에러
 */

const DEFAULT_LOG_DIR = path.resolve(process.cwd(), ".log", "recommendation");

const getLogDir = (): string => process.env.RECOMMENDATION_LOG_DIR?.trim() || DEFAULT_LOG_DIR;

export type RecommendationRunLog = {
  readonly logger: Logger;
  readonly logFile: string;
  flush(): Promise<void>;
  writeInput(userInput: UserInput): Promise<void>;
  writeResult(
    result: EngineOutput | { readonly status: "THROWN"; readonly error: unknown },
  ): Promise<void>;
};

const formatPrefix = (date: Date, jobId: string): string => {
  const pad = (value: number, length = 2): string => String(value).padStart(length, "0");
  const stamp = [
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(""),
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(""),
  ].join("-");
  return `${stamp}.${jobId.slice(0, 8)}`;
};

const writeJsonFile = async (filePath: string, value: unknown): Promise<void> => {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch {
    // 로깅 실패가 추천 요청을 실패시켜서는 안 된다.
  }
};

export const createRecommendationRunLog = (jobId: string): RecommendationRunLog => {
  const prefix = path.join(getLogDir(), formatPrefix(new Date(), jobId));
  const logFile = `${prefix}.log.jsonl`;
  const fileSink = createJsonlFileSink(logFile);

  return {
    logger: createLogger(combineSinks(consoleSink, fileSink)),
    logFile,
    flush: async () => {
      try {
        await fileSink.flush();
      } catch {
        // 로깅 실패가 추천 요청을 실패시켜서는 안 된다.
      }
    },
    writeInput: (userInput) => writeJsonFile(`${prefix}.input.json`, { jobId, userInput }),
    writeResult: (result) =>
      writeJsonFile(`${prefix}.result.json`, {
        jobId,
        finishedAt: new Date().toISOString(),
        ...(result.status === "THROWN"
          ? {
              status: "THROWN",
              error:
                result.error instanceof Error
                  ? { name: result.error.name, message: result.error.message }
                  : { name: "UnknownError", message: String(result.error) },
            }
          : result),
      }),
  };
};
