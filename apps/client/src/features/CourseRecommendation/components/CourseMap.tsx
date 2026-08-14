import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomOverlayMap, Map, Polyline } from "react-kakao-maps-sdk";

import { tokens } from "../../../design-system/tokens.generated";
import type { CourseOption } from "../course.types";
import { getCourseMapPoints, getCourseRoutePath } from "../courseMap";
import { S } from "./CourseMap.styled";

const COURSE_SINGLE_POINT_MAP_LEVEL = 4;
const COURSE_MAP_BOUNDS_PADDING = { bottom: 32, left: 32, right: 32, top: 32 } as const;

type CourseMapProps = {
  readonly option: CourseOption;
  readonly height?: string;
};

export const CourseMap = ({ option, height }: CourseMapProps) => {
  const routePath = useMemo(() => getCourseRoutePath(option), [option]);
  const mapPoints = useMemo(() => getCourseMapPoints(option), [option]);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const center = mapPoints[0];
  const fitMapToRoute = useCallback(
    (targetMap: kakao.maps.Map) => {
      if (mapPoints.length === 0) return;
      if (mapPoints.length === 1) {
        const point = mapPoints[0];
        if (!point) return;
        targetMap.setCenter(new kakao.maps.LatLng(point.lat, point.lng));
        targetMap.setLevel(COURSE_SINGLE_POINT_MAP_LEVEL);
        return;
      }
      const bounds = new kakao.maps.LatLngBounds();
      mapPoints.forEach(({ lat, lng }) => bounds.extend(new kakao.maps.LatLng(lat, lng)));
      targetMap.setBounds(
        bounds,
        COURSE_MAP_BOUNDS_PADDING.top,
        COURSE_MAP_BOUNDS_PADDING.right,
        COURSE_MAP_BOUNDS_PADDING.bottom,
        COURSE_MAP_BOUNDS_PADDING.left,
      );
    },
    [mapPoints],
  );
  const handleMapCreate = useCallback(
    (createdMap: kakao.maps.Map) => {
      setMap(createdMap);
      fitMapToRoute(createdMap);
    },
    [fitMapToRoute],
  );

  useEffect(() => {
    if (map) fitMapToRoute(map);
  }, [fitMapToRoute, map]);

  if (!center) return <S.MapFallback>표시할 장소가 없어요.</S.MapFallback>;
  return (
    <S.Map $height={height}>
      <Map
        center={{ lat: center.lat, lng: center.lng }}
        level={5}
        onCreate={handleMapCreate}
        style={{ height: "100%", width: "100%" }}
      >
        {routePath.length >= 2 ? (
          <Polyline
            path={routePath.map(({ lat, lng }) => ({ lat, lng }))}
            strokeColor={tokens.color.primary[500]}
            strokeOpacity={0.8}
            strokeStyle="solid"
            strokeWeight={4}
          />
        ) : null}
        {option.stops.map((stop, index) => (
          <CustomOverlayMap
            key={stop.id}
            position={{ lat: stop.lat, lng: stop.lng }}
            xAnchor={0.5}
            yAnchor={0.5}
          >
            <S.Marker aria-label={`${index + 1}번째 장소 ${stop.name}`} role="img">
              {index + 1}
            </S.Marker>
          </CustomOverlayMap>
        ))}
      </Map>
    </S.Map>
  );
};
