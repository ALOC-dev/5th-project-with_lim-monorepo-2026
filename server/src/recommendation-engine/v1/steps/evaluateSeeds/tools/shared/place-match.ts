import type { CandidateScoringEvidence } from "../../utils/evidence.js";
import {
  normalizeComparableText,
  tokenizeComparableText,
} from "./text.js";

export const buildPlaceLookupQuery = (
  evidence: CandidateScoringEvidence,
): string =>
  [evidence.name, evidence.placeInfo.roadAddress || evidence.placeInfo.address]
    .filter(Boolean)
    .join(" ");

export const scoreTextMatch = (
  actual: string | undefined,
  expected: string | undefined,
): number => {
  if (!actual || !expected) return 0;
  const normalizedActual = normalizeComparableText(actual);
  const normalizedExpected = normalizeComparableText(expected);
  if (!normalizedActual || !normalizedExpected) return 0;
  if (normalizedActual === normalizedExpected) return 1;
  if (
    normalizedActual.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedActual)
  ) {
    return 0.82;
  }

  const expectedTokens = tokenizeComparableText(expected);
  if (expectedTokens.length === 0) return 0;
  const actualTokens = new Set(tokenizeComparableText(actual));
  const hitCount = expectedTokens.filter((token) => actualTokens.has(token))
    .length;
  return Math.max(
    hitCount / expectedTokens.length,
    scoreCharacterBigramMatch(normalizedActual, normalizedExpected),
  );
};

const scoreCharacterBigramMatch = (actual: string, expected: string): number => {
  if (actual.length < 4 || expected.length < 4) return 0;
  const actualBigrams = toCharacterBigrams(actual);
  const expectedBigrams = toCharacterBigrams(expected);
  const actualCounts = new Map<string, number>();
  for (const bigram of actualBigrams) {
    actualCounts.set(bigram, (actualCounts.get(bigram) ?? 0) + 1);
  }

  let hitCount = 0;
  for (const bigram of expectedBigrams) {
    const remaining = actualCounts.get(bigram) ?? 0;
    if (remaining === 0) continue;
    hitCount += 1;
    actualCounts.set(bigram, remaining - 1);
  }

  return (hitCount * 2) / (actualBigrams.length + expectedBigrams.length);
};

const toCharacterBigrams = (value: string): string[] =>
  Array.from(value).flatMap((_, index, chars) =>
    index < chars.length - 1 ? [`${chars[index]}${chars[index + 1]}`] : [],
  );
