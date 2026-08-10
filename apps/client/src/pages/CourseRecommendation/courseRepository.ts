import type {
  CourseDraft,
  CourseFavorite,
  CourseHistoryItem,
  CourseOption,
  CoursePlace,
  CourseRecommendation,
  CourseRecommendationRepository,
} from "./course.types";

const COMPLETION_DELAY_MS = 600;
const MAX_PICKER_PLACES = 16;

const pickerPlaces: readonly CoursePlace[] = Array.from(
  { length: MAX_PICKER_PLACES },
  (_, index) => {
    const placeNumber = index + 1;
    const names = [
      "도시정원 다이닝",
      "서울시립미술관",
      "라운드 커피",
      "한강뷰 비스트로",
      "북촌 한옥길",
      "카페 달빛",
      "청계천 산책로",
      "성수 수제맥주",
      "연남 책방",
      "이태원 루프탑",
      "망원 시장",
      "을지로 사진관",
      "서촌 공방",
      "국립현대미술관",
      "잠실 야경길",
      "용산 레코드샵",
    ] as const;

    return {
      address: `서울시 예시구 추천로 ${placeNumber}`,
      category: placeNumber % 2 === 0 ? "문화 · 전시" : "식당 · 데이트",
      id: `course-place-${placeNumber}`,
      lat: 37.555 + placeNumber * 0.003,
      lng: 126.97 + placeNumber * 0.002,
      name: names[index] ?? `추천 장소 ${placeNumber}`,
      source: placeNumber <= 6 ? "FAVORITE" : "SEARCH",
    };
  },
);

const createStop = (
  placeId: string,
  visitTime: string,
  stayMinutes: number,
  activityLabel: string,
) => {
  const place = pickerPlaces.find((candidate) => candidate.id === placeId);
  if (!place) {
    throw new Error(`Unknown course place: ${placeId}`);
  }

  return { ...place, activityLabel, stayMinutes, visitTime };
};

const defaultDraft: CourseDraft = {
  date: "2026-07-18",
  durationHours: 3,
  placeIds: [
    "course-place-1",
    "course-place-2",
    "course-place-3",
    "course-place-4",
    "course-place-5",
  ],
  startTime: "18:30",
};

const createOptions = (): readonly CourseOption[] => [
  {
    id: "course-option-minimum-travel",
    isFavorite: false,
    pricePerPersonWon: 41000,
    reason: "선택한 장소를 가까운 동선으로 연결해 이동 시간을 가장 짧게 만들었어요.",
    stops: [
      createStop("course-place-1", "18:30", 80, "식사"),
      createStop("course-place-2", "19:58", 45, "관람"),
      createStop("course-place-3", "20:55", 35, "대화"),
    ],
    title: "이동 최소 코스",
    totalDurationMinutes: 170,
    totalTravelMinutes: 19,
    type: "이동 최소",
  },
  {
    id: "course-option-leisure",
    isFavorite: false,
    pricePerPersonWon: 43000,
    reason: "머무는 시간과 산책 구간을 넉넉하게 잡아 대화에 집중할 수 있어요.",
    stops: [
      createStop("course-place-4", "18:30", 70, "식사"),
      createStop("course-place-2", "19:48", 50, "관람"),
      createStop("course-place-3", "20:52", 40, "대화"),
      createStop("course-place-7", "21:40", 25, "산책"),
    ],
    title: "느긋한 흐름 코스",
    totalDurationMinutes: 180,
    totalTravelMinutes: 24,
    type: "느긋한 흐름",
  },
  {
    id: "course-option-variety",
    isFavorite: false,
    pricePerPersonWon: 39000,
    reason: "식사·전시·카페·산책을 고르게 섞어 다양한 분위기를 경험할 수 있어요.",
    stops: [
      createStop("course-place-1", "18:30", 65, "식사"),
      createStop("course-place-5", "19:42", 35, "산책"),
      createStop("course-place-6", "20:25", 45, "대화"),
      createStop("course-place-7", "21:18", 30, "산책"),
    ],
    title: "장소 다양성 코스",
    totalDurationMinutes: 190,
    totalTravelMinutes: 28,
    type: "장소 다양성",
  },
  {
    id: "course-option-meal",
    isFavorite: false,
    pricePerPersonWon: 45000,
    reason: "식사 경험을 중심에 두고 카페와 야경 산책을 자연스럽게 연결했어요.",
    stops: [
      createStop("course-place-1", "18:30", 95, "식사"),
      createStop("course-place-3", "20:17", 45, "대화"),
      createStop("course-place-7", "21:10", 30, "산책"),
    ],
    title: "식사 우선 코스",
    totalDurationMinutes: 165,
    totalTravelMinutes: 22,
    type: "식사 우선",
  },
];

