import { EngineOutputSchema, type EngineOutput } from "@monorepo/common";

const rawMockEngineOutput = {
  status: "SUCCESS",
  userInput: {
    schedule: {
      dateISO: "2026-05-02",
      time24h: "19:00",
      stayDurationMinutes: 150,
    },
    location: [
      {
        lat: 37.5665,
        lng: 126.978,
      },
    ],
    numberOfPeople: 3,
    partyType: "FRIENDS",
    budgetPerPerson: [20000, 40000],
    userNaturalLanguageRequest:
      "대화하기 좋은 분위기의 저녁 식사 장소를 추천해줘.",
  },
  meta: {
    source: "frontend-mock",
    generatedAt: "2026-04-30T12:00:00.000Z",
  },
  userOutput: {
    recommendations: [
      {
        id: "place-001",
        name: "도시정원 다이닝",
        tags: ["분위기", "친구모임", "예약가능", "와인", "저녁"],
        contentSummary:
          "스테이크와 파스타 중심의 저녁 코스가 강점이며, 조용한 좌석 구성이 좋아 대화에 적합합니다.",
        mainCategory: "식당",
        subCategory: "이탈리안",
        operationInfo: {
          timezone: "Asia/Seoul",
          schedules: [
            {
              daysOfWeek: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
              status: "OPEN",
              open: "11:30",
              close: "22:00",
              breakTimes: [
                {
                  start: "15:00",
                  end: "17:00",
                },
              ],
              lastOrderTime: "21:00",
            },
            {
              daysOfWeek: ["SATURDAY"],
              status: "OPEN",
              open: "12:00",
              close: "23:00",
              breakTimes: [],
              lastOrderTime: "22:00",
            },
            {
              daysOfWeek: ["SUNDAY"],
              status: "CLOSED",
            },
          ],
        },
        referenceUrls: {
          kakaoMap: "https://map.kakao.com",
          naverMap: "https://map.naver.com",
          instagram: "https://www.instagram.com",
          others: ["https://example.com/place-001"],
        },
        location: {
          lat: 37.5658,
          lng: 126.9809,
          placeName: "도시정원 다이닝",
          roadAddressKo: "서울 중구 세종대로 110",
        },
        priceRangePerPerson: [28000, 42000],
        score: 92,
        reasons: [
          "대화하기 좋은 조용한 테이블 간격",
          "예산 범위와 메뉴 구성이 잘 맞음",
          "저녁 피크 타임 이후에도 안정적으로 운영",
        ],
      },
      {
        id: "place-002",
        name: "한강뷰 비스트로",
        tags: ["뷰맛집", "데이트", "브런치", "주차가능"],
        contentSummary:
          "한강 전망 좌석과 시그니처 플래터가 인기이며, 긴 체류에도 편한 좌석 환경을 제공합니다.",
        mainCategory: "식당",
        subCategory: "컨템포러리",
        operationInfo: {
          timezone: "Asia/Seoul",
          schedules: [
            {
              daysOfWeek: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"],
              status: "OPEN",
              open: "10:00",
              close: "21:30",
              breakTimes: [],
              lastOrderTime: "20:40",
            },
            {
              daysOfWeek: ["FRIDAY", "SATURDAY"],
              status: "OPEN",
              open: "10:00",
              close: "22:30",
              breakTimes: [],
              lastOrderTime: "21:40",
            },
            {
              daysOfWeek: ["SUNDAY"],
              status: "OPEN",
              open: "10:30",
              close: "20:30",
              breakTimes: [],
              lastOrderTime: "19:40",
            },
          ],
        },
        referenceUrls: {
          kakaoMap: "https://map.kakao.com",
          naverMap: "https://map.naver.com",
          others: ["https://example.com/place-002"],
        },
        location: {
          lat: 37.5241,
          lng: 126.9273,
          placeName: "한강뷰 비스트로",
          roadAddressKo: "서울 영등포구 여의대로 24",
        },
        priceRangePerPerson: [24000, 36000],
        score: 88,
        reasons: [
          "요청한 분위기 조건과 잘 맞는 뷰/인테리어",
          "모임 인원 수용 가능한 좌석과 예약 동선",
          "평균 예상 비용이 요청 예산 범위 내",
        ],
      },
      {
        id: "place-003",
        name: "골목책방 카페",
        tags: ["카페", "디저트", "조용함"],
        contentSummary:
          "핸드드립 커피와 시즌 디저트가 주력이며, 늦은 저녁까지 차분한 분위기를 유지합니다.",
        mainCategory: "카페",
        subCategory: "스페셜티커피",
        operationInfo: {
          timezone: "Asia/Seoul",
          schedules: [
            {
              daysOfWeek: ["MONDAY"],
              status: "CLOSED",
            },
            {
              daysOfWeek: ["TUESDAY", "WEDNESDAY", "THURSDAY"],
              status: "OPEN",
              open: "12:00",
              close: "22:00",
              breakTimes: [],
              lastOrderTime: "21:30",
            },
            {
              daysOfWeek: ["FRIDAY", "SATURDAY", "SUNDAY"],
              status: "OPEN",
              open: "12:00",
              close: "23:00",
              breakTimes: [],
              lastOrderTime: "22:30",
            },
          ],
        },
        referenceUrls: {
          kakaoMap: "https://map.kakao.com",
          naverMap: "https://map.naver.com",
          instagram: "https://www.instagram.com",
        },
        location: {
          lat: 37.5595,
          lng: 126.9354,
          placeName: "골목책방 카페",
          roadAddressKo: "서울 마포구 와우산로 29",
        },
        priceRangePerPerson: [9000, 16000],
        score: 81,
        reasons: [
          "2차 장소로 이동하기 좋은 접근성",
          "체류 시간 대비 좌석 편안함이 높음",
          "낮은 소음 수준으로 대화 지속 가능",
        ],
      },
    ],
  }
}