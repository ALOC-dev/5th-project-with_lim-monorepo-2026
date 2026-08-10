import { createContext, useContext } from "react";

export type FavoritePlaceItem = {
  id: string;
  date: string;
  title: string;
  category: string;
  score: number;
  tags: string[];
};

export type FavoritePlacesContextType = {
  readonly favoriteList: FavoritePlaceItem[];
  readonly isLoading: boolean;
  readonly handleToggleFavorite: (id: string) => void;
  readonly handleGoToRecommendations: () => void;
};

export const FavoritePlacesContext = createContext<FavoritePlacesContextType | null>(null);

export const useFavoritePlaces = () => {
  const context = useContext(FavoritePlacesContext);
  if (!context) {
    throw new Error("useFavoritePlaces must be used within FavoritePlacesProvider");
  }
  return context;
};
