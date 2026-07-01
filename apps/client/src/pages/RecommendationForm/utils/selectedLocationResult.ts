import { toNonEmptyText } from "./locationText";

export type ReverseGeocodeCoordinates = {
  readonly lat: number;
  readonly lng: number;
};

export type ResolveSelectedLocationParams = ReverseGeocodeCoordinates;

export type ResolveSelectedLocationFailureReason =
  | "sdk-unavailable"
  | "zero-result"
  | "request-error"
  | "address-unavailable";

export type ResolveSelectedLocationResult =
  | {
      readonly kind: "place";
      readonly placeName: string;
      readonly roadNameAddress: string;
    }
  | {
      readonly kind: "address";
      readonly roadNameAddress: string;
    }
  | {
      readonly kind: "failure";
      readonly reason: ResolveSelectedLocationFailureReason;
    };

type AddressDocumentSource = {
  readonly road_address?: {
    readonly address_name?: string | null;
  } | null;
};

/**
 * Extracts the road address from Kakao reverse-geocode documents.
 * The map-selection UI expects a road-name address; if Kakao returns only unusable address data,
 * this converts that boundary condition into an explicit failure result.
 */
export const selectAddressName = (
  documents: readonly AddressDocumentSource[],
): ResolveSelectedLocationResult => {
  const firstDocument = documents[0];
  const roadNameAddress = toNonEmptyText(firstDocument?.road_address?.address_name);

  if (!roadNameAddress) {
    return toResolveSelectedLocationFailure("address-unavailable");
  }

  return {
    kind: "address",
    roadNameAddress,
  };
};

/**
 * Creates the discriminated failure result consumed by map-selection UI state.
 * Centralizing the shape keeps callers on a simple `kind` switch instead of mixing exceptions and
 * nullable return values.
 */
export const toResolveSelectedLocationFailure = (
  reason: ResolveSelectedLocationFailureReason,
): ResolveSelectedLocationResult => ({
  kind: "failure",
  reason,
});
