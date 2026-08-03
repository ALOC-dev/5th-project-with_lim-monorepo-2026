export type CourseEngineConfig = {
  targetCourseCount: number;
  beamWidth: number;
  maxStopsPerCourse: number;
  fallbackAverageTravelMetersPerMinute: number;
  mealBonus: number;
  missingMealPenalty: number;
  travelPenaltyPerMinute: number;
};

export const DEFAULT_COURSE_ENGINE_CONFIG: CourseEngineConfig = {
  targetCourseCount: 3,
  beamWidth: 8,
  maxStopsPerCourse: 6,
  fallbackAverageTravelMetersPerMinute: 80,
  mealBonus: 25,
  missingMealPenalty: 20,
  travelPenaltyPerMinute: 0.35,
};
