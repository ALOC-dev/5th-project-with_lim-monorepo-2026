import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { CustomOverlayMap, Map } from "react-kakao-maps-sdk";

import {
  type PlaceRecommendationResultMapCenter,
  type PlaceRecommendationResultPlace,
  usePlaceRecommendationResultUiContext,
} from "../state/PlaceRecommendationResult.ui.context";
import {
  getFocusedPlaceCenterPoint,
  getFocusedPlacePanY,
  getRecommendationBoundsPadding,
} from "./PlaceRecommendationResultMap.data";
import { S } from "./PlaceRecommendationResultMap.styled";

const SINGLE_PLACE_MAP_LEVEL = 4;

type PlaceRecommendationResultMapProps = {
  readonly focusRequest: {
    readonly placeId: string;
    readonly sequence: number;
  } | null;
  readonly onPlaceSelect: (placeId: string) => void;
};

const PlaceRecommendationResultMap = ({
  focusRequest,
  onPlaceSelect,
}: PlaceRecommendationResultMapProps) => {
  const { mapCenter, mapZoom, places, selectedPlaceId, setMapCenter, setMapZoom } =
    usePlaceRecommendationResultUiContext();
  const [map, setMap] = useState<kakao.maps.Map | null>(null);

  const syncMapState = useCallback(
    (targetMap: kakao.maps.Map) => {
      const center = targetMap.getCenter();
      setMapCenter({
        lat: center.getLat(),
        lng: center.getLng(),
      });
      setMapZoom(targetMap.getLevel());
    },
    [setMapCenter, setMapZoom],
  );

  const fitMapToPlaces = useCallback(
    (targetMap: kakao.maps.Map) => {
      fitRecommendationPlaces(targetMap, places);
    },
    [places],
  );

  const handleCreate = useCallback(
    (createdMap: kakao.maps.Map) => {
      setMap(createdMap);
      fitMapToPlaces(createdMap);
    },
    [fitMapToPlaces],
  );

  useEffect(() => {
    if (map === null) {
      return;
    }

    fitMapToPlaces(map);
  }, [fitMapToPlaces, map]);

  useLayoutEffect(() => {
    if (focusRequest === null || map === null) return;

    const place = places.find((candidate) => candidate.id === focusRequest.placeId);
    if (place === undefined) return;

    panMapToFocusedPlace(map, place.location);
  }, [focusRequest, map, places]);

  return (
    <S.MapLayer>
      <Map
        center={mapCenter}
        isPanto
        level={mapZoom}
        onCreate={handleCreate}
        onIdle={syncMapState}
        style={{ height: "100%", width: "100%" }}
      >
        {places.map((place) => (
          <CustomOverlayMap
            key={place.id}
            clickable
            position={place.location}
            xAnchor={0.5}
            yAnchor={0.5}
            zIndex={selectedPlaceId === place.id ? 2 : 1}
          >
            <S.MarkerButton
              $isSelected={selectedPlaceId === place.id}
              type="button"
              onClick={() => onPlaceSelect(place.id)}
              aria-label={`${place.rank}번째 추천 장소 ${place.name} 선택`}
            >
              {place.rank}
            </S.MarkerButton>
          </CustomOverlayMap>
        ))}
      </Map>
    </S.MapLayer>
  );
};

const fitRecommendationPlaces = (
  map: kakao.maps.Map,
  places: readonly PlaceRecommendationResultPlace[],
) => {
  if (places.length === 1) {
    const place = places[0];

    if (place === undefined) {
      return;
    }

    map.setCenter(toKakaoLatLng(place.location));
    map.setLevel(SINGLE_PLACE_MAP_LEVEL);
    panMapToFocusedPlace(map, place.location);
    return;
  }

  const bounds = new kakao.maps.LatLngBounds();
  places.forEach((place) => {
    bounds.extend(toKakaoLatLng(place.location));
  });
  const padding = getRecommendationBoundsPadding(getMapViewportMeasurement(map));
  map.setBounds(bounds, padding.top, padding.right, padding.bottom, padding.left);
};

const getMapViewportMeasurement = (map: kakao.maps.Map) => {
  const mapRect = map.getNode().getBoundingClientRect();

  return {
    mapBottom: mapRect.bottom,
    mapHeight: mapRect.height,
    viewportHeight: window.innerHeight,
  };
};

const panMapToFocusedPlace = (
  map: kakao.maps.Map,
  location: PlaceRecommendationResultMapCenter,
) => {
  const targetLocation = toKakaoLatLng(location);
  const projection = map.getProjection();
  const targetPoint = projection.containerPointFromCoords(targetLocation);
  const panY = getFocusedPlacePanY(getMapViewportMeasurement(map));
  const centerPoint = getFocusedPlaceCenterPoint(targetPoint, panY);
  const targetCenter = projection.coordsFromContainerPoint(
    new kakao.maps.Point(centerPoint.x, centerPoint.y),
  );

  map.panTo(targetCenter);
};

const toKakaoLatLng = ({ lat, lng }: PlaceRecommendationResultMapCenter) => {
  return new kakao.maps.LatLng(lat, lng);
};

export default PlaceRecommendationResultMap;
