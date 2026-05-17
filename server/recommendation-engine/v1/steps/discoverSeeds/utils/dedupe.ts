import type { LocalSeed } from "../vendors/types.js";
import { getSeedKey } from "./keys.js";

// provider가 돌려준 seed 배열을 후속 단계(evaluateSeeds)가 쓰기 좋은 형태로 좁히는 책임을 맡는다.
// 두 가지 일을 동시에 수행한다.
//   1. 같은 plan 내에서 중복된 seed 제거 (provider가 query를 분산했어도 같은 장소가 잡힐 수 있음)
//   2. 이전 attempt에서 이미 평가/탈락한 seed(excludedSeedKeys)는 다시 evaluateSeeds로 넘기지 않음
//
// 반환값의 excludedSeedKeysApplied는 디버깅/관찰용으로,
// 실제로 어떤 key가 제외되었는지 호출자가 추적할 수 있게 한다.
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

  return {
    seeds: deduped,
    seedKeys,
    excludedSeedKeysApplied,
  };
};
