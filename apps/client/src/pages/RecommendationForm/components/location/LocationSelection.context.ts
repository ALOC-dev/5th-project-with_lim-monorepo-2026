import { createContext, useContext } from "react";

import type { RecommendationFormLocation } from "../../RecommendationForm.context";

export type Location = RecommendationFormLocation;

export type LocationSelectionMode = "map" | "search";

type LocationSelectionContextType = {
  readonly mode: LocationSelectionMode;
  readonly searchQuery: string;
  readonly openMapMode: () => void;
  readonly openSearchMode: () => void;
  readonly setSearchQuery: (query: string) => void;
};

export const LocationSelectionContext = createContext<LocationSelectionContextType | null>(null);

export const useLocationSelection = () => {
  const context = useContext(LocationSelectionContext);
  if (!context) {
    throw new Error("useLocationSelection must be used within LocationSelectionBottomSheet");
  }

  return context;
};
