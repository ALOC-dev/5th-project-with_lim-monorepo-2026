import type { LocalSeed } from "../vendors/contracts.js";

export const dedupeAndExclude = (
  seeds: LocalSeed[],
  excludedSeedKeys: string[],
): {
  seeds: LocalSeed[];
  seedKeys: string[];
  excludedSeedKeysApplied: string[];
} => {
  const excluded = new Set(excludedSeedKeys);
  const seen = new Set<string>();
  const deduped: LocalSeed[] = [];
  const seedKeys: string[] = [];
  const excludedSeedKeysApplied: string[] = [];

  for (const seed of seeds) {
    const seedKey = getSeedKey(seed);
    if (excluded.has(seedKey)) {
      excludedSeedKeysApplied.push(seedKey);
      continue;
    }
    if (seen.has(seedKey)) continue;

    seen.add(seedKey);
    seedKeys.push(seedKey);
    deduped.push(seed);
  }

  return { seeds: deduped, seedKeys, excludedSeedKeysApplied };
};

const getSeedKey = (seed: LocalSeed): string => {
  if (seed.providerPlaceId) return `${seed.provider}:${seed.providerPlaceId}`;

  return [
    seed.provider,
    normalizeSeedText(seed.name),
    normalizeSeedText(seed.roadAddress || seed.address),
    seed.longitude.toFixed(5),
    seed.latitude.toFixed(5),
  ].join("|");
};

const normalizeSeedText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/gu, " ");
