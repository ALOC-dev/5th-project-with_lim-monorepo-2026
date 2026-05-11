// @ts-nocheck
import RecommendationEngine from "./engine.js";
import 'dotenv/config';

async function testDrive() {
  console.log("제주 연돈 vs 옥동식(합정) 비교 테스트 시작..");

  const mockInput = {
    userInput: {
      schedule: {
        dateISO: "2026-05-10",
        time24h: "12:00",
        stayDurationMinutes: 60
      },
      location: [{ lat: 33.2483, lng: 126.4101 }], // 기준점: 제주 연돈 본점
      numberOfPeople: 2,
      partyType: "FRIENDS",
      budgetPerPerson: [10000, 100000],
      userNaturalLanguageRequest: "돈까스나 국밥 맛집 추천"
    },
    meta: { origin: "WEB", correlationId: "test-" + Date.now() }
  };

  // 1번 후보: 연돈 (제주 색달동)
  const testCandidate1 = { 
    id: "place_yeondon_001", 
    name: "연돈", 
    tags: ["돈까스", "제주도", "치즈카츠"],
    mainCategory: "식당", subCategory: "돈가스",
    operationInfo: {
      timezone: "Asia/Seoul",
      schedules: [{
        daysOfWeek: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"],
        status: "OPEN", open: "00:00", close: "23:59", breakTimes: []
      }]
    },
    referenceUrls: { kakaoMap: "https://map.kakao.com/1", naverMap: "https://map.naver.com/1" },
    location: { lat: 33.2483, lng: 126.4101, placeName: "연돈", roadAddressKo: "제주특별자치도 서귀포시 색달동 2132-2" },
    priceRangePerPerson: [10000, 20000],
    contentSummary: "제주도 돈까스 끝판왕", score: 0, reasons: []
  };

  // 2번 후보: 옥동식 (서울 합정동)
  const testCandidate2 = { 
    id: "place_okdongsik_mapo", 
    name: "옥동식", 
    tags: ["미쉐린가이드", "돼지국밥", "마포맛집"],
    mainCategory: "식당", subCategory: "한식", // 옥동식은 국밥(한식) 위주
    operationInfo: {
      timezone: "Asia/Seoul",
      schedules: [{
        daysOfWeek: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"],
        status: "OPEN", open: "00:00", close: "23:59", breakTimes: []
      }]
    },
    referenceUrls: { kakaoMap: "https://map.kakao.com/okdong", naverMap: "https://map.naver.com/okdong" },
    location: { 
      lat: 37.5518, 
      lng: 126.9115, // 서울 마포구 합정동 좌표
      placeName: "옥동식", 
      roadAddressKo: "서울특별시 마포구 양화로7길 44-10" 
    },
    priceRangePerPerson: [10000, 15000],
    contentSummary: "맑은 국물의 돼지국밥 전문점", score: 0, reasons: []
  };

  const engine = new RecommendationEngine(mockInput as any, {
    targetCount: 2,
    candidates: [testCandidate1, testCandidate2] as any,
    now: () => new Date("2026-05-10T12:00:00Z"),
    maxDistanceKm: 500 // 제주-서울 거리를 수용하기 위해 범위를 넓힘
  } as any);

  try {
    console.log("실시간 평점 데이터를 긁어와서 랭킹을 산정합니다...");
    const result = await engine.process();

    if (result.ok) {
      console.log("\n✅ [결과]");
      result.data.userOutput.recommendations.forEach((rec, index) => {
        console.log(`\n--- [${index + 1}위] ${rec.name} ---`);
        console.log(`⭐ 점수: ${rec.score}점`);
        console.log(`📝 사유: ${rec.reasons.join(", ")}`);
        console.log(`📍 위치: ${rec.location.roadAddressKo}`);
      });
    } else {
      console.error("\n 에러:", result.message);
    }
  } catch (error) {
    console.error("\n실행 에러:", error);
  }
}

testDrive();