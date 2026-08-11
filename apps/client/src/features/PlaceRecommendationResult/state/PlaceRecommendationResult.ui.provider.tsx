import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

import type { PlaceRecommendationResultSuccess } from "./PlaceRecommendationResult.data.context";
import {
  type PlaceRecommendationResultMapCenter,
  type PlaceRecommendationResultPlace,
  PlaceRecommendationResultUiContext,
  type PlaceRecommendationResultUiContextType,
} from "./PlaceRecommendationResult.ui.context";

const DEFAULT_MAP_ZOOM = 10;
const PRICE_FORMATTER = new Intl.NumberFormat("ko-KR");
const DAY_OF_WEEK_LABELS = {
  FRIDAY: "금",
  MONDAY: "월",
  SATURDAY: "토",
  SUNDAY: "일",
  THURSDAY: "목",
  TUESDAY: "화",
  WEDNESDAY: "수",
} as const;

type PlaceRecommendationResultRecommendation =
  PlaceRecommendationResultSuccess["userOutput"]["recommendations"][number];
type PlaceRecommendationResultDayOfWeek =
  keyof PlaceRecommendationResultRecommendation["operationInfo"]["schedules"];
type PlaceRecommendationResultOperationStatus =
  PlaceRecommendationResultRecommendation["operationInfo"]["schedules"][PlaceRecommendationResultDayOfWeek];

class EmptyPlaceRecommendationResultError extends Error {
  constructor() {
    super("PlaceRecommendationResult requires at least one recommendation");
    this.name = "EmptyPlaceRecommendationResultError";
  }
}

const toMapCenter = ({
  lat,
  lng,
}: {
  readonly lat: number;
  readonly lng: number;
}): PlaceRecommendationResultMapCenter => ({
  lat,
  lng,
});

