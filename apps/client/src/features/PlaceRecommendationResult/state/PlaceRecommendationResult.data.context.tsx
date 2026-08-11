import type { EngineOutput } from "@monorepo/recommendation-engine/v1/contracts";
import { createContext, useContext } from "react";

export type PlaceRecommendationResultSuccess = Extract<EngineOutput, { status: "SUCCESS" }>;

export type PlaceRecommendationResultDataContextType =
  | {
      readonly status: "loading";
    }
  | {
      readonly status: "empty";
    }
  | {
      readonly status: "error";
      readonly message?: string;
    }
  | {
      readonly status: "success";
      readonly result: PlaceRecommendationResultSuccess;
    };

export const PlaceRecommendationResultDataContext =
  createContext<PlaceRecommendationResultDataContextType | null>(null);

export const usePlaceRecommendationResultDataContext = () => {
  const context = useContext(PlaceRecommendationResultDataContext);
  if (!context) {
    throw new Error(
      "usePlaceRecommendationResultDataContext must be used within a PlaceRecommendationResultDataContext.Provider",
    );
  }
  return context;
};
