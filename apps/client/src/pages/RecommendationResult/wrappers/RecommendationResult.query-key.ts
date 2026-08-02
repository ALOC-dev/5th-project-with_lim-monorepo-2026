export const getRecommendationResultQueryKey = (recommendationId: string) =>
  ["recommendationResult", recommendationId] as const;
