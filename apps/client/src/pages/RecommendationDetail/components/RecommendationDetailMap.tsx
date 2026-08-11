import { useCallback, useEffect, useState } from "react";
import { CustomOverlayMap, Map } from "react-kakao-maps-sdk";

import {
  type RecommendationDetailMapCenter,
  type RecommendationDetailPlace,
  useRecommendationDetailUiContext,
} from "../state/RecommendationDetail.ui.context";
import { S } from "./RecommendationDetailMap.styled";

const SINGLE_PLACE_MAP_LEVEL = 4;
const FIT_BOUNDS_PADDING = {
  bottom: 480,
  left: 48,
  right: 48,
  top: 80,
} as const;

const RecommendationDetailMap = () => {
  const { mapCenter, mapZoom, places, selectPlace, selectedPlaceId, setMapCenter, setMapZoom } =
    useRecommendationDetailUiContext();
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
      syncMapState(targetMap);
    },
    [places, syncMapState],
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
              onClick={() => selectPlace(place.id)}
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
  places: readonly RecommendationDetailPlace[],
) => {
  if (places.length === 1) {
    const place = places[0];

    if (place === undefined) {
      return;
    }

    map.setCenter(toKakaoLatLng(place.location));
    map.setLevel(SINGLE_PLACE_MAP_LEVEL);
    return;
  }

  const bounds = new kakao.maps.LatLngBounds();
  places.forEach((place) => {
    bounds.extend(toKakaoLatLng(place.location));
  });
  map.setBounds(
    bounds,
    FIT_BOUNDS_PADDING.top,
    FIT_BOUNDS_PADDING.right,
    FIT_BOUNDS_PADDING.bottom,
    FIT_BOUNDS_PADDING.left,
  );
};

const toKakaoLatLng = ({ lat, lng }: RecommendationDetailMapCenter) => {
  return new kakao.maps.LatLng(lat, lng);
};

export default RecommendationDetailMap;
