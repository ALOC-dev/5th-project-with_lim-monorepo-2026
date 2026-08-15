import type { UserInput } from "../../../interfaces/input.contracts.js";
import { getLocationCentroid } from "../../../utils/geography.js";
import type { LocalSeed } from "../../discoverSeeds/vendors/contracts.js";
import type { CandidateEnrichment } from "./enrichment-types.js";
import type { SemanticFitAssessment } from "./semantic-fit.js";

export type CandidateScoringEvidence = {
  candidateId: string;
  name: string;
  category: {
    mainCategory: string;
    subCategory: string;
    tags: string[];
  };
  userFit: {
    naturalLanguageRequest: string;
    partyType: UserInput["partyType"];
    activityType?: NonNullable<UserInput["activityType"]>;
    numberOfPeople: UserInput["numberOfPeople"];
    budgetPerPerson: UserInput["budgetPerPerson"];
  };
  placeInfo: {
    address: string;
    roadAddress: string;
    lat: number;
    lng: number;
    priceRangePerPerson?: [number, number];
    placeUrl?: string;
  };
  trustSignals: {
    naverRating?: number;
    kakaoRating?: number;
    naverVisitorReviewCount?: number;
    naverBlogReviewCount?: number;
    webMentionCount?: number;
    sourceAgreementCount?: number;
    placeMatchScore?: number;
    evidenceUrls: string[];
  };
  accessibilitySignals: {
    distanceMeters?: number;
    estimatedTravelMinutes?: number;
    parkingAvailable?: boolean;
    openTimeBufferMinutes?: number;
  };
  raw: {
    seedKey: string;
    seed: LocalSeed;
  };
  enrichment?: CandidateEnrichment;
  semanticFit?: SemanticFitAssessment;
  referenceUrls?: {
    kakaoMap?: string;
    naverMap?: string;
  };
};

const EARTH_RADIUS_METERS = 6_371_000;

export const buildCandidateScoringEvidence = (
  seed: LocalSeed,
  seedKey: string,
  userInput: UserInput,
): CandidateScoringEvidence => {
  const tags = splitCategoryTags(seed.category);
  const [mainCategory = "장소", subCategory = mainCategory] = tags;
  const distanceMeters = seed.distanceMeters ?? toDistanceFromUserLocation(seed, userInput);

  return {
    candidateId: seedKey,
    name: seed.name,
    category: {
      mainCategory,
      subCategory,
      tags: tags.slice(0, 5),
    },
    userFit: {
      naturalLanguageRequest: userInput.userNaturalLanguageRequest,
      partyType: userInput.partyType,
      ...(userInput.activityType === undefined ? {} : { activityType: userInput.activityType }),
      numberOfPeople: userInput.numberOfPeople,
      budgetPerPerson: userInput.budgetPerPerson,
    },
    placeInfo: {
      address: seed.address,
      roadAddress: seed.roadAddress,
      lat: seed.latitude,
      lng: seed.longitude,
      placeUrl: seed.placeUrl,
    },
    trustSignals: {
      evidenceUrls: seed.placeUrl ? [seed.placeUrl] : [],
    },
    accessibilitySignals: {
      distanceMeters,
    },
    raw: {
      seedKey,
      seed,
    },
  };
};

const splitCategoryTags = (category: string): string[] =>
  category
    .split(/[>,/|·]/u)
    .map((value) => value.trim())
    .filter(Boolean);

const toDistanceFromUserLocation = (seed: LocalSeed, userInput: UserInput): number | undefined => {
  // 공급자가 distance를 주지 않는 경우에도 그룹 요청은 첫 번째(호스트) 위치가 아니라
  // 모든 참여자의 중심점을 기준으로 접근성을 비교한다. 개별 출발지 거리는 output 단계에서
  // 계속 별도로 계산하므로 공개 응답의 perOrigin 형태는 변하지 않는다.
  const origin = getLocationCentroid(userInput.location);
  if (!origin) return undefined;

  const dLat = toRadians(seed.latitude - origin.lat);
  const dLng = toRadians(seed.longitude - origin.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(origin.lat)) * Math.cos(toRadians(seed.latitude)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
