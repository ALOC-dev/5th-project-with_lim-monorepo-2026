import type { Location } from "../components/location/LocationSelection.context";
import { toFiniteNumber, toNonEmptyText } from "./locationText";

export type LocationSearchPlace = {
  readonly id: string;
  readonly placeName: string;
  readonly roadNameAddress: string;
  readonly lat: number;
  readonly lng: number;
  readonly distanceMeters?: number;
};

type LocationSearchPlaceSource = {
  readonly id: string | null | undefined;
  readonly place_name: string | null | undefined;
  readonly road_address_name: string | null | undefined;
  readonly address_name: string | null | undefined;
  readonly x: string | number | null | undefined;
  readonly y: string | number | null | undefined;
  readonly distance: string | number | null | undefined;
};

/**
 * Converts a normalized search place into the form's selected-location shape.
 * Search rows keep list-only fields such as id and distance; once a user picks a row, the form only
 * needs coordinates plus displayable address/name values.
 */
export const toLocationFromSearchPlace = ({
  lat,
  lng,
  placeName,
  roadNameAddress,
}: LocationSearchPlace): Location => ({
  lat,
  lng,
  placeName,
  roadNameAddress,
});

/**
 * Normalizes one Kakao keyword-search row into the app's stable place shape.
 * Kakao fields can be blank and coordinates arrive as strings, so this function trims labels,
 * falls back from road address to lot-number address, and rejects incomplete rows.
 */
export const toLocationSearchPlace = (
  place: LocationSearchPlaceSource,
): LocationSearchPlace | null => {
  const id = toNonEmptyText(place.id);
  const placeName = toNonEmptyText(place.place_name);
  const roadNameAddress =
    toNonEmptyText(place.road_address_name) ?? toNonEmptyText(place.address_name);
  const lat = toFiniteNumber(place.y);
  const lng = toFiniteNumber(place.x);

  if (!id || !placeName || !roadNameAddress || lat === null || lng === null) {
    return null;
  }

  const distanceMeters = toFiniteNumber(place.distance);

  if (distanceMeters === null) {
    return {
      id,
      placeName,
      roadNameAddress,
      lat,
      lng,
    };
  }

  return {
    id,
    placeName,
    roadNameAddress,
    lat,
    lng,
    distanceMeters,
  };
};

/**
 * Narrows nullable parse results to valid search places.
 * This lets API code keep its map/filter pipeline while preserving the exact list item type after
 * malformed Kakao rows have been removed.
 */
export const isLocationSearchPlace = (
  place: LocationSearchPlace | null,
): place is LocationSearchPlace => {
  return place !== null;
};
