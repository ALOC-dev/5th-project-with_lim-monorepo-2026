import type { CourseEstimatedCostPerPerson } from "@monorepo/api-contracts";

export const presentEstimatedCostPerPerson = (
  range: readonly [number, number],
): CourseEstimatedCostPerPerson => {
  const [min, max] = range;
  if (min === 0 && max === 0) {
    return { min: null, max: null, quality: "UNKNOWN" };
  }
  return { min, max, quality: "ESTIMATED" };
};
