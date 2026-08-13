export const PLACE_RECOMMENDATION_PROGRESS_STEPS = [
  "input_validated",
  "discovering",
  "evaluating",
  "enriching",
  "scoring",
] as const;

export type PlaceRecommendationProgressStep = (typeof PLACE_RECOMMENDATION_PROGRESS_STEPS)[number];

export type PlaceRecommendationSseEvent =
  | {
      readonly type: "progress";
      readonly step: PlaceRecommendationProgressStep;
      readonly startedAt: string;
    }
  | { readonly type: "result"; readonly data: unknown }
  | { readonly type: "error"; readonly message: string };
