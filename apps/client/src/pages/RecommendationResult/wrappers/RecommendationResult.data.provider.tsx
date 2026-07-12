import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useParams } from "react-router-dom";

import { mockEngineOutput } from "../../../mockEngineOutput";
import {
  RecommendationResultDataContext,
  type RecommendationResultDataContextType,
} from "./RecommendationResult.data.context";

const RECOMMENDATION_RESULT_MOCK_QUERY_KEY = ["recommendationResult", "mock"] as const;

const fetchMockRecommendationResult = () => mockEngineOutput;

export const RecommendationResultDataProvider = ({
  children,
}: {
  readonly children: ReactNode;
}) => {
  const { recommendationId } = useParams();

  const resultQuery = useQuery({
    queryKey: [...RECOMMENDATION_RESULT_MOCK_QUERY_KEY, recommendationId],
    queryFn: fetchMockRecommendationResult,
    retry: false,
    staleTime: Infinity,
  });

  const contextValue = useMemo<RecommendationResultDataContextType>(() => {
    if (resultQuery.isPending) {
      return { status: "loading" };
    }

    if (resultQuery.isError) {
      return { status: "error" };
    }

    if (resultQuery.isSuccess) {
      if (resultQuery.data.status === "ERROR") return { status: "error" };
      else
        return {
          result: resultQuery.data,
          status: "success",
        };
    }

    const exhaustiveCheck: never = resultQuery;
    return exhaustiveCheck;
  }, [resultQuery]);

  return (
    <RecommendationResultDataContext.Provider value={contextValue}>
      {children}
    </RecommendationResultDataContext.Provider>
  );
};
