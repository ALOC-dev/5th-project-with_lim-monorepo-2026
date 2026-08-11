import type { RecommendationOriginContext } from "@monorepo/recommendation-engine/v1/contracts";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";

export type RecommendationDetailMapCenter = {
  readonly lat: number;
  readonly lng: number;
};

export type RecommendationDetailPlace = {
  readonly id: string;
  readonly rank: number;
  readonly categoryLabel: string;
  readonly description: string;
  readonly location: RecommendationDetailMapCenter;
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

export type RecommendationDetailUiContextType = {
  readonly places: readonly RecommendationDetailPlace[];
  readonly originContext: RecommendationOriginContext;
  readonly mapCenter: RecommendationDetailMapCenter;
  readonly mapZoom: number;
  readonly selectedPlaceId: string | null;
  readonly selectedPlace: RecommendationDetailPlace | null;
  readonly setMapCenter: Dispatch<SetStateAction<RecommendationDetailMapCenter>>;
  readonly setMapZoom: Dispatch<SetStateAction<number>>;
  readonly selectPlace: (placeId: string) => void;
  readonly clearSelectedPlace: () => void;
};

export const RecommendationDetailUiContext =
  createContext<RecommendationDetailUiContextType | null>(null);

export const useRecommendationDetailUiContext = () => {
  const context = useContext(RecommendationDetailUiContext);
  if (!context) {
    throw new Error(
      "useRecommendationDetailUiContext must be used within a RecommendationDetailUiProvider",
    );
  }
  return context;
};
