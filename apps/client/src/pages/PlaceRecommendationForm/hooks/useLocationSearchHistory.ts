import { useCallback, useEffect, useState } from "react";

import {
  type LocationSearchHistoryItem,
  locationSearchHistoryStorage,
} from "../utils/locationSearchHistory";

export const useLocationSearchHistory = () => {
  const [items, setItems] = useState(locationSearchHistoryStorage.getHistory);

  useEffect(() => {
    return locationSearchHistoryStorage.subscribe(() => {
      setItems(locationSearchHistoryStorage.getHistory());
    });
  }, []);

  const insertItem = useCallback((item: LocationSearchHistoryItem) => {
    locationSearchHistoryStorage.insert(item);
  }, []);

  const promoteItem = useCallback((item: LocationSearchHistoryItem) => {
    locationSearchHistoryStorage.promote(item);
  }, []);

  const deleteItem = useCallback((item: LocationSearchHistoryItem) => {
    locationSearchHistoryStorage.deleteItem(item);
  }, []);

  return {
    items,
    insertItem,
    promoteItem,
    deleteItem,
  };
};
