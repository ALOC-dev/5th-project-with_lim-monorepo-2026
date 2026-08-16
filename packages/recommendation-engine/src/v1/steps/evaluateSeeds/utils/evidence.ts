import type { UserInput } from "../../../interfaces/input.contracts.js";
import { toDistanceMeters, toSearchCenter } from "../../../utils/geo.js";
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
  /**
   * 영업시간을 끝내 확인하지 못한 후보.
   *
   * 예전에는 이런 후보를 전부 버렸다. 그런데 "영업시간을 못 읽었다"는 대부분
   * 가게 문제가 아니라 우리 문제(스크랩 실패·봇 차단)였고, 그 탓에 후보가 모자라
   * 재시도를 반복하며 느려졌다. 이제는 버리지 않고 감점해서 예비로 둔다.
   */
  operationUnverified?: boolean;
  semanticFit?: SemanticFitAssessment;
  referenceUrls?: {
    kakaoMap?: string;
    naverMap?: string;
  };
};


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

/**
 * 거리 기준점도 첫 참여자가 아니라 전체 무게중심이다.
 * 그래야 여러 명이 모일 때 "중간에서 가까운 곳"이 실제로 가깝게 평가된다.
 */
const toDistanceFromUserLocation = (seed: LocalSeed, userInput: UserInput): number | undefined => {
  const center = toSearchCenter(userInput);
  if (!center) return undefined;

  return toDistanceMeters(center, { lat: seed.latitude, lng: seed.longitude });
};
