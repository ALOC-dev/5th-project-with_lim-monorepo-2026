import { DEFAULT_WEIGHTS, type EngineConfig } from "@monorepo/recommendation-engine";
import type { UserInput } from "@monorepo/recommendation-engine/v1/contracts";

export const testConfig: EngineConfig = {
  targetCount: 10,
  candidatePoolMultiplier: 10,
  weights: DEFAULT_WEIGHTS,
};

export const testParameterSource = {
  logFile:
    "/Users/limeojin363/Desktop/dev/aloc/aloc_monorepo/apps/server/src/scripts/recommendation-engine/.log/20260517-052840-935-63119.evaluate.log.json",
  resultFile:
    "/Users/limeojin363/Desktop/dev/aloc/aloc_monorepo/apps/server/src/scripts/recommendation-engine/.log/20260517-052840-935-63119.evaluate.result.json",
  note: "Input is copied from the successful live evaluate run. Config keeps the current engine-level targetCount=10 and candidatePoolMultiplier=10 test intent.",
} as const;

export const testScenarios = {
  hoegi_gopchang: {
    schedule: {
      dateISO: "2026-05-19",
      time24h: "18:00",
      stayDurationMinutes: 120,
    },
    location: [
      {
        lat: 37.5897,
        lng: 127.0579,
      },
    ],
    numberOfPeople: 3,
    partyType: "FRIENDS",
    budgetPerPerson: [10000, 35000],
    userNaturalLanguageRequest: "회기 곱창",
  },
  hongdae_gopchang: {
    schedule: {
      dateISO: "2026-05-16",
      time24h: "18:00",
      stayDurationMinutes: 120,
    },
    location: [
      {
        lat: 37.5563,
        lng: 126.9236,
      },
    ],
    numberOfPeople: 3,
    partyType: "FRIENDS",
    budgetPerPerson: [10000, 35000],
    userNaturalLanguageRequest: "홍대 곱창",
  },
  gangnam_cafe: {
    schedule: {
      dateISO: "2026-05-17",
      time24h: "14:00",
      stayDurationMinutes: 90,
    },
    location: [
      {
        lat: 37.4979,
        lng: 127.0276,
      },
    ],
    numberOfPeople: 2,
    partyType: "FRIENDS",
    budgetPerPerson: [5000, 20000],
    userNaturalLanguageRequest: "강남역 조용한 카페",
  },
  seongsu_pasta: {
    schedule: {
      dateISO: "2026-05-16",
      time24h: "19:00",
      stayDurationMinutes: 120,
    },
    location: [
      {
        lat: 37.5446,
        lng: 127.0557,
      },
    ],
    numberOfPeople: 2,
    partyType: "LOVERS",
    budgetPerPerson: [20000, 50000],
    userNaturalLanguageRequest: "성수 데이트 파스타",
  },
  yeonnam_brunch: {
    schedule: {
      dateISO: "2026-05-23",
      time24h: "11:30",
      stayDurationMinutes: 90,
    },
    location: [
      {
        lat: 37.5628,
        lng: 126.9242,
      },
    ],
    numberOfPeople: 2,
    partyType: "LOVERS",
    budgetPerPerson: [15000, 35000],
    userNaturalLanguageRequest: "연남동 브런치",
  },
  itaewon_vegan: {
    schedule: {
      dateISO: "2026-05-23",
      time24h: "18:30",
      stayDurationMinutes: 120,
    },
    location: [
      {
        lat: 37.5345,
        lng: 126.9946,
      },
    ],
    numberOfPeople: 4,
    partyType: "FRIENDS",
    budgetPerPerson: [15000, 40000],
    userNaturalLanguageRequest: "이태원 비건 식당",
  },
  yeouido_family_korean: {
    schedule: {
      dateISO: "2026-05-24",
      time24h: "12:30",
      stayDurationMinutes: 120,
    },
    location: [
      {
        lat: 37.5219,
        lng: 126.9246,
      },
    ],
    numberOfPeople: 5,
    partyType: "FAMILY",
    budgetPerPerson: [15000, 45000],
    userNaturalLanguageRequest: "여의도 가족 모임 한식",
  },
  euljiro_pub: {
    schedule: {
      dateISO: "2026-05-22",
      time24h: "20:00",
      stayDurationMinutes: 150,
    },
    location: [
      {
        lat: 37.5662,
        lng: 126.9919,
      },
    ],
    numberOfPeople: 3,
    partyType: "COLLEAGUES",
    budgetPerPerson: [20000, 50000],
    userNaturalLanguageRequest: "을지로 맥주 펍",
  },
  pangyo_team_lunch: {
    schedule: {
      dateISO: "2026-05-21",
      time24h: "12:00",
      stayDurationMinutes: 75,
    },
    location: [
      {
        lat: 37.3947,
        lng: 127.1112,
      },
    ],
    numberOfPeople: 6,
    partyType: "COLLEAGUES",
    budgetPerPerson: [10000, 25000],
    userNaturalLanguageRequest: "판교 직장인 점심",
  },
  hoegi_test: {
    schedule: {
      dateISO: "2026-05-19",
      time24h: "18:00",
      stayDurationMinutes: 120,
    },
    location: [
      {
        lat: 37.5897,
        lng: 127.0579,
      },
    ],
    numberOfPeople: 3,
    partyType: "FRIENDS",
    budgetPerPerson: [10000, 35000],
    userNaturalLanguageRequest: "회기역 이자카야",
  },
  /**
   * 여러 명이 흩어져 있을 때 중간 지점으로 모이는지 보는 시나리오.
   *
   * 다른 시나리오는 전부 출발지가 하나뿐이라, 중간 지점 계산이 실제 파이프라인에서
   * 어떻게 동작하는지 한 번도 검증되지 않았다. 혜화·성수·왕십리 세 곳의 무게중심은
   * 대략 왕십리 근처가 되어야 하고, 세 사람 중 누구의 동네도 아니어야 정상이다.
   */
  group_midpoint: {
    schedule: {
      dateISO: "2026-05-16",
      time24h: "18:30",
      stayDurationMinutes: 120,
    },
    location: [
      // 혜화역
      { lat: 37.5822, lng: 127.0019 },
      // 성수역
      { lat: 37.5446, lng: 127.0559 },
      // 왕십리역
      { lat: 37.5613, lng: 127.0379 },
    ],
    numberOfPeople: 3,
    partyType: "FRIENDS",
    budgetPerPerson: [15000, 40000],
    userNaturalLanguageRequest: "다 같이 모여서 저녁 먹을 곳",
  },
  /**
   * 예산이 높고 업종어가 없는 요청.
   *
   * "파인다이닝"은 음식 종류가 아니라 격식·가격대라, 업종 계열 규칙으로는 걸러지지
   * 않는다. 예산 상한도 다른 시나리오의 5배라 예산 판정이 실제로 작동하는지 본다.
   * 체류 시간도 길게 잡아 브레이크타임·마감 판정에 걸리는지 함께 확인한다.
   */
  apgujeong_fine_dining: {
    schedule: {
      dateISO: "2026-05-22",
      time24h: "19:00",
      stayDurationMinutes: 150,
    },
    location: [
      // 압구정역
      { lat: 37.5273, lng: 127.0286 },
    ],
    numberOfPeople: 2,
    partyType: "LOVERS",
    budgetPerPerson: [80000, 200000],
    userNaturalLanguageRequest: "압구정 파인다이닝",
  },
  /**
   * 자연어 입력에 아무 말이나 써 갈긴 경우. 파이프라인을 태우기 전에 끊겨야 한다.
   */
  gibberish_request: {
    schedule: {
      dateISO: "2026-05-16",
      time24h: "19:00",
      stayDurationMinutes: 120,
    },
    location: [
      {
        lat: 37.5556,
        lng: 126.9226,
      },
    ],
    numberOfPeople: 2,
    partyType: "FRIENDS",
    budgetPerPerson: [10000, 30000],
    userNaturalLanguageRequest: "ㅁㄴㅇㄹㅁㄴㅇㄹ asdf 1234 ㅋㅋㅋㅋㅋ",
  },
} satisfies Record<string, UserInput>;

export type TestScenarioName = keyof typeof testScenarios;

export const defaultTestScenarioName: TestScenarioName = "hoegi_gopchang";

export const parseTestScenarioName = (name: string): TestScenarioName => {
  if (!isTestScenarioName(name)) {
    throw new Error(
      `Unknown test scenario: ${name}. Available scenarios: ${Object.keys(testScenarios).join(", ")}`,
    );
  }
  return name;
};

export const getTestScenarioInput = (name: TestScenarioName): UserInput => testScenarios[name];

const isTestScenarioName = (name: string): name is TestScenarioName =>
  Object.prototype.hasOwnProperty.call(testScenarios, name);
