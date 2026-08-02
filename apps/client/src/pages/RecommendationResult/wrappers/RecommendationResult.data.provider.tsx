import type { EngineOutput } from "@monorepo/recommendation-engine/v1/contracts";
import { EngineOutputSchema } from "@monorepo/recommendation-engine/v1/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";

import {
  RecommendationResultDataContext,
  type RecommendationResultDataContextType,
} from "./RecommendationResult.data.context";
import { getRecommendationResultQueryKey } from "./RecommendationResult.query-key";

const getEngineOutputFromLocationState = (state: unknown): EngineOutput | null => {
  if (!isRecord(state)) {
    return null;
  }

  const parseResult = EngineOutputSchema.safeParse(state.result);
  return parseResult.success ? parseResult.data : null;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  return typeof value === "object" && value !== null;
};

const toDataContextValue = (
  output: EngineOutput | null | undefined,
): RecommendationResultDataContextType => {
  if (output === null || output === undefined) {
    return { status: "error" };
  }

  switch (output.status) {
    case "ERROR":
      return { status: "error" };
    case "SUCCESS":
      return {
        result: output,
        status: "success",
      };
  }
};

export const RecommendationResultDataProvider = ({
  children,
}: {
  readonly children: ReactNode;
}) => {
  const { recommendationId } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const routeStateOutput = useMemo(
    () => getEngineOutputFromLocationState(location.state),
    [location.state],
  );

  useEffect(() => {
    if (recommendationId === undefined || routeStateOutput === null) {
      return;
    }

    queryClient.setQueryData(getRecommendationResultQueryKey(recommendationId), routeStateOutput);
  }, [queryClient, recommendationId, routeStateOutput]);

  const contextValue = useMemo<RecommendationResultDataContextType>(() => {
    if (recommendationId === undefined) {
      return { status: "error" };
    }

    const cachedOutput = queryClient.getQueryData<EngineOutput>(
      getRecommendationResultQueryKey(recommendationId),
    );

    return toDataContextValue(routeStateOutput ?? cachedOutput);
  }, [queryClient, recommendationId, routeStateOutput]);

  return (
    <RecommendationResultDataContext.Provider value={contextValue}>
      {children}
    </RecommendationResultDataContext.Provider>
  );
};
