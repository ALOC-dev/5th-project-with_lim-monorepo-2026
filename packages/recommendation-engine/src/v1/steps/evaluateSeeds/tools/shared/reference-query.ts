import type { CandidateScoringEvidence } from "../../utils/evidence.js";
import { scoreTextMatch } from "./place-match.js";
import { clamp01, normalizeComparableText } from "./text.js";

export type ReferenceQueryVariant = {
  query: string;
  nameAlias: string;
  kind:
    | "name_road_address"
    | "name_address"
    | "alias_road_address"
    | "alias_address"
    | "name_only"
    | "alias_only"
    // enrichment 단계에서 이미 긁어둔 URL을 그대로 재검증한 경우.
    | "reused_enrichment_scrape";
};

export type ReferenceIdentityScore = {
  nameScore: number;
  addressScore: number;
  distanceScore?: number;
  identityScore: number;
  accepted: boolean;
  acceptedReason: string;
};

export type ReferenceUrlMatch = {
  url: string;
  query: ReferenceQueryVariant;
  identity: ReferenceIdentityScore;
};

const CLOSE_PLACE_DISTANCE_METERS = 300;
const MAX_DISTANCE_SCORE_METERS = 2_000;

/**
 * 같은 가게로 인정할 수 있는 최대 거리(m).
 *
 * 지도 링크를 눌렀더니 다른 동네의 같은 브랜드 지점이 열리는 버그를 막는다.
 * 이름과 주소만 보던 승인 규칙(`name_address_match`, `strong_name_partial_address_match`)
 * 에는 거리 조건이 없었다. 참조 검색은 후보 좌표 기준 반경 2km로 도는데, 그
 * 안에는 같은 체인의 다른 지점이 얼마든지 있다. "이디야커피 회기역중앙점"과
 * "이디야커피 회기점"은 이름 0.82, 주소 0.2를 가볍게 넘기고 승인돼 버렸다.
 *
 * 제공자 간 좌표 편차는 수십 m 수준이라 500m면 넉넉하다. 이보다 멀면 이름이
 * 아무리 같아도 다른 가게다. 애매하면 링크를 안 주는 쪽이 틀린 링크를 주는
 * 것보다 낫다.
 */
const MAX_SAME_PLACE_DISTANCE_METERS = 500;

/** 거리로 탈락시킬 때 쓰는 점수. 참조 확인(0.65)과 보강 조회(0.35) 문턱 아래여야 한다. */
const REJECTED_BY_DISTANCE_SCORE = 0.3;

export const buildReferenceQueryVariants = (
  evidence: CandidateScoringEvidence,
): ReferenceQueryVariant[] => {
  const names = buildReferenceNameAliases(evidence.name);
  const variants = names.flatMap((nameAlias, index) => {
    const isOriginal = index === 0;
    return [
      toVariant(
        [nameAlias, evidence.placeInfo.roadAddress],
        nameAlias,
        isOriginal ? "name_road_address" : "alias_road_address",
      ),
      toVariant(
        [nameAlias, evidence.placeInfo.address],
        nameAlias,
        isOriginal ? "name_address" : "alias_address",
      ),
      toVariant([nameAlias], nameAlias, isOriginal ? "name_only" : "alias_only"),
    ];
  });

  const deduped = new Map<string, ReferenceQueryVariant>();
  for (const variant of variants) {
    if (variant.query) deduped.set(variant.query, variant);
  }
  return [...deduped.values()];
};

const buildReferenceNameAliases = (name: string): string[] => {
  const normalized = name.replace(/\s+/gu, " ").trim();
  const aliases = new Set([normalized]);
  addAlias(aliases, stripNoiseSuffix(normalized));
  addAlias(aliases, stripBranchSuffix(normalized));
  addAlias(aliases, normalizeHeadquartersSuffix(normalized));
  addAlias(aliases, stripNoiseSuffix(stripBranchSuffix(normalized)));
  return [...aliases].filter((alias) => alias.length >= 2);
};

export const scoreStructuredReferenceIdentity = ({
  actualName,
  actualRoadAddress,
  actualAddress,
  expected,
  distanceMeters,
}: {
  actualName?: string;
  actualRoadAddress?: string;
  actualAddress?: string;
  expected: CandidateScoringEvidence;
  distanceMeters?: number;
}): ReferenceIdentityScore => {
  const nameScore = scoreTextMatch(actualName, expected.name);
  const addressScore = Math.max(
    scoreTextMatch(actualRoadAddress, expected.placeInfo.roadAddress),
    scoreTextMatch(actualAddress, expected.placeInfo.address),
  );
  return toReferenceIdentityScore({ nameScore, addressScore, distanceMeters });
};

