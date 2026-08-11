import type { EngineOutput } from "@monorepo/recommendation-engine/v1/contracts";
import type { ReactNode } from "react";
import { useMemo } from "react";

import {
  RecommendationDetailDataContext,
  type RecommendationDetailDataContextType,
} from "./RecommendationDetail.data.context";

const toRecommendationDetailDataContextValue = (
  output: EngineOutput | null | undefined,
): RecommendationDetailDataContextType => {
  if (output === null || output === undefined) return { status: "error" };

  switch (output.status) {
    case "ERROR":
      return { message: output.error.message, status: "error" };
    case "SUCCESS":
      return output.userOutput.recommendations.length === 0
        ? { status: "empty" }
        : { result: output, status: "success" };
  }
};

export const RecommendationDetailDataProvider = ({
  children,
  output,
}: {
  readonly children: ReactNode;
  readonly output: EngineOutput | null;
}) => {
  const contextValue = useMemo(() => toRecommendationDetailDataContextValue(output), [output]);

  return (
    <RecommendationDetailDataContext.Provider value={contextValue}>
      {children}
    </RecommendationDetailDataContext.Provider>
  );
};