type RepositoryState = {
  recommendations: CourseRecommendation[];
  histories: CourseHistoryItem[];
  favorites: CourseFavorite[];
};

const cloneOptions = (): CourseOption[] => createOptions().map((option) => ({ ...option }));

const createInitialState = (): RepositoryState => {
  const demoRecommendation: CourseRecommendation = {
    completedAt: "2026-07-17T12:30:00.000Z",
    draft: defaultDraft,
    historyId: "course-history-success",
    id: "course-recommendation-demo",
    options: cloneOptions().map((option) =>
      option.id === "course-option-leisure" ? { ...option, isFavorite: true } : option,
    ),
    status: "SUCCESS",
  };
  const emptyRecommendation: CourseRecommendation = {
    draft: { ...defaultDraft, placeIds: ["course-place-15"] },
    historyId: "course-history-empty",
    id: "course-recommendation-empty",
    options: [],
    status: "EMPTY",
  };
  const failedRecommendation: CourseRecommendation = {
    draft: defaultDraft,
    errorMessage: "일시적인 오류로 코스 추천을 만들지 못했어요.",
    historyId: "course-history-failed",
    id: "course-recommendation-failed",
    options: [],
    status: "FAILED",
  };

  return {
    favorites: [
      {
        optionId: "course-option-leisure",
        recommendationId: demoRecommendation.id,
        savedAt: "2026-07-17T12:30:00.000Z",
      },
    ],
    histories: [
      {
        id: "course-history-success",
        optionCount: 4,
        recommendationId: demoRecommendation.id,
        requestedAt: "2026-07-17T12:30:00.000Z",
        status: "SUCCESS",
        title: "성수 데이트 반나절 코스",
      },
      {
        id: "course-history-empty",
        optionCount: 0,
        recommendationId: emptyRecommendation.id,
        requestedAt: "2026-07-16T09:00:00.000Z",
        status: "EMPTY",
        title: "장소가 적은 코스",
      },
      {
        id: "course-history-failed",
        recommendationId: failedRecommendation.id,
        requestedAt: "2026-07-15T18:00:00.000Z",
        status: "FAILED",
        title: "추천을 만들지 못한 코스",
      },
      {
        id: "course-history-pending",
        requestedAt: "2026-07-15T13:00:00.000Z",
        status: "PENDING",
        title: "추천을 만드는 중인 코스",
      },
    ],
    recommendations: [demoRecommendation, emptyRecommendation, failedRecommendation],
  };
};

let state = createInitialState();

const wait = () => new Promise<void>((resolve) => window.setTimeout(resolve, COMPLETION_DELAY_MS));

const updateRecommendationOption = (
  recommendationId: string,
  optionId: string,
  isFavorite: boolean,
) => {
  state = {
    ...state,
    recommendations: state.recommendations.map((recommendation) =>
      recommendation.id !== recommendationId
        ? recommendation
        : {
            ...recommendation,
            options: recommendation.options.map((option) =>
              option.id === optionId ? { ...option, isFavorite } : option,
            ),
          },
    ),
  };
};

