import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, createElement, useCallback, useContext, useMemo, useState } from "react";

import type { RecommendationFormLocation } from "../../RecommendationForm.context";

export type Location = RecommendationFormLocation;

export type LocationSelectionMode = "map" | "search";

type LocationSelectionContextType = {
  readonly mode: LocationSelectionMode;
  readonly setMode: Dispatch<SetStateAction<LocationSelectionMode>>;
  readonly query: string;
  readonly setQuery: Dispatch<SetStateAction<string>>;
  readonly openMapMode: () => void;
  readonly openSearchMode: () => void;
};

export const LocationSelectionContext = createContext<LocationSelectionContextType | null>(null);

export const LocationSelectionProvider = ({ children }: { readonly children: ReactNode }) => {
  const [mode, setMode] = useState<LocationSelectionMode>("map");
  const [query, setQuery] = useState("");

  const openMapMode = useCallback(() => {
    setMode("map");
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
      openMapMode,
      openSearchMode,
    }),
    [mode, openMapMode, openSearchMode, query],
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
