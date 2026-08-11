import { useEffect, useRef, useState } from "react";
import { Map, MapMarker } from "react-kakao-maps-sdk";

import { resolveSelectedLocation, type ReverseGeocodeCoordinates } from "../../../../../apis/kakao";
import { Button } from "../../../../../components/Button";
import {
  usePlaceRecommendationFormInput,
  usePlaceRecommendationFormUi,
} from "../../../PlaceRecommendationForm.context";
import { S } from "./MapModeContent.styled";

type AddressRequestStatus = "loading" | "resolved" | "failed";

const CENTER_CHANGE_THRESHOLD = 0.000001;

const MapModeContent = () => {
  const { locations, setLocations } = usePlaceRecommendationFormInput();
  const { closeSheet } = usePlaceRecommendationFormUi();
  const [addressRequestStatus, setAddressRequestStatus] =
    useState<AddressRequestStatus>("resolved");

  // 초기 지도의 중심 좌표 계산
  const lastLocation = locations[locations.length - 1];
  const initialLat = lastLocation?.lat ?? 37.5665; // 값이 없으면 서울시청 위도
  const initialLng = lastLocation?.lng ?? 126.978; // 값이 없으면 서울시청 경도

  const [currentSelectedLocation, setCurrentSelectedLocation] = useState({
    lat: initialLat,
    lng: initialLng,
    placeName: "",
    roadNameAddress: "",
  });

  const latestReverseGeocodeRequestIdRef = useRef(0);
  const latestReverseGeocodeCoordinatesRef = useRef<ReverseGeocodeCoordinates>({
    lat: initialLat,
    lng: initialLng,
  });

  useEffect(() => {
    latestReverseGeocodeCoordinatesRef.current = {
      lat: initialLat,
      lng: initialLng,
    };
  }, [initialLat, initialLng]);

  const updateAddressFromMapCenter = async (map: kakao.maps.Map) => {
    const coordinates = getMapCenterCoordinates(map);

    if (isSameCoordinates(coordinates, latestReverseGeocodeCoordinatesRef.current)) {
      return;
    }

    const requestId = latestReverseGeocodeRequestIdRef.current + 1;
    latestReverseGeocodeRequestIdRef.current = requestId;
    latestReverseGeocodeCoordinatesRef.current = coordinates;

    setAddressRequestStatus("loading");

    setCurrentSelectedLocation((prev) => ({
      ...prev,
      lat: coordinates.lat,
      lng: coordinates.lng,
    }));

    const result = await resolveSelectedLocation(coordinates);

    if (latestReverseGeocodeRequestIdRef.current !== requestId) {
      return;
    }

    switch (result.kind) {
      case "place":
        setCurrentSelectedLocation({
          lat: coordinates.lat,
          lng: coordinates.lng,
          placeName: result.placeName,
          roadNameAddress: result.roadNameAddress,
        });
        setAddressRequestStatus("resolved");
        return;
      case "address":
        setCurrentSelectedLocation({
          lat: coordinates.lat,
          lng: coordinates.lng,
          placeName: "",
          roadNameAddress: result.roadNameAddress,
        });
        setAddressRequestStatus("resolved");
        return;
      case "failure":
        setAddressRequestStatus("failed");
        return;
      default: {
        const exhaustiveResult: never = result;
        return exhaustiveResult;
      }
    }
  };

  const locationLabel = (() => {
    switch (addressRequestStatus) {
      case "resolved":
        return {
          kind: "resolved",
          placeName: currentSelectedLocation.placeName,
          roadNameAddress: currentSelectedLocation.roadNameAddress,
        } as const;
      case "loading":
        return {
          kind: "status",
          message: "주소 확인 중...",
        } as const;
      case "failed":
        return {
          kind: "status",
          message: "주소를 찾을 수 없어요",
        } as const;
      default: {
        const exhaustiveStatus: never = addressRequestStatus;
        return exhaustiveStatus;
      }
    }
  })();

  const canCompleteSelection = (() => {
    switch (addressRequestStatus) {
      case "resolved":
        return !!currentSelectedLocation.roadNameAddress;
      case "loading":
      case "failed":
        return false;
      default: {
        const exhaustiveStatus: never = addressRequestStatus;
        return exhaustiveStatus;
      }
    }
  })();

  const handleCompleteSelection = () => {
    if (canCompleteSelection) {
      setLocations((prev) => {
        if (prev.length >= 8) {
          alert("출발지는 최대 8개까지만 선택할 수 있습니다.");
          return prev;
        }
        return [...prev, currentSelectedLocation];
      });
      closeSheet();
    }
  };

  return (
    <S.Wrapper>
      <S.MapFrame>
        <Map
          style={{ width: "100%", height: "100%" }}
          onIdle={updateAddressFromMapCenter}
          center={{ lat: currentSelectedLocation.lat, lng: currentSelectedLocation.lng }}
          minLevel={10}
          maxLevel={3}
        >
          <MapMarker
            position={{ lat: currentSelectedLocation.lat, lng: currentSelectedLocation.lng }}
          />
        </Map>
        <S.CenterMarker aria-hidden />
      </S.MapFrame>
      <div>
        {locationLabel.kind === "resolved" ? (
          <div>{formatLocationLabel(locationLabel)}</div>
        ) : (
          <div>{locationLabel.message}</div>
        )}
      </div>
      <Button width="full" disabled={!canCompleteSelection} onClick={handleCompleteSelection}>
        선택 완료
      </Button>
    </S.Wrapper>
  );
};

const getMapCenterCoordinates = (map: kakao.maps.Map): ReverseGeocodeCoordinates => {
  const center = map.getCenter();

  return {
    lat: center.getLat(),
    lng: center.getLng(),
  };
};

const isSameCoordinates = (
  current: ReverseGeocodeCoordinates,
  previous: ReverseGeocodeCoordinates,
): boolean => {
  return (
    Math.abs(current.lat - previous.lat) < CENTER_CHANGE_THRESHOLD &&
    Math.abs(current.lng - previous.lng) < CENTER_CHANGE_THRESHOLD
  );
};

type ResolvedLocationLabel = {
  readonly kind: "resolved";
  readonly placeName?: string;
  readonly roadNameAddress: string;
};

const formatLocationLabel = ({ placeName, roadNameAddress }: ResolvedLocationLabel): string => {
  if (!placeName) {
    return roadNameAddress;
  }

  return `${roadNameAddress} · ${placeName}`;
};

export default MapModeContent;
