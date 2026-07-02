import type { LocationSearchPlace } from "./locationSearchPlace";

export type LocationSearchFailureReason =
  | "empty-query"
  | "sdk-unavailable"
  | "zero-result"
  | "request-error";

export type SearchLocationsResult =
  | {
      readonly kind: "success";
      readonly places: readonly LocationSearchPlace[];
    }
  | {
      readonly kind: "failure";
      readonly reason: LocationSearchFailureReason;
    };

/**
 * Creates the discriminated failure result used by keyword-search UI state.
 * Keeping the result shape here leaves the API adapter responsible for status mapping only, while
 * shared result construction stays with the rest of the form utilities.
 */
export const toSearchLocationsFailure = (
  reason: LocationSearchFailureReason,
): SearchLocationsResult => ({
  kind: "failure",
  reason,
});
