export type PlaceRecommendationProgressStep =
  | "input_validated"
  | "discovering"
  | "evaluating"
  | "enriching"
  | "scoring";

export type PlaceRecommendationSseEvent =
  | { type: "progress"; step: PlaceRecommendationProgressStep }
  | { type: "result"; data: unknown }
  | { type: "error"; message: string };
