import type { CourseOption, CourseRoutePoint } from "./course.types";

/**
 * Only geometry explicitly marked as a measured TMAP path may be drawn as a route.
 * Stop coordinates remain useful for fitting markers, but must not be presented as a walking path.
 */
export const getCourseRoutePath = (option: CourseOption): readonly CourseRoutePoint[] =>
  option.routePathSource === "TMAP" && option.routePath.length >= 2 ? option.routePath : [];

export const getCourseMapPoints = (option: CourseOption): readonly CourseRoutePoint[] => {
  const measuredRoute = getCourseRoutePath(option);
  return measuredRoute.length > 0
    ? measuredRoute
    : option.stops.map(({ lat, lng }) => ({ lat, lng }));
};
