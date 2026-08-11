/**
 * Parses Kakao string/number fields into finite numbers.
 * Kakao search responses expose coordinates and distances as text-like values, so callers use this
 * helper before storing them as app-level numeric coordinates.
 */
export const toFiniteNumber = (value: string | number | null | undefined): number | null => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return numericValue;
};

/**
 * Trims nullable text fields and treats empty strings as missing data.
 * Returning only non-empty strings keeps display labels and address fields from carrying invisible
 * whitespace through the form state.
 */
export const toNonEmptyText = (value: string | null | undefined): string | null => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue;
};
