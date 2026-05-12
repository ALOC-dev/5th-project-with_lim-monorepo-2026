/**
 * 엔진 동작 확인용 테스트 스크립트 (실제 카카오 API 연동)
 *
 * 실행:
 *   pnpm --filter @monorepo/server exec tsx .env src/engine-test.ts
 */

import { RecommendationEngine, type EngineInput } from "@monorepo/common";
import { collectCandidates } from "./collect-candidates.js";
import "dotenv/config";


const engineInput: EngineInput = {
  userInput: {
    schedule: {
      dateISO: "2026-05-07",
      time24h: "13:00",
      stayDurationMinutes: 120,
    },
    location: [{ lat: 37.5833, lng: 127.0583 }], // 서울시립대 기준
    numberOfPeople: 4,
    partyType: "FRIENDS",
    budgetPerPerson: [20000, 40000],
    userNaturalLanguageRequest: "동기들과 맛있게 먹을 수 있는 술집",
  },
};

const engine = new RecommendationEngine(engineInput, {
  collectCandidates, // 실제 카카오 API 연동
  targetCount: 5,
  maxDistanceKm: 2,
});

const result = await engine.process();

if (!result.ok) {
  console.error("실패:", result.step, result.errorCode);
  console.error(result.message);
} else {
  if (result.data.status !== "SUCCESS") process.exit(1);
  const { userOutput, meta } = result.data;
  const m = meta as Record<string, unknown>;

  console.log(`\n전체 후보: ${m["candidateCount"]}개 / 필터 제외: ${m["filteredOutCount"]}개`);
  console.log(`추천 결과: ${userOutput.recommendations.length}개\n`);

  userOutput.recommendations.forEach((rec, i) => {
    console.log(`[${i + 1}위] ${rec.name} (${rec.subCategory}) - ${rec.score}점`);
    console.log(`     가격: ${rec.priceRangePerPerson[0].toLocaleString()}~${rec.priceRangePerPerson[1].toLocaleString()}원/인`);
    console.log(`     주소: ${rec.location.roadAddressKo}`);
    console.log(`     근거: ${rec.reasons.join(" / ")}`);
    console.log();
  });
}
