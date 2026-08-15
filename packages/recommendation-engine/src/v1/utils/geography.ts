import type { LocationItem } from "../interfaces/common.contracts.js";

/**
 * Returns the geographic centre used for shared discovery and accessibility
 * calculations. Local recommendation requests are bounded to a small area,
 * so an arithmetic latitude/longitude mean is both stable and deliberately
 * consistent with the existing output origin-context centre.
 *
 * `undefined` is intentional for an empty origin list: callers can retain
 * their existing no-location behaviour instead of inventing a coordinate.
 */
export const getLocationCentroid = (
  locations: readonly LocationItem[],
): LocationItem | undefined => {
  if (locations.length === 0) return undefined;

  const totals = locations.reduce(
    (current, location) => ({
      lat: current.lat + location.lat,
      lng: current.lng + location.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: totals.lat / locations.length,
    lng: totals.lng / locations.length,
  };
};
