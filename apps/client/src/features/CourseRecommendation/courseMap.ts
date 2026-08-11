import type { CourseOption, CourseRoutePoint } from "./course.types";

/**
 * Prefer engine-provided geometry so the map can render road-aware paths.
 * Older persisted options may not have enough points, so retain a stop-based fallback.
 */
export const getCourseRoutePath = (option: CourseOption): readonly CourseRoutePoint[] =>
  option.routePath.length >= 2
    ? option.routePath
    : option.stops.map(({ lat, lng }) => ({ lat, lng }));
