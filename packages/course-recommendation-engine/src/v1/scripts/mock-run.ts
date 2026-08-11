import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CourseRecommendationEngine,
  type CourseRecommendationItem,
  DEFAULT_COURSE_ENGINE_CONFIG,
  type CourseCurationClient,
  type CourseEngineMeta,
} from "../index.js";
import {
  isMockScenarioName,
  type MockScenarioName,
  MOCK_SCENARIOS,
  toMockCourseInput,
} from "./fixtures.js";

/**
 * 목 데이터로 코스 엔진을 돌려 결과를 눈으로 확인하는 스크립트.
 *
 *   pnpm mock                       기본 시나리오(lunch), LLM/API 호출 없음
 *   pnpm mock -- --scenario=night   자정 넘김 술집이 잡히는지 확인
 *   pnpm mock -- --llm              OpenAI 큐레이션 + 체류시간 보정 사용
 *   pnpm mock -- --tmap             TMAP 실제 도보 시간 계측 사용
 *   pnpm mock -- --json             결과 JSON을 그대로 출력
 */

const readFlag = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const requestedScenario = readFlag("scenario") ?? "lunch";
if (!isMockScenarioName(requestedScenario)) {
  console.error(
    `알 수 없는 시나리오: ${requestedScenario}\n사용 가능: ${Object.keys(MOCK_SCENARIOS).join(", ")}`,
  );
  process.exit(1);
}

const scenario: MockScenarioName = requestedScenario;
const useLlm = process.argv.includes("--llm");
const useTmap = process.argv.includes("--tmap");
const json = process.argv.includes("--json");

/** LLM 없이 돌릴 때 쓰는 큐레이터. 결정론 상위 N개를 그대로 통과시킨다. */
const passthroughCuration: CourseCurationClient = ({ candidates, targetCourseCount }) =>
  Promise.resolve({
    picks: candidates.slice(0, targetCourseCount).map((candidate) => ({
      courseId: candidate.courseId,
      title: candidate.title.slice(0, 40),
      courseType: {
        key: "BALANCED",
        label: "균형형 코스",
        description: "mock 큐레이터가 부여한 유형입니다.",
      },
      selection: {
        reasonCodes: ["BALANCED"],
        reasonTexts: [
          `${candidate.estimatedTravelMinutes}분 이동으로 동선 부담이 낮습니다.`,
          candidate.mealPlanStatus === "SATISFIED"
            ? "식사 시간대 장소를 포함합니다."
            : "식사 시간대와 크게 겹치지 않습니다.",
        ],
        tradeoffs: [],
      },
    })),
  });

const engine = new CourseRecommendationEngine(
  toMockCourseInput(scenario),
  { ...DEFAULT_COURSE_ENGINE_CONFIG, targetCourseCount: 3 },
  {
    ...(useLlm
      ? { openAiApiKey: process.env.OPENAI_API_KEY }
      : { curateCourses: passthroughCuration }),
    ...(useTmap ? { tmapAppKey: process.env.TMAP_APP_KEY } : {}),
  },
);

const result = await engine.process();
const logDir = join(dirname(fileURLToPath(import.meta.url)), ".log");
const artifactPrefix = `${formatDatePrefix(new Date())}.mock-${scenario}${useLlm ? "-llm" : ""}`;

if (result.status === "ERROR") {
  console.error(result.error);
  process.exitCode = 1;
} else if (json) {
  console.log(JSON.stringify(result.userOutput, null, 2));
} else {
  const summary = [
    `시나리오: ${scenario}  (LLM=${useLlm}, TMAP=${useTmap})`,
    formatInput(),
    "",
    formatSummary(result.userOutput.courses),
    "",
    formatMeta(result.meta),
  ].join("\n");
  const resultFile = join(logDir, `${artifactPrefix}.result.json`);
  const summaryFile = join(logDir, `${artifactPrefix}.summary.txt`);

  await mkdir(logDir, { recursive: true });
  await Promise.all([
    writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`, "utf8"),
    writeFile(summaryFile, `${summary}\n`, "utf8"),
  ]);

  console.log(summary);
  console.log(`\nRESULT ${resultFile}`);
  console.log(`SUMMARY ${summaryFile}`);
}

function formatInput(): string {
  const input = MOCK_SCENARIOS[scenario];
  const parts = [
    `${input.dateISO} ${input.startTime24h}부터 ${input.totalDurationMinutes}분`,
    `${input.numberOfPeople}명`,
  ];
  if ("budgetPerPersonWon" in input) parts.push(`예산 ${formatWon(input.budgetPerPersonWon)}/인`);
  if ("pacePreference" in input) parts.push(`페이스 ${input.pacePreference}`);
  return parts.join(" · ");
}

function formatWon(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function formatSummary(courses: CourseRecommendationItem[]): string {
  return courses
    .map((course, index) =>
      [
        `#${index + 1} ${course.title}  (${course.score}점)`,
        `유형: ${course.courseType.label} (${course.courseType.key})`,
        `시간: ${course.startTime24h}~${course.endTime24h}, 총 ${course.summary.estimatedTotalMinutes}분 ` +
          `(체류 ${course.totalStayMinutes}분 / 이동 ${course.totalTravelMinutes}분)`,
        `비용: ${formatWon(course.summary.estimatedCostPerPerson[0])}~${formatWon(course.summary.estimatedCostPerPerson[1])} / 인`,
        `타임라인:`,
        ...course.timeline.map(
          (item) =>
            `  ${item.time24h}  ${item.placeName} (${item.stayDurationMinutes}분, ${item.categoryLabel})` +
            (item.travelMinutesFromPrevious > 0 ? ` ← 도보 ${item.travelMinutesFromPrevious}분` : "") +
            (item.waitMinutesFromPrevious > 0 ? ` + 대기 ${item.waitMinutesFromPrevious}분` : ""),
        ),
        `식사: ${course.mealPlan.status} - ${course.mealPlan.reason}`,
        `선정 이유: ${course.selection.reasonTexts.join(" / ")}`,
        `감안할 점: ${course.selection.tradeoffs.length > 0 ? course.selection.tradeoffs.join(" / ") : "없음"}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function formatMeta(meta: CourseEngineMeta): string {
  const calibration = meta.travelCalibration
    ? `우회계수 ${meta.travelCalibration.detourFactor.toFixed(2)}, ${meta.travelCalibration.metersPerMinute.toFixed(0)}m/분`
    : "없음";

  return [
    `META 후보 ${meta.candidateCount}개 -> 큐레이션 ${meta.curationPoolSize}개, ${meta.generationMillis}ms`,
    `  큐레이션 LLM: ${meta.curatedByLlm}${meta.curationFallbackReason ? ` (폴백: ${meta.curationFallbackReason})` : ""}`,
    `  도보 계측 ${meta.measuredTravelPairCount}쌍 / 추정 ${meta.estimatedTravelPairCount}쌍, 보정 ${calibration}`,
    `  체류시간 LLM 보정 ${meta.llmRefinedStayPlaceCount}곳${meta.stayEstimateFallbackReason ? ` (폴백: ${meta.stayEstimateFallbackReason})` : ""}`,
  ].join("\n");
}

function formatDatePrefix(date: Date): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, "0");
  return [
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(""),
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(""),
    pad(date.getMilliseconds(), 3),
  ].join("-");
}
