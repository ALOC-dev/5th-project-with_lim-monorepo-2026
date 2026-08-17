import {
  type PlaceRecommendationItem,
  PlaceRecommendationItemSchema,
} from "@monorepo/recommendation-engine/v1/contracts";

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

const UNKNOWN_LABEL = "분류 미확인";
const UNKNOWN_ADDRESS = "주소 정보 미확인";
const UNKNOWN_PRICE_RANGE = [0, 0] as const;

export type LegacyFavoritePlaceForMigration = {
  readonly id: string;
  readonly kakaoPlaceId: string;
  readonly name: string;
  readonly address: string | null;
  readonly lat: string | number;
  readonly lng: string | number;
  readonly category: string | null;
  readonly createdAt: Date;
};

export type ExistingSavedPlaceForMigration = {
  readonly placeData: unknown;
};

export type LegacySavedPlaceMigration = {
  readonly legacyFavoriteId: string;
  readonly canonicalKakaoPlaceId: string;
  readonly placeData: PlaceRecommendationItem;
  readonly createdAt: Date;
};

export type LegacySavedPlaceMigrationSkip = {
  readonly legacyFavoriteId: string;
  readonly reason: "INVALID_KAKAO_PLACE_ID" | "INVALID_COORDINATES" | "INVALID_SNAPSHOT";
};