export const courseRepository: CourseRecommendationRepository = {
  listPickerPlaces: (query, source) => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
    return pickerPlaces.filter((place) => {
      if (source === "FAVORITE" && place.source !== "FAVORITE") {
        return false;
      }

      return (
        normalizedQuery.length === 0 ||
        `${place.name} ${place.address} ${place.category}`
          .toLocaleLowerCase("ko-KR")
          .includes(normalizedQuery)
      );
    });
  },
  startRecommendation: (draft) => {
    const id = `course-recommendation-${Date.now()}`;
    const historyId = `course-history-${Date.now()}`;
    const recommendation: CourseRecommendation = {
      draft,
      historyId,
      id,
      options: [],
      status: "PENDING",
    };
    state = {
      ...state,
      histories: [
        {
          id: historyId,
          recommendationId: id,
          requestedAt: new Date().toISOString(),
          status: "PENDING",
          title: "새 코스 추천",
        },
        ...state.histories,
      ],
      recommendations: [recommendation, ...state.recommendations],
    };
    return recommendation;
  },
  completeRecommendation: async (id) => {
    await wait();
    const current = state.recommendations.find((recommendation) => recommendation.id === id);
    if (!current) {
      throw new Error("코스 추천을 찾을 수 없습니다.");
    }
    if (current.status !== "PENDING") {
      return current;
    }

    const completed: CourseRecommendation = {
      ...current,
      completedAt: new Date().toISOString(),
      options: cloneOptions(),
      status: "SUCCESS",
    };
    state = {
      ...state,
      histories: state.histories.map((history) =>
        history.id === current.historyId
          ? { ...history, optionCount: completed.options.length, status: "SUCCESS" }
          : history,
      ),
      recommendations: state.recommendations.map((recommendation) =>
        recommendation.id === id ? completed : recommendation,
      ),
    };
    return completed;
  },
  getOption: (recommendationId, optionId) =>
    state.recommendations
      .find((recommendation) => recommendation.id === recommendationId)
      ?.options.find((option) => option.id === optionId) ?? null,
  getRecommendation: (id) =>
    state.recommendations.find((recommendation) => recommendation.id === id) ?? null,
  listFavorites: () => state.favorites,
  listHistory: () => state.histories,
  renameHistory: (id, title) => {
    const normalizedTitle = title.trim();
    if (normalizedTitle.length === 0 || normalizedTitle.length > 60) {
      return false;
    }
    const exists = state.histories.some((history) => history.id === id);
    if (!exists) {
      return false;
    }
    state = {
      ...state,
      histories: state.histories.map((history) =>
        history.id === id ? { ...history, title: normalizedTitle } : history,
      ),
    };
    return true;
  },
  deleteHistory: (id) => {
    const history = state.histories.find((item) => item.id === id);
    if (!history) {
      return false;
    }
    state = {
      ...state,
      histories: state.histories.filter((item) => item.id !== id),
    };
    return true;
  },
  cancelPendingHistory: (id) => {
    const history = state.histories.find((item) => item.id === id);
    if (!history || history.status !== "PENDING") {
      return false;
    }
    state = {
      ...state,
      histories: state.histories.map((item) =>
        item.id === id ? { ...item, status: "CANCELLED" } : item,
      ),
      recommendations: state.recommendations.map((recommendation) =>
        recommendation.historyId === id
          ? { ...recommendation, status: "CANCELLED" }
          : recommendation,
      ),
    };
    return true;
  },
  toggleFavorite: (recommendationId, optionId) => {
    const favorite = state.favorites.find(
      (item) => item.recommendationId === recommendationId && item.optionId === optionId,
    );
    if (favorite) {
      state = {
        ...state,
        favorites: state.favorites.filter((item) => item !== favorite),
      };
      updateRecommendationOption(recommendationId, optionId, false);
      return false;
    }
    state = {
      ...state,
      favorites: [
        ...state.favorites,
        { optionId, recommendationId, savedAt: new Date().toISOString() },
      ],
    };
    updateRecommendationOption(recommendationId, optionId, true);
    return true;
  },
};

export const getCoursePlace = (id: string) => pickerPlaces.find((place) => place.id === id) ?? null;