export const scoreTextReferenceIdentity = (
  text: string,
  expected: CandidateScoringEvidence,
): ReferenceIdentityScore => {
  const normalizedText = normalizeComparableText(text);
  const nameScore = scoreTextMatch(text, expected.name);
  const roadAddressScore = scoreTextMatch(text, expected.placeInfo.roadAddress);
  const addressScore = scoreTextMatch(text, expected.placeInfo.address);
  const containsName = normalizedText.includes(normalizeComparableText(expected.name));
  const containsRoadAddress =
    expected.placeInfo.roadAddress.length > 0 &&
    normalizedText.includes(normalizeComparableText(expected.placeInfo.roadAddress));
  const containsAddress =
    expected.placeInfo.address.length > 0 &&
    normalizedText.includes(normalizeComparableText(expected.placeInfo.address));

  return toReferenceIdentityScore({
    nameScore: Math.max(nameScore, containsName ? 1 : 0),
    addressScore: Math.max(
      roadAddressScore,
      addressScore,
      containsRoadAddress || containsAddress ? 1 : 0,
    ),
  });
};

const toVariant = (
  parts: Array<string | undefined>,
  nameAlias: string,
  kind: ReferenceQueryVariant["kind"],
): ReferenceQueryVariant => ({
  query: parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" "),
  nameAlias,
  kind,
});

const addAlias = (aliases: Set<string>, alias: string): void => {
  const trimmed = alias.replace(/\s+/gu, " ").trim();
  if (trimmed.length >= 2) aliases.add(trimmed);
};

const stripNoiseSuffix = (name: string): string =>
  name
    .replace(/\s+(?:주차장|별관|직영점|임시영업소)$/u, "")
    .replace(/\s*\([^)]*(?:주차장|별관|직영점)[^)]*\)$/u, "");

const stripBranchSuffix = (name: string): string =>
  name.replace(/\s+[가-힣A-Za-z0-9]+(?:역사점|신분당선점|지하상가점|아라타워점|역점|점)$/u, "");

const normalizeHeadquartersSuffix = (name: string): string =>
  name.replace(/\s+[가-힣A-Za-z0-9]+본점$/u, " 본점");

const toReferenceIdentityScore = ({
  nameScore,
  addressScore,
  distanceMeters,
}: {
  nameScore: number;
  addressScore: number;
  distanceMeters?: number;
}): ReferenceIdentityScore => {
  const distanceScore =
    distanceMeters === undefined
      ? undefined
      : clamp01(
          1 - Math.min(distanceMeters, MAX_DISTANCE_SCORE_METERS) / MAX_DISTANCE_SCORE_METERS,
        );
  const weightedIdentity = nameScore * 0.55 + addressScore * 0.3 + (distanceScore ?? 0.4) * 0.15;

  // 좌표를 아는데 멀리 떨어져 있으면, 이름과 주소가 아무리 비슷해도 다른 가게다.
  // 이름 가중치(0.55)만으로 승인선을 넘길 수 있어서 거리를 거부권으로 둔다.
  if (distanceMeters !== undefined && distanceMeters > MAX_SAME_PLACE_DISTANCE_METERS) {
    return {
      nameScore,
      addressScore,
      distanceScore,
      identityScore: Math.min(weightedIdentity, REJECTED_BY_DISTANCE_SCORE),
      accepted: false,
      acceptedReason: "too_far_to_be_the_same_place",
    };
  }

  if (
    distanceMeters !== undefined &&
    distanceMeters <= CLOSE_PLACE_DISTANCE_METERS &&
    nameScore >= 0.62
  ) {
    return {
      nameScore,
      addressScore,
      distanceScore,
      identityScore: Math.max(weightedIdentity, nameScore * 0.85 + (distanceScore ?? 0) * 0.15),
      accepted: true,
      acceptedReason: "close_distance_name_match",
    };
  }

  if (nameScore >= 0.58 && addressScore >= 0.35) {
    return {
      nameScore,
      addressScore,
      distanceScore,
      identityScore: Math.max(
        weightedIdentity,
        nameScore * 0.75 + addressScore * 0.2 + (distanceScore ?? 0.4) * 0.05,
      ),
      accepted: true,
      acceptedReason: "name_address_match",
    };
  }

  if (nameScore >= 0.82 && addressScore >= 0.2) {
    return {
      nameScore,
      addressScore,
      distanceScore,
      identityScore: Math.max(weightedIdentity, nameScore * 0.85 + addressScore * 0.15),
      accepted: true,
      acceptedReason: "strong_name_partial_address_match",
    };
  }

  return {
    nameScore,
    addressScore,
    distanceScore,
    identityScore: weightedIdentity,
    accepted: false,
    acceptedReason: "insufficient_identity_match",
  };
};
