import { useEffect, useRef, useState } from "react";
import { Map, MapMarker } from "react-kakao-maps-sdk";

import { resolveSelectedLocation, type ReverseGeocodeCoordinates } from "../../../../../apis/kakao";
import { Button } from "../../../../../components/Button";
import {
  useRecommendationFormInput,
  useRecommendationFormUi,
} from "../../../RecommendationForm.context";
import { S } from "./MapModeContent.styled";

type AddressRequestStatus = "loading" | "resolved" | "failed";

const CENTER_CHANGE_THRESHOLD = 0.000001;

const MapModeContent = () => {
  const { location, setLocation } = useRecommendationFormInput();
  const { closeSheet } = useRecommendationFormUi();
  const [addressRequestStatus, setAddressRequestStatus] =
    useState<AddressRequestStatus>("resolved");
  const latestReverseGeocodeRequestIdRef = useRef(0);
  const latestReverseGeocodeCoordinatesRef = useRef<ReverseGeocodeCoordinates>({
    lat: location.lat,
    lng: location.lng,
  });

  useEffect(() => {
    latestReverseGeocodeCoordinatesRef.current = {
      lat: location.lat,
      lng: location.lng,
    };
  }, [location.lat, location.lng]);

  const updateAddressFromMapCenter = async (map: kakao.maps.Map) => {
    const coordinates = getMapCenterCoordinates(map);

    if (isSameCoordinates(coordinates, latestReverseGeocodeCoordinatesRef.current)) {
      return;
    }

    const requestId = latestReverseGeocodeRequestIdRef.current + 1;
    latestReverseGeocodeRequestIdRef.current = requestId;
    latestReverseGeocodeCoordinatesRef.current = coordinates;

    setAddressRequestStatus("loading");
    setLocation((currentLocation) => ({
      ...currentLocation,
      lat: coordinates.lat,
      lng: coordinates.lng,
    }));

    const result = await resolveSelectedLocation(coordinates);

    if (latestReverseGeocodeRequestIdRef.current !== requestId) {
      return;
    }

    switch (result.kind) {
      case "place":
        setLocation({
          lat: coordinates.lat,
          lng: coordinates.lng,
          placeName: result.placeName,
          roadNameAddress: result.roadNameAddress,
        });
        setAddressRequestStatus("resolved");
        return;
      case "address":
        setLocation({
          lat: coordinates.lat,
          lng: coordinates.lng,
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
          placeName: location.placeName,
          roadNameAddress: location.roadNameAddress,
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
        return true;
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
      closeSheet();
    }
  };

  return (
    <S.Wrapper>
      <S.MapFrame>
        <Map
          style={{ width: "100%", height: "100%" }}
          onIdle={updateAddressFromMapCenter}
          center={location}
          minLevel={10}
          maxLevel={3}
        >
          <MapMarker position={location} />
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
