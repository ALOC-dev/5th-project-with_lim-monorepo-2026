import { toDistanceMeters } from "../../../utils/geo.js";
import type { LocalSeed } from "../vendors/contracts.js";

/**
 * 같은 장소로 볼 두 seed의 최대 거리.
 *
 * TMap과 카카오는 같은 가게에도 좌표를 조금씩 다르게 준다(건물 중심 대 출입구 등).
 * 실측 편차는 수십 m 수준이라 120m면 충분히 덮으면서, 한 건물에 붙어 있는 다른
 * 가게를 잘못 합칠 만큼 넓지는 않다. 이름까지 같아야 합치므로 더 안전하다.
 */
const SAME_PLACE_DISTANCE_METERS = 120;

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
    // seedKey는 provider별로 다르게 만들어지므로, 같은 가게를 TMap과 카카오가
    // 각각 반환하면 둘 다 살아남는다. 그러면 같은 가게를 두 번 조사하고 추천
    // 결과에도 중복으로 오를 수 있다. 이름과 좌표로 한 번 더 거른다.
    if (deduped.some((accepted) => isSamePlace(accepted, seed))) continue;

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

/**
 * 이름이 사실상 같고 좌표도 붙어 있으면 같은 장소로 본다.
 *
 * 지점명 표기가 갈리는 경우가 흔해서("벤스쿠키" / "벤스쿠키 홍대입구점") 한쪽이
 * 다른 쪽을 포함하는 것도 같은 이름으로 취급한다. 다만 짧은 이름이 우연히
 * 포함되는 일을 막으려고 최소 길이를 둔다.
 */
const isSamePlace = (left: LocalSeed, right: LocalSeed): boolean => {
  if (!hasSameName(left.name, right.name)) return false;

  return (
    toDistanceMeters(
      { lat: left.latitude, lng: left.longitude },
      { lat: right.latitude, lng: right.longitude },
    ) <= SAME_PLACE_DISTANCE_METERS
  );
};

const MIN_PREFIX_NAME_LENGTH = 3;
/**
 * 이름 중간에 포함된 경우까지 같은 가게로 볼 최소 길이.
 *
 * 접두 일치보다 느슨하므로 더 길게 요구한다. "홍곱창"과 "곱창"을 합치면 안 되지만,
 * `원유로스페셜티 강남역지하상가점`과 `강다짐 원유로스페셜티 강남역지하상가점`은
 * 제공자마다 브랜드명을 앞에 붙이거나 뺀 같은 가게다. 실측에서 이 둘이 추천 10건
 * 중 두 칸을 차지했다.
 */
const MIN_CONTAINED_NAME_LENGTH = 8;

const hasSameName = (left: string, right: string): boolean => {
  const normalizedLeft = normalizeSeedName(left);
  const normalizedRight = normalizeSeedName(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  const [shorter, longer] =
    normalizedLeft.length <= normalizedRight.length
      ? [normalizedLeft, normalizedRight]
      : [normalizedRight, normalizedLeft];

  if (shorter.length >= MIN_PREFIX_NAME_LENGTH && longer.startsWith(shorter)) return true;
  return shorter.length >= MIN_CONTAINED_NAME_LENGTH && longer.includes(shorter);
};

const normalizeSeedText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/gu, " ");

/** 비교용 이름. 공백과 구분기호를 없애 표기 차이를 흡수한다. */
const normalizeSeedName = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\-_.·・,()[\]]/gu, "");
