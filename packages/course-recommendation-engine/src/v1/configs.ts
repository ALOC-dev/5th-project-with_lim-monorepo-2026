export type CourseEngineConfig = {
  targetCourseCount: number;
  beamWidth: number;
  maxStopsPerCourse: number;
  fallbackWalkingMetersPerMinute: number;
  maxWalkableMeters: number;
  travelRequestConcurrency: number;
  travelCalibrationSampleSize: number;
  mealBonus: number;
  missingMealPenalty: number;
  travelPenaltyPerMinute: number;
  waitPenaltyPerMinute: number;
  durationFitBonus: number;
  maxFlowBonus: number;
  categoryDiversityBonus: number;
  costFitBonus: number;
  unknownHoursPenalty: number;
  diversityPenalty: number;
  largeGroupThreshold: number;
  largeGroupExtraStayMinutes: number;
  placeScoreWeight: number;
  candidatePoolSize: number;
  maxFrontierStates: number;
  maxWaitMinutes: number;
};

export const DEFAULT_COURSE_ENGINE_CONFIG: CourseEngineConfig = {
  targetCourseCount: 3,
  beamWidth: 8,
  maxStopsPerCourse: 6,
  // 도보 경로를 계측하지 못한 쌍의 추정 속도. 직선거리에 적용하는 값이다.
  //
  // TMAP 실측 기준 보행 속도는 약 80m/분인데, 실제 보행 경로는 직선거리보다
  // 1.25~1.37배 길다(홍대/연남/합정 3구간 실측). 그래서 직선거리에 80을 그대로
  // 쓰면 20~30% 과소추정된다. 우회 계수 1.3을 반영해 80 / 1.3 = 61을 쓴다.
  fallbackWalkingMetersPerMinute: 61,
  // 직선거리가 이 값을 넘으면 도보권이 아니라고 보고 경로 API를 호출하지 않는다.
  maxWalkableMeters: 2_000,
  // 도보 경로 API 동시 호출 수.
  travelRequestConcurrency: 5,
  // 보정계수를 뽑기 위해 실측할 표본 쌍 수.
  travelCalibrationSampleSize: 5,
  mealBonus: 25,
  missingMealPenalty: 20,
  travelPenaltyPerMinute: 0.35,
  // 대기는 이동보다 덜 나쁘지만 죽은 시간이므로 함께 감점한다.
  waitPenaltyPerMinute: 0.15,
  // 요청한 totalDurationMinutes를 얼마나 채웠는지에 비례해 주는 가산점.
  // 이게 없으면 totalDurationMinutes가 상한으로만 쓰여서, 10시간을 요청해도
  // 평균 점수가 높은 3시간짜리 코스가 1등이 된다.
  durationFitBonus: 12,
  // 흐름 보너스는 전이마다 붙어서 스톱 수가 늘면 무제한으로 누적된다. 상한을 둔다.
  maxFlowBonus: 10,
  // 서로 다른 카테고리로 구성된 코스에 주는 가산점. 카페만 세 곳 도는 코스와
  // 식당+전시+카페 코스가 동점이 되지 않게 한다.
  categoryDiversityBonus: 8,
  // 예산 범위(budgetPerPersonWon)를 받은 경우에만 적용하는 예산 적합도 가산점.
  costFitBonus: 10,
  // 영업시간을 모르는 장소 1곳당 감점. 모르는 곳을 밤늦게 배치하는 걸 억제한다.
  unknownHoursPenalty: 5,
  // 후보를 고를 때 이미 뽑힌 후보와 겹치는 만큼 빼는 점수(자카드 1.0 기준).
  // 이게 없으면 상위 후보가 전부 같은 고득점 장소들의 변형이 된다.
  diversityPenalty: 30,
  // 이 인원 이상이면 식사/술자리 체류를 늘린다. 주문과 착석에 시간이 더 걸린다.
  largeGroupThreshold: 5,
  largeGroupExtraStayMinutes: 15,
  // 장소 평균 점수를 그대로 쓰면 보너스를 더하는 순간 100에 붙어버려
  // 상위 코스가 전부 동점이 되고 랭킹이 무력화된다.
  // 이 값 + mealBonus + durationFitBonus + maxFlowBonus <= 100 이어야
  // 아무리 좋은 코스도 clamp에 걸리지 않는다. (50 + 25 + 12 + 10 = 97)
  placeScoreWeight: 0.5,
  // LLM 큐레이션에 넘길 후보 수.
  candidatePoolSize: 30,
  // 한 단계에서 다음 단계로 넘길 상태 수의 절대 상한.
  // `mask:last`별 빔만으로는 상태 수가 장소 수에 지수적으로 늘어난다.
  maxFrontierStates: 2_000,
  // 영업 시작이나 식사 시간대를 기다릴 수 있는 최대 시간.
  maxWaitMinutes: 45,
};