const toAverageRecommendationCenter = (
  places: readonly PlaceRecommendationResultPlace[],
): PlaceRecommendationResultMapCenter => {
  if (places.length === 0) {
    throw new EmptyPlaceRecommendationResultError();
  }

  const coordinateSum = places.reduce(
    (sum, place) => ({
      lat: sum.lat + place.location.lat,
      lng: sum.lng + place.location.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: coordinateSum.lat / places.length,
    lng: coordinateSum.lng / places.length,
  };
};

const toPlaceRecommendationResultPlaces = (
  result: PlaceRecommendationResultSuccess,
): readonly PlaceRecommendationResultPlace[] =>
  result.userOutput.recommendations.map((recommendation, index) => {
    const dayOfWeek = toDayOfWeek(recommendation.availabilityAtRequestedTime.requestedDateISO);
    const operationStatus = recommendation.operationInfo.schedules[dayOfWeek];
    const priceRangeLabel = toPriceRangeLabel(recommendation.priceRangePerPerson);

    return {
      categoryLabel: `${recommendation.mainCategory} · ${recommendation.subCategory}`,
      description: recommendation.contentSummary,
      id: recommendation.id,
      location: toMapCenter(recommendation.location),
      name: recommendation.name,
      phoneNumber: recommendation.phoneNumber,
      priceRangeLabel,
      rank: index + 1,
      referenceUrls: recommendation.referenceUrls,
      roadAddressKo: recommendation.location.roadAddressKo,
      score: recommendation.score,
      subInfo: `${priceRangeLabel} · ${DAY_OF_WEEK_LABELS[dayOfWeek]} ${toOperationHoursLabel(
        operationStatus,
      )}`,
      tags: recommendation.tags,
    } satisfies PlaceRecommendationResultPlace;
  });

const toPlaceRecommendationResultUiModel = (result: PlaceRecommendationResultSuccess) => {
  const places = toPlaceRecommendationResultPlaces(result);

  return {
    initialMapCenter: toAverageRecommendationCenter(places),
    modelKey: toPlaceRecommendationResultUiModelKey(result),
    originContext: result.userOutput.originContext,
    places,
  };
};

type PlaceRecommendationResultUiModel = ReturnType<typeof toPlaceRecommendationResultUiModel>;

const toPlaceRecommendationResultUiModelKey = (
  result: PlaceRecommendationResultSuccess,
): string => {
  const recommendationIds = result.userOutput.recommendations
    .map((recommendation) => recommendation.id)
    .join("|");

  return `${result.userInput.schedule.dateISO}:${result.userInput.schedule.time24h}:${recommendationIds}`;
};

const toPriceRangeLabel = (priceRange: readonly [number, number]): string => {
  return `예상 ${PRICE_FORMATTER.format(priceRange[0])}~${PRICE_FORMATTER.format(priceRange[1])}원`;
};

const toOperationHoursLabel = (
  operationStatus: PlaceRecommendationResultOperationStatus,
): string => {
  switch (operationStatus.status) {
    case "OPEN":
      return `${operationStatus.open}-${operationStatus.close}`;
    case "CLOSED":
      return "휴무";
    case "UNKNOWN":
      return "운영시간 미확인";
    default: {
      const exhaustiveStatus: never = operationStatus;
      return exhaustiveStatus;
    }
  }
};

const toDayOfWeek = (dateISO: string): PlaceRecommendationResultDayOfWeek => {
  const day = new Date(`${dateISO}T00:00:00.000Z`).getUTCDay();

  switch (day) {
    case 0:
      return "SUNDAY";
    case 1:
      return "MONDAY";
    case 2:
      return "TUESDAY";
    case 3:
      return "WEDNESDAY";
    case 4:
      return "THURSDAY";
    case 5:
      return "FRIDAY";
    case 6:
      return "SATURDAY";
    default:
      throw new Error(`Invalid dateISO for recommendation result: ${dateISO}`);
  }
};

export const PlaceRecommendationResultUiProvider = ({
  children,
  result,
}: {
  readonly children: ReactNode;
  readonly result: PlaceRecommendationResultSuccess;
}) => {
  const uiModel = useMemo(() => toPlaceRecommendationResultUiModel(result), [result]);

  return (
    <PlaceRecommendationResultUiStateProvider key={uiModel.modelKey} uiModel={uiModel}>
      {children}
    </PlaceRecommendationResultUiStateProvider>
  );
};

const PlaceRecommendationResultUiStateProvider = ({
  children,
  uiModel,
}: {
  readonly children: ReactNode;
  readonly uiModel: PlaceRecommendationResultUiModel;
}) => {
  const [mapCenter, setMapCenter] = useState<PlaceRecommendationResultMapCenter>(
    uiModel.initialMapCenter,
  );
  const [mapZoom, setMapZoom] = useState(DEFAULT_MAP_ZOOM);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    uiModel.places[0]?.id ?? null,
  );

  const selectedPlace = useMemo(
    () => uiModel.places.find((place) => place.id === selectedPlaceId) ?? null,
    [selectedPlaceId, uiModel.places],
  );

  const selectPlace = useCallback((placeId: string) => {
    setSelectedPlaceId(placeId);
  }, []);

  const clearSelectedPlace = useCallback(() => {
    setSelectedPlaceId(null);
  }, []);

  const contextValue = useMemo<PlaceRecommendationResultUiContextType>(
    () => ({
      clearSelectedPlace,
      mapCenter,
      mapZoom,
      originContext: uiModel.originContext,
      places: uiModel.places,
      selectPlace,
      selectedPlace,
      selectedPlaceId,
      setMapCenter,
      setMapZoom,
    }),
    [
      clearSelectedPlace,
      mapCenter,
      mapZoom,
      selectPlace,
      selectedPlace,
      selectedPlaceId,
      uiModel.originContext,
      uiModel.places,
    ],
  );

  return (
    <PlaceRecommendationResultUiContext.Provider value={contextValue}>
      {children}
    </PlaceRecommendationResultUiContext.Provider>
  );
};
