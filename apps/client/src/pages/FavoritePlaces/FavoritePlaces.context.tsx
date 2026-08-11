import { createContext, useContext } from "react";

export type FavoritePlaceItem = {
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly category: string;
  readonly score: number;
  readonly tags: readonly string[];
};

export type FavoritePlacesContextType = {
  readonly favoriteList: readonly FavoritePlaceItem[];
  readonly isLoading: boolean;
  readonly isListError: boolean;
  readonly isDeleting: boolean;
  readonly deleteErrorMessage: string | null;
  readonly handleToggleFavorite: (id: string) => void;
  readonly handleRetry: () => void;
  readonly handleGoToPlaceRecommendationHistory: () => void;
};

export const FavoritePlacesContext = createContext<FavoritePlacesContextType | null>(null);

export const useFavoritePlaces = () => {
  const context = useContext(FavoritePlacesContext);
  if (!context) {
    throw new Error("useFavoritePlaces must be used within FavoritePlacesProvider");
  }
  return context;
};
