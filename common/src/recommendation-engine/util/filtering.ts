import { PlaceRecommendationItemSchema, type UserInput } from "../contracts/index.js";
import { getNearestDistanceKm } from "./geo.js";
import { isAvailableForVisit } from "./schedule.js";
import { DEFAULT_WEIGHTS, toRecommendationItem } from "./scoring.js";
import type {
  RecommendationCandidate,
  RequiredEngineConfig,
} from "./types.js";

export const dedupeCandidates = (
  candidates: RecommendationCandidate[],
): RecommendationCandidate[] => {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = `${candidate.id}:${candidate.name}:${candidate.location.lat}:${candidate.location.lng}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getFilteringReason = (
  candidate: RecommendationCandidate,
  userInput: UserInput,
  config: RequiredEngineConfig,
): string | null => {
  if (
    candidate.status === "CLOSED" ||
    candidate.status === "TEMPORARILY_CLOSED"
  ) {
    return "inactive place";
  }

  const candidateShape = PlaceRecommendationItemSchema.safeParse(
    toRecommendationItem({
      candidate,
      score: 0,
      reasons: ["candidate shape validation"],
      scoreBreakdown: DEFAULT_WEIGHTS,
    }),
  );
  if (!candidateShape.success) {
    return "invalid candidate shape";
  }

  if (candidate.priceRangePerPerson[0] > userInput.budgetPerPerson[1]) {
    return "outside budget";
  }

  const nearestDistanceKm = getNearestDistanceKm(
    userInput.location,
    candidate.location,
  );
  if (nearestDistanceKm !== null && nearestDistanceKm > config.maxDistanceKm) {
    return "outside distance range";
  }

  if (!isAvailableForVisit(candidate, userInput)) {
    return "not available for requested schedule";
  }

  return null;
};
