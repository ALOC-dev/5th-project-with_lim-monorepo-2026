import type { EngineOutput } from "@monorepo/recommendation-engine/v1/contracts";
import { createContext, useContext } from "react";

export type RecommendationDetailSuccess = Extract<EngineOutput, { status: "SUCCESS" }>;

export type RecommendationDetailDataContextType =
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
      readonly result: RecommendationDetailSuccess;
    };

export const RecommendationDetailDataContext =
  createContext<RecommendationDetailDataContextType | null>(null);

export const useRecommendationDetailDataContext = () => {
  const context = useContext(RecommendationDetailDataContext);
  if (!context) {
    throw new Error(
      "useRecommendationDetailDataContext must be used within a RecommendationDetailDataContext.Provider",
    );
  }
  return context;
};
