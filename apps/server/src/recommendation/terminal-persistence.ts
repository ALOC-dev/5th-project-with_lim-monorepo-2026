import type { UserOutput } from "@monorepo/recommendation-engine/v1/contracts";
import { eq } from "drizzle-orm";

import { db } from "../db/client.js";
import { placeRecommendationHistories } from "../db/schema.js";

export const HISTORY_PERSISTENCE_FAILURE = Object.freeze({
  code: "HISTORY_PERSISTENCE_FAILURE",
  message: "Recommendation history could not be persisted.",
});

export type RecommendationTerminalState =
  | {
      readonly kind: "COMPLETED";
      readonly output: UserOutput;
    }
  | {
      readonly kind: "FAILED";
      readonly code: string;
      readonly message: string;
    };

const logPersistenceFailure = (
  jobId: string,
  state: RecommendationTerminalState,
  failure: unknown,
): void => {
  console.error(
    JSON.stringify({
      event: "recommendation.persistence.failure",
      jobId,
      terminalState: state.kind,
      errorName: failure instanceof Error ? failure.name : "MissingHistoryRow",
    }),
  );
};

export const persistRecommendationTerminalState = async (
  jobId: string,
  state: RecommendationTerminalState,
): Promise<boolean> => {
  try {
    const [updated] =
      state.kind === "COMPLETED"
        ? await db
            .update(placeRecommendationHistories)
            .set({
              output: state.output,
              errorCode: null,
              errorMessage: null,
              completedAt: new Date(),
            })
            .where(eq(placeRecommendationHistories.id, jobId))
            .returning({ id: placeRecommendationHistories.id })
        : await db
            .update(placeRecommendationHistories)
            .set({
              output: null,
              errorCode: state.code,
              errorMessage: state.message,
              completedAt: new Date(),
            })
            .where(eq(placeRecommendationHistories.id, jobId))
            .returning({ id: placeRecommendationHistories.id });

    if (!updated) {
      logPersistenceFailure(jobId, state, null);
      return false;
    }

    return true;
  } catch (error: unknown) {
    logPersistenceFailure(jobId, state, error);
    return false;
  }
};
