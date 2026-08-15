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
  readonly requestCurrentLocation: () => Promise<LocationCoordinates | null>;
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
  const [mode, setMode] = useState<LocationSelectionMode>("map");
  const [query, setQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates | null>(null);
  const currentLocationRequestOpenedRef = useRef(false);
  const currentLocationRequestRef = useRef<Promise<LocationCoordinates | null> | null>(null);

  const requestCurrentLocation = useCallback((): Promise<LocationCoordinates | null> => {
    if (currentLocation) {
      return Promise.resolve(currentLocation);
    }

    if (!navigator.geolocation) {
      return Promise.resolve(null);
    }

    if (currentLocationRequestRef.current) {
      return currentLocationRequestRef.current;
    }

    const request = new Promise<LocationCoordinates | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const location = {
            lat: coords.latitude,
            lng: coords.longitude,
          };

          setCurrentLocation(location);
          resolve(location);
        },
        () => resolve(null),
        {
          enableHighAccuracy: true,
          maximumAge: 60_000,
          timeout: 10_000,
        },
      );
    });

    currentLocationRequestRef.current = request;
    void request.finally(() => {
      if (currentLocationRequestRef.current === request) {
        currentLocationRequestRef.current = null;
      }
    });

    return request;
  }, [currentLocation]);

  useEffect(() => {
    if (!isLocationSheetOpen) {
      currentLocationRequestOpenedRef.current = false;
      return;
    }

    if (currentLocation || currentLocationRequestOpenedRef.current) {
      return;
    }

    currentLocationRequestOpenedRef.current = true;
    void requestCurrentLocation();
  }, [currentLocation, isLocationSheetOpen, requestCurrentLocation]);

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
      requestCurrentLocation,
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
      requestCurrentLocation,
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
