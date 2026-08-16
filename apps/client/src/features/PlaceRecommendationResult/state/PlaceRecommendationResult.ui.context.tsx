import type {
  PlaceRecommendationItem,
  RecommendationOriginContext,
} from "@monorepo/recommendation-engine/v1/contracts";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";

export type PlaceRecommendationResultMapCenter = {
  readonly lat: number;
  readonly lng: number;
};

export type PlaceRecommendationResultPlace = {
  readonly id: string;
  readonly rank: number;
  readonly categoryLabel: string;
  readonly description: string;
  readonly location: PlaceRecommendationResultMapCenter;
  readonly name: string;
  readonly phoneNumber: string | null;
  readonly priceRangeLabel: string;
  readonly referenceUrls: {
    readonly instagram?: string;
    readonly kakaoMap?: string;
    readonly naverMap?: string;
    readonly others?: readonly string[];
  };
  readonly roadAddressKo: string;
  readonly score: number;
  readonly subInfo: string;
  readonly tags: readonly string[];
  readonly recommendation: PlaceRecommendationItem;
};

export type PlaceRecommendationResultUiContextType = {
  readonly places: readonly PlaceRecommendationResultPlace[];
  readonly originContext: RecommendationOriginContext;
  readonly mapCenter: PlaceRecommendationResultMapCenter;
  readonly mapZoom: number;
  readonly selectedPlaceId: string | null;
  readonly selectedPlace: PlaceRecommendationResultPlace | null;
  readonly setMapCenter: Dispatch<SetStateAction<PlaceRecommendationResultMapCenter>>;
  readonly setMapZoom: Dispatch<SetStateAction<number>>;
  readonly selectPlace: (placeId: string) => void;
  readonly clearSelectedPlace: () => void;
};

export const PlaceRecommendationResultUiContext =
  createContext<PlaceRecommendationResultUiContextType | null>(null);

export const usePlaceRecommendationResultUiContext = () => {
  const context = useContext(PlaceRecommendationResultUiContext);
  if (!context) {
    throw new Error(
      "usePlaceRecommendationResultUiContext must be used within a PlaceRecommendationResultUiProvider",
    );
  }
  return context;
};
