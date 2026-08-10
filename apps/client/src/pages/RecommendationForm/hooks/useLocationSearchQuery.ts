import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import {
  type LocationSearchFailureReason,
  searchLocationsByKeyword,
  type SearchLocationsResult,
  toLocationFromSearchPlace,
} from "../../../apis/kakao/searchPlaces";
import type { Location } from "../components/location/LocationSelection.context";
import { useLocationSelection } from "../components/location/LocationSelection.context";
import { useRecommendationFormInput } from "../RecommendationForm.context";
import { locationSearchHistoryStorage } from "../utils/locationSearchHistory";

export type LocationSearchQueryStatus = "idle" | "loading" | "success" | "empty" | "failed";

export type LocationSearchQueryResult = {
  readonly locations: readonly Location[];
  readonly status: LocationSearchQueryStatus;
  readonly failureReason: LocationSearchFailureReason | null;
  readonly query: string;
};

const LOCATION_SEARCH_RESULT_SIZE = 10;
const LOCATION_SEARCH_STALE_TIME_MS = 30_000;
const LOCATION_SEARCH_HISTORY_SAVE_DELAY_MS = 500;

export const useLocationSearchQuery = (): LocationSearchQueryResult => {
  const { locations: formLocations } = useRecommendationFormInput();
  const { query } = useLocationSelection();
  const normalizedQuery = query.trim();
  const latestSavedQueryRef = useRef("");

  // 검색의 기준이 될 좌표를 계산합니다. (마지막 장소 기준, 없으면 서울시청)
  const lastLocation = formLocations[formLocations.length - 1];
  const searchLat = lastLocation?.lat ?? 37.5665;
  const searchLng = lastLocation?.lng ?? 126.978;

  const searchQuery = useQuery({
    queryKey: ["locationSearch", normalizedQuery, searchLat, searchLng] as const,
    queryFn: () =>
      searchLocationsByKeyword({
        query: normalizedQuery,
        currentLocation: {
          lat: searchLat,
          lng: searchLng,
        },
        size: LOCATION_SEARCH_RESULT_SIZE,
      }),
    enabled: normalizedQuery.length > 0,
    retry: false,
    staleTime: LOCATION_SEARCH_STALE_TIME_MS,
  });

  useEffect(() => {
    if (!shouldStoreQueryHistory(normalizedQuery, searchQuery.data)) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      if (latestSavedQueryRef.current === normalizedQuery) {
        return;
      }

      locationSearchHistoryStorage.insert({
        type: "query",
        query: normalizedQuery,
      });
      latestSavedQueryRef.current = normalizedQuery;
    }, LOCATION_SEARCH_HISTORY_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [normalizedQuery, searchQuery.data]);

  if (normalizedQuery.length === 0) {
    return {
      locations: [],
      status: "idle",
      failureReason: null,
      query: normalizedQuery,
    };
  }

  if (searchQuery.isPending) {
    return {
      locations: [],
      status: "loading",
      failureReason: null,
      query: normalizedQuery,
    };
  }

  if (searchQuery.isError || !searchQuery.data) {
    return {
      locations: [],
      status: "failed",
      failureReason: "request-error",
      query: normalizedQuery,
    };
  }

  switch (searchQuery.data.kind) {
    case "success": {
      const locations = searchQuery.data.places.map(toLocationFromSearchPlace);

      return {
        locations,
        status: locations.length > 0 ? "success" : "empty",
        failureReason: null,
        query: normalizedQuery,
      };
    }
    case "failure":
      return {
        locations: [],
        status:
          searchQuery.data.reason === "empty-query"
            ? "idle"
            : toFailureStatus(searchQuery.data.reason),
        failureReason: searchQuery.data.reason,
        query: normalizedQuery,
      };
  }
};

const shouldStoreQueryHistory = (
  normalizedQuery: string,
  result: SearchLocationsResult | undefined,
): boolean => {
  if (normalizedQuery.length === 0 || !result) {
    return false;
  }

  switch (result.kind) {
    case "success":
      return true;
    case "failure":
      return result.reason === "zero-result";
  }
};

const toFailureStatus = (
  reason: Exclude<LocationSearchFailureReason, "empty-query">,
): Exclude<LocationSearchQueryStatus, "loading" | "success"> => {
  switch (reason) {
    case "zero-result":
      return "empty";
    case "sdk-unavailable":
    case "request-error":
      return "failed";
  }
};
