export const clampScore = (score: number): number =>
  Math.max(0, Math.min(100, score));

export const roundScore = (score: number): number => Math.round(clampScore(score));

export const logarithmicScore = (value: number, maxValue: number): number => {
  if (value <= 0) return 40;
  return Math.min(
    100,
    (Math.log10(value + 1) / Math.log10(maxValue + 1)) * 100,
  );
};
