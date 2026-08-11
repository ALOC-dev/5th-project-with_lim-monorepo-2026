import type { EngineOutput } from "@monorepo/recommendation-engine/v1/contracts";
import { EngineOutputSchema } from "@monorepo/recommendation-engine/v1/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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

export const toRecommendationResultDataContextValue = (
  output: EngineOutput | null | undefined,
): RecommendationResultDataContextType => {
  if (output === null || output === undefined) {
    return { status: "error" };
  }

  switch (output.status) {
    case "ERROR":
      return { message: output.error.message, status: "error" };
    case "SUCCESS":
      if (output.userOutput.recommendations.length === 0) {
        return { status: "empty" };
      }

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
  const [contextValue, setContextValue] = useState<RecommendationResultDataContextType>({
    status: "loading",
  });

  useEffect(() => {
    if (recommendationId === undefined) {
      setContextValue({ status: "error" });
      return;
    }

    if (routeStateOutput !== null) {
      queryClient.setQueryData(getRecommendationResultQueryKey(recommendationId), routeStateOutput);
    }

    const cachedOutput = queryClient.getQueryData<EngineOutput>(
      getRecommendationResultQueryKey(recommendationId),
    );

    setContextValue(toRecommendationResultDataContextValue(routeStateOutput ?? cachedOutput));
  }, [queryClient, recommendationId, routeStateOutput]);

  return (
    <RecommendationResultDataContext.Provider value={contextValue}>
      {children}
    </RecommendationResultDataContext.Provider>
  );
};
