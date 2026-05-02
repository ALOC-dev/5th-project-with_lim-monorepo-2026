import type { PlaceRecommendationItem, UserInput } from "../contracts/index.js";

export const getNearestDistanceKm = (
  locations: UserInput["location"],
  candidateLocation: PlaceRecommendationItem["location"],
): number | null => {
  if (locations.length === 0) return null;

  return locations.reduce<number | null>((nearestDistance, location) => {
    const distance = haversineKm(location, candidateLocation);
    return nearestDistance === null
      ? distance
      : Math.min(nearestDistance, distance);
  }, null);
};

const haversineKm = (
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number => {
  const earthRadiusKm = 6371;
  const latDistance = toRadians(to.lat - from.lat);
  const lngDistance = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);

  const a =
    Math.sin(latDistance / 2) ** 2 +
    Math.sin(lngDistance / 2) ** 2 * Math.cos(fromLat) * Math.cos(toLat);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
};

const toRadians = (degree: number): number => (degree * Math.PI) / 180;
