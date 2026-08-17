import { createContext, useContext } from "react";

export type BookmarkedPlaceItem = {
  readonly id: string;
  readonly historyId: string | null;
  readonly placeId: string;
  readonly date: string;
  readonly title: string;
  readonly category: string;
  readonly score: number;
  readonly tags: readonly string[];
  readonly isBookmarked: boolean;
};

export type BookmarkedPlacesContextType = {
  readonly bookmarkList: readonly BookmarkedPlaceItem[];
  readonly isLoading: boolean;
  readonly isListError: boolean;
  readonly isBookmarking: boolean;
  readonly bookmarkErrorMessage: string | null;
  readonly handleToggleBookmark: (id: string) => void;
  readonly handleRetry: () => void;
  readonly handleGoToPlaceRecommendationHistory: () => void;
};

export const BookmarkedPlacesContext = createContext<BookmarkedPlacesContextType | null>(null);

export const useBookmarkedPlaces = () => {
  const context = useContext(BookmarkedPlacesContext);
  if (!context) {
    throw new Error("useBookmarkedPlaces must be used within BookmarkedPlacesProvider");
  }
  return context;
};
