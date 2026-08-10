import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  type FavoritePlaceItem,
  FavoritePlacesContext,
  type FavoritePlacesContextType,
} from "./FavoritePlaces.context";
import FavoritePlacesContent from "./FavoritePlacesForm";

export const FavoritePlacesProvider = ({ children }: { readonly children: ReactNode }) => {
  const navigate = useNavigate();
  const [favoriteList, setFavoriteList] = useState<FavoritePlaceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMockData = () => {
      const mockData: FavoritePlaceItem[] = [
        {
          id: "place_1",
          date: "2026.07.17",
          title: "도시정원 다이닝",
          category: "식당 · 이탈리안",
          score: 92,
          tags: ["분위기", "예약가능"],
        },
        {
          id: "place_2",
          date: "2026.07.17",
          title: "도시정원 다이닝",
          category: "식당 · 이탈리안",
          score: 92,
          tags: ["분위기", "예약가능"],
        },
        {
          id: "place_3",
          date: "2026.07.17",
          title: "도시정원 다이닝",
          category: "식당 · 이탈리안",
          score: 92,
          tags: ["분위기", "예약가능"],
        },
      ];

      setTimeout(() => {
        setFavoriteList(mockData);
        setIsLoading(false);
      }, 1500);
    };

    void fetchMockData();
  }, []);

  // 찜 삭제
  const handleToggleFavorite = useCallback((id: string) => {
    setFavoriteList((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // 빈 화면에서 추천 받으러 가기
  const handleGoToRecommendations = useCallback(() => {
    void navigate("/place/recommendation/form");
  }, [navigate]);

  const contextValue = useMemo<FavoritePlacesContextType>(
    () => ({
      favoriteList,
      isLoading,
      handleToggleFavorite,
      handleGoToRecommendations,
    }),
    [favoriteList, isLoading, handleToggleFavorite, handleGoToRecommendations],
  );

  return (
    <FavoritePlacesContext.Provider value={contextValue}>{children}</FavoritePlacesContext.Provider>
  );
};

export default function FavoritePlacesPage() {
  return (
    <FavoritePlacesProvider>
      <FavoritePlacesContent />
    </FavoritePlacesProvider>
  );
}