export type LegacySavedPlaceMigrationPlan = {
  readonly migrations: readonly LegacySavedPlaceMigration[];
  readonly skipped: readonly LegacySavedPlaceMigrationSkip[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * `priceRangeSource` was added after saved-place snapshots had already been
 * persisted. Treat old snapshots as category estimates until they are replaced
 * by a newly generated recommendation.
 */
export const normalizeSavedPlaceSnapshot = (
  placeData: unknown,
): PlaceRecommendationItem | null => {
  const current = PlaceRecommendationItemSchema.safeParse(placeData);
  if (current.success) return current.data;

  if (!isRecord(placeData) || "priceRangeSource" in placeData) return null;

  const compatible = PlaceRecommendationItemSchema.safeParse({
    ...placeData,
    priceRangeSource: "CATEGORY_ESTIMATE",
  });
  return compatible.success ? compatible.data : null;
};

const canonicalDigits = (value: string): string | null => {
  if (!/^\d+$/u.test(value)) return null;
  const withoutLeadingZeros = value.replace(/^0+(?=\d)/u, "");
  return withoutLeadingZeros === "0" ? null : withoutLeadingZeros;
};

/**
 * Kakao Local IDs are decimal identifiers. Historical rows occasionally stored the
 * provider prefix or the exact Kakao map URL, so normalize all three representations.
 */
export const canonicalizeKakaoPlaceId = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const direct = canonicalDigits(trimmed);
  if (direct) return direct;

  const prefixed = /^kakao:(\d+)$/iu.exec(trimmed);
  if (prefixed?.[1]) return canonicalDigits(prefixed[1]);

  const mapUrl = /(?:https?:\/\/)?place\.map\.kakao\.com\/(\d+)(?:[/?#]|$)/iu.exec(trimmed);
  return mapUrl?.[1] ? canonicalDigits(mapUrl[1]) : null;
};

const kakaoIdFromSavedPlace = (placeData: unknown): string | null => {
  const parsed = normalizeSavedPlaceSnapshot(placeData);
  if (parsed) {
    const fromUrl = parsed.referenceUrls.kakaoMap
      ? canonicalizeKakaoPlaceId(parsed.referenceUrls.kakaoMap)
      : null;
    return fromUrl ?? canonicalizeKakaoPlaceId(parsed.id);
  }

  // An older saved snapshot may no longer satisfy the current schema. Read only its
  // identity-shaped fields so the compatibility pass still avoids inserting a duplicate.
  if (!placeData || typeof placeData !== "object") return null;
  const raw = placeData as {
    readonly id?: unknown;
    readonly referenceUrls?: { readonly kakaoMap?: unknown };
  };
  const rawUrl = raw.referenceUrls?.kakaoMap;
  if (typeof rawUrl === "string") {
    const fromUrl = canonicalizeKakaoPlaceId(rawUrl);
    if (fromUrl) return fromUrl;
  }
  return typeof raw.id === "string" ? canonicalizeKakaoPlaceId(raw.id) : null;
};

const unknownOperationInfo = (): PlaceRecommendationItem["operationInfo"] => ({
  timezone: "Asia/Seoul",
  schedules: Object.fromEntries(
    DAYS.map((day) => [day, { status: "UNKNOWN" }]),
  ) as PlaceRecommendationItem["operationInfo"]["schedules"],
});

const categoryLabels = (category: string | null): { readonly main: string; readonly sub: string } => {
  const labels = (category ?? "")
    .split(">")
    .map((label) => label.trim())
    .filter(Boolean);
  return {
    main: labels[0] ?? UNKNOWN_LABEL,
    sub: (labels.at(-1) ?? UNKNOWN_LABEL).slice(0, 20),
  };
};

const toFiniteCoordinate = (value: string | number, min: number, max: number): number | null => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
};

export const toSeoulMigrationSchedule = (
  now: Date,
): { readonly date: string; readonly startTime: string } => {
  // Korea has no daylight-saving transition. Shifting to KST before ISO slicing is
  // deterministic and avoids depending on the host process timezone.
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000).toISOString();
  return { date: kst.slice(0, 10), startTime: kst.slice(11, 16) };
};

const toLegacySavedPlaceSnapshot = (
  favorite: LegacyFavoritePlaceForMigration,
  canonicalKakaoPlaceId: string,
  schedule: { readonly date: string; readonly startTime: string },
): PlaceRecommendationItem | null => {
  const lat = toFiniteCoordinate(favorite.lat, -90, 90);
  const lng = toFiniteCoordinate(favorite.lng, -180, 180);
  if (lat === null || lng === null) return null;

  const name = favorite.name.trim();
  if (name.length === 0) return null;
  const category = categoryLabels(favorite.category);
  const parsed = PlaceRecommendationItemSchema.safeParse({
    id: `kakao:${canonicalKakaoPlaceId}`,
    name,
    phoneNumber: null,
    tags: [category.sub],
    contentSummary: `${name} · 이전 즐겨찾기에서 옮긴 장소(영업시간·가격 미확인)`.slice(0, 140),
    mainCategory: category.main,
    subCategory: category.sub,
    operationInfo: unknownOperationInfo(),
    availabilityAtRequestedTime: {
      status: "UNKNOWN",
      requestedDateISO: schedule.date,
      requestedTime24h: schedule.startTime,
      stayDurationMinutes: 60,
      reason: "이전 즐겨찾기에는 영업시간 정보가 없어 방문 가능 여부를 확인하지 못했어요.",
    },
    referenceUrls: {
      kakaoMap: `https://place.map.kakao.com/${canonicalKakaoPlaceId}`,
    },
    accessibility: { score: 50, perOrigin: [] },
    location: {
      lat,
      lng,
      placeName: name,
      roadAddressKo: favorite.address?.trim() || UNKNOWN_ADDRESS,
    },
    // The legacy table has no price evidence. The current engine snapshot schema has
    // no quality field, so [0, 0] is the compatibility sentinel for an unknown price.
    priceRangePerPerson: UNKNOWN_PRICE_RANGE,
    priceRangeSource: "CATEGORY_ESTIMATE",
    score: 50,
    scoreBreakdown: {
      inputMatch: 50,
      trust: 50,
      accessibility: 50,
      diversity: 50,
      total: 50,
    },
    reasons: ["사용자가 이전에 저장한 장소예요.", "영업시간과 가격은 확인되지 않았어요."],
  });
  return parsed.success ? parsed.data : null;
};

export const planLegacySavedPlaceMigrations = (
  favorites: readonly LegacyFavoritePlaceForMigration[],
  existingSavedPlaces: readonly ExistingSavedPlaceForMigration[],
  schedule: { readonly date: string; readonly startTime: string },
): LegacySavedPlaceMigrationPlan => {
  const claimedKakaoIds = new Set(
    existingSavedPlaces
      .map((savedPlace) => kakaoIdFromSavedPlace(savedPlace.placeData))
      .filter((id): id is string => id !== null),
  );
  const migrations: LegacySavedPlaceMigration[] = [];
  const skipped: LegacySavedPlaceMigrationSkip[] = [];

  for (const favorite of favorites) {
    const canonicalKakaoPlaceId = canonicalizeKakaoPlaceId(favorite.kakaoPlaceId);
    if (!canonicalKakaoPlaceId) {
      skipped.push({ legacyFavoriteId: favorite.id, reason: "INVALID_KAKAO_PLACE_ID" });
      continue;
    }
    if (claimedKakaoIds.has(canonicalKakaoPlaceId)) continue;

    const lat = toFiniteCoordinate(favorite.lat, -90, 90);
    const lng = toFiniteCoordinate(favorite.lng, -180, 180);
    if (lat === null || lng === null) {
      skipped.push({ legacyFavoriteId: favorite.id, reason: "INVALID_COORDINATES" });
      continue;
    }

    const placeData = toLegacySavedPlaceSnapshot(favorite, canonicalKakaoPlaceId, schedule);
    if (!placeData) {
      skipped.push({ legacyFavoriteId: favorite.id, reason: "INVALID_SNAPSHOT" });
      continue;
    }

    claimedKakaoIds.add(canonicalKakaoPlaceId);
    migrations.push({
      legacyFavoriteId: favorite.id,
      canonicalKakaoPlaceId,
      placeData,
      createdAt: favorite.createdAt,
    });
  }

  return { migrations, skipped };
};
