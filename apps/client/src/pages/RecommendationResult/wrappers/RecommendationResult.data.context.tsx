import type { EngineOutput } from "@monorepo/recommendation-engine/v1/contracts";
import { createContext, useContext } from "react";

export type RecommendationResultSuccess = Extract<EngineOutput, { status: "SUCCESS" }>;

export type RecommendationResultDataContextType =
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
      readonly result: RecommendationResultSuccess;
    };

export const RecommendationResultDataContext =
  createContext<RecommendationResultDataContextType | null>(null);

export const useRecommendationResultDataContext = () => {
  const context = useContext(RecommendationResultDataContext);
  if (!context) {
    throw new Error(
      "useRecommendationResultDataContext must be used within a RecommendationResultDataContext.Provider",
    );
  }
  return context;
};
