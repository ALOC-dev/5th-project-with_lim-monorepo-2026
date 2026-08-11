import type { EngineOutput } from "@monorepo/recommendation-engine/v1/contracts";
import type { ReactNode } from "react";
import { useMemo } from "react";

import {
  PlaceRecommendationResultDataContext,
  type PlaceRecommendationResultDataContextType,
} from "./PlaceRecommendationResult.data.context";

const toPlaceRecommendationResultDataContextValue = (
  output: EngineOutput | null | undefined,
): PlaceRecommendationResultDataContextType => {
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

export const PlaceRecommendationResultDataProvider = ({
  children,
  output,
}: {
  readonly children: ReactNode;
  readonly output: EngineOutput | null;
}) => {
  const contextValue = useMemo(() => toPlaceRecommendationResultDataContextValue(output), [output]);

  return (
    <PlaceRecommendationResultDataContext.Provider value={contextValue}>
      {children}
    </PlaceRecommendationResultDataContext.Provider>
  );
};
