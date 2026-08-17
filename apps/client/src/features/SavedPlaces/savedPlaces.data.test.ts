// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { SavedRecommendationPlace } from "../../apis/server/savedPlaces";
import {
  findSavedPlaceByRecommendationId,
  isSavedPlaceBookmarked,
  removeSavedPlaceFromCache,
  updateSavedPlaceBookmarkInCache,
  upsertSavedPlaceInCache,
} from "./savedPlaces.data";

const createSavedPlace = (id: string, recommendationId: string): SavedRecommendationPlace =>
  ({
    createdAt: "2026-08-13T10:00:00.000+09:00",
    historyId: null,
    id,
    placeData: { id: recommendationId },
  }) as SavedRecommendationPlace;

describe("saved place cache", () => {
  it("finds the saved row by the recommendation-place identifier", () => {
    const savedPlace = createSavedPlace("saved-1", "place-1");

    expect(findSavedPlaceByRecommendationId([savedPlace], "place-1")).toBe(savedPlace);
    expect(findSavedPlaceByRecommendationId([savedPlace], "place-2")).toBeUndefined();
    expect(
      findSavedPlaceByRecommendationId([{ ...savedPlace, isBookmarked: false }], "place-1"),
    ).toBeUndefined();
  });

  it("adds a new saved row and replaces an existing row in place", () => {
    const first = createSavedPlace("saved-1", "place-1");
    const second = createSavedPlace("saved-2", "place-2");
    const refreshedFirst = {
      ...first,
      placeData: { ...first.placeData, name: "새 이름" },
    };

    expect(upsertSavedPlaceInCache([first], second)).toEqual([second, first]);
    expect(upsertSavedPlaceInCache([first, second], refreshedFirst)).toEqual([
      refreshedFirst,
      second,
    ]);
  });

  it("removes only the saved row that was deleted", () => {
    const first = createSavedPlace("saved-1", "place-1");
    const second = createSavedPlace("saved-2", "place-2");

    expect(removeSavedPlaceFromCache([first, second], first.id)).toEqual([second]);
  });

  it("keeps a row while changing only its bookmark status", () => {
    const savedPlace = createSavedPlace("saved-1", "place-1");

    const updated = updateSavedPlaceBookmarkInCache([savedPlace], "place-1", false);

    expect(updated).toEqual([{ ...savedPlace, isBookmarked: false }]);
    expect(updated).toHaveLength(1);
    expect(isSavedPlaceBookmarked(updated?.[0] ?? savedPlace)).toBe(false);
  });

  it("replaces a stale saved row by recommendation identity", () => {
    const oldSavedPlace = createSavedPlace("saved-1", "place-1");
    const newSavedPlace = {
      ...oldSavedPlace,
      id: "saved-2",
      createdAt: "2026-08-17T10:00:00.000+09:00",
    };

    expect(upsertSavedPlaceInCache([oldSavedPlace], newSavedPlace)).toEqual([newSavedPlace]);
  });
});
