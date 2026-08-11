import type { UserOutput } from "@monorepo/recommendation-engine/v1/contracts";

export type RecommendationHistoryStatus = "PENDING" | "COMPLETED" | "FAILED";
export type RecommendationTerminalDelivery = "result" | "error" | "disconnect";

type RecommendationHistoryState = {
  readonly output: Pick<UserOutput, "recommendations"> | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
};

type PersistTerminalState = () => Promise<boolean>;

export const deriveRecommendationHistoryTitle = (request: string): string =>
  [...request.trim().replace(/\s+/gu, " ")].slice(0, 60).join("");

export const deriveRecommendationHistoryStatus = (
  history: RecommendationHistoryState,
): RecommendationHistoryStatus => {
  if (history.output !== null) {
    return "COMPLETED";
  }

  if (history.errorCode !== null || history.errorMessage !== null) {
    return "FAILED";
  }

  return "PENDING";
};

export const resolveRecommendationTerminalDelivery = async (
  requestedDelivery: Exclude<RecommendationTerminalDelivery, "disconnect">,
  persistRequestedState: PersistTerminalState,
  persistFailureFallback: PersistTerminalState,
): Promise<RecommendationTerminalDelivery> => {
  if (await persistRequestedState()) {
    return requestedDelivery;
  }

  if (await persistFailureFallback()) {
    return "error";
  }

  return "disconnect";
};
