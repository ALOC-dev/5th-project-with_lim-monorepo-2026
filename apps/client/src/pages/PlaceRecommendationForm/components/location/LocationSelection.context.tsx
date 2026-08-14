import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { PlaceRecommendationFormLocation } from "../../PlaceRecommendationForm.context";

export type Location = PlaceRecommendationFormLocation;
export type LocationCoordinates = Pick<Location, "lat" | "lng">;

export type LocationSelectionMode = "map" | "search";

type LocationSelectionContextType = {
  readonly mode: LocationSelectionMode;
  readonly setMode: Dispatch<SetStateAction<LocationSelectionMode>>;
  readonly query: string;
  readonly setQuery: Dispatch<SetStateAction<string>>;
  readonly selectedLocation: Location | null;
  readonly currentLocation: LocationCoordinates | null;
  readonly clearSelectedLocation: () => void;
  readonly openMapMode: () => void;
  readonly openMapModeAtLocation: (location: Location) => void;
  readonly openSearchMode: () => void;
};

export const LocationSelectionContext = createContext<LocationSelectionContextType | null>(null);

export const LocationSelectionProvider = ({
  children,
  isLocationSheetOpen,
}: {
  readonly children: ReactNode;
  readonly isLocationSheetOpen: boolean;
}) => {
  const [mode, setMode] = useState<LocationSelectionMode>("search");
  const [query, setQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates | null>(null);
  const currentLocationRequestOpenedRef = useRef(false);

  useEffect(() => {
    if (!isLocationSheetOpen) {
      currentLocationRequestOpenedRef.current = false;
      return;
    }

    if (currentLocation || !navigator.geolocation || currentLocationRequestOpenedRef.current) {
      return;
    }

    currentLocationRequestOpenedRef.current = true;

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCurrentLocation({
          lat: coords.latitude,
          lng: coords.longitude,
        });
      },
      () => {
        // 권한 거부·조회 실패 시 지도는 기본 중심을 사용한다.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 10_000,
      },
    );
  }, [currentLocation, isLocationSheetOpen]);

  const openMapMode = useCallback(() => {
    setSelectedLocation(null);
    setMode("map");
  }, []);

  const openMapModeAtLocation = useCallback((location: Location) => {
    setSelectedLocation(location);
    setQuery("");
    setMode("map");
  }, []);

  const clearSelectedLocation = useCallback(() => {
    setSelectedLocation(null);
  }, []);

  const openSearchMode = useCallback(() => {
    setMode("search");
  }, []);

  const contextValue = useMemo<LocationSelectionContextType>(
    () => ({
      mode,
      setMode,
      query,
      setQuery,
      selectedLocation,
      currentLocation,
      clearSelectedLocation,
      openMapMode,
      openMapModeAtLocation,
      openSearchMode,
    }),
    [
      clearSelectedLocation,
      currentLocation,
      mode,
      openMapMode,
      openMapModeAtLocation,
      openSearchMode,
      query,
      selectedLocation,
    ],
  );

  return (
    <LocationSelectionContext.Provider value={contextValue}>
      {children}
    </LocationSelectionContext.Provider>
  );
};

export const useLocationSelection = () => {
  const context = useContext(LocationSelectionContext);
  if (!context) {
    throw new Error("useLocationSelection must be used within LocationSelectionProvider");
  }

  return context;
};
