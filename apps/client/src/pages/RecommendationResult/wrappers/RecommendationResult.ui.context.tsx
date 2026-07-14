import type { RecommendationOriginContext } from "@monorepo/recommendation-engine/v1/contracts";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";

export type RecommendationResultMapCenter = {
  readonly lat: number;
  readonly lng: number;
};

export type RecommendationResultPlace = {
  readonly id: string;
  readonly rank: number;
  readonly categoryLabel: string;
  readonly description: string;
  readonly location: RecommendationResultMapCenter;
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
};

export type RecommendationResultUiContextType = {
  readonly places: readonly RecommendationResultPlace[];
  readonly originContext: RecommendationOriginContext;
  readonly mapCenter: RecommendationResultMapCenter;
  readonly mapZoom: number;
  readonly selectedPlaceId: string | null;
  readonly selectedPlace: RecommendationResultPlace | null;
  readonly setMapCenter: Dispatch<SetStateAction<RecommendationResultMapCenter>>;
  readonly setMapZoom: Dispatch<SetStateAction<number>>;
  readonly selectPlace: (placeId: string) => void;
  readonly clearSelectedPlace: () => void;
};

export const RecommendationResultUiContext =
  createContext<RecommendationResultUiContextType | null>(null);

export const useRecommendationResultUiContext = () => {
  const context = useContext(RecommendationResultUiContext);
  if (!context) {
    throw new Error(
      "useRecommendationResultUiContext must be used within a RecommendationResultUiProvider",
    );
  }
  return context;
};
