export type Coordinate = { lat: number; lng: number };

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const toDistanceMeters = (from: Coordinate, to: Coordinate): number => {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;

  return Math.round(EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

/** 도보 소요 시간 추정. 실제 경로를 모를 때만 쓴다. 최소 1분. */
export const toWalkMinutes = (meters: number, metersPerMinute: number): number =>
  Math.max(1, Math.ceil(meters / metersPerMinute));
