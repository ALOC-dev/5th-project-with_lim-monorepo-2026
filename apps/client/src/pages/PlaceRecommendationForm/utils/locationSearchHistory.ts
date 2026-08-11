import { z } from "zod";

const LOCATION_SEARCH_HISTORY_STORAGE_KEY = "aloc:recommendation-form:location-search-history";
const LOCATION_SEARCH_HISTORY_CHANGE_EVENT = "aloc:location-search-history-change";
const LOCATION_SEARCH_HISTORY_LIMIT = 30;

const historyLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  placeName: z.string().trim().min(1).optional(),
  roadNameAddress: z.string().trim().min(1),
});

const historyQueryItemSchema = z.object({
  type: z.literal("query"),
  query: z.string().trim().min(1),
});

const historyLocationItemSchema = z.object({
  type: z.literal("location"),
  location: historyLocationSchema,
});

const historyItemSchema = z.discriminatedUnion("type", [
  historyQueryItemSchema,
  historyLocationItemSchema,
]);

const historyListSchema = z.array(historyItemSchema);

export type LocationSearchHistoryItem = z.infer<typeof historyItemSchema>;

type LocationSearchHistoryStorageOptions = {
  readonly key?: string;
  readonly limit?: number;
  readonly getStorage?: () => Storage | null;
};

export class LocationSearchHistoryStorage {
  private readonly key: string;
  private readonly limit: number;
  private readonly getStorage: () => Storage | null;

  constructor({
    key = LOCATION_SEARCH_HISTORY_STORAGE_KEY,
    limit = LOCATION_SEARCH_HISTORY_LIMIT,
    getStorage = getBrowserLocalStorage,
  }: LocationSearchHistoryStorageOptions = {}) {
    this.key = key;
    this.limit = limit;
    this.getStorage = getStorage;
  }

  getHistory = (): readonly LocationSearchHistoryItem[] => {
    const storage = this.getStorage();

    if (!storage) {
      return [];
    }

    const rawHistory = readStoredValue(storage, this.key);

    if (!rawHistory) {
      return [];
    }

    const parsedHistory = parseStoredJson(rawHistory);

    if (!parsedHistory.ok) {
      this.clear();
      return [];
    }

    const history = historyListSchema.safeParse(parsedHistory.value);

    if (!history.success) {
      this.clear();
      return [];
    }

    return history.data.slice(0, this.limit);
  };

  insert = (item: LocationSearchHistoryItem): readonly LocationSearchHistoryItem[] => {
    const normalizedItem = normalizeHistoryItem(item);

    if (!normalizedItem) {
      return this.getHistory();
    }

    const nextHistory = [
      normalizedItem,
      ...this.getHistory().filter((historyItem) => !isSameHistoryItem(historyItem, normalizedItem)),
    ].slice(0, this.limit);

    this.save(nextHistory);
    return nextHistory;
  };

  promote = (item: LocationSearchHistoryItem): readonly LocationSearchHistoryItem[] => {
    return this.insert(item);
  };

  deleteItem = (item: LocationSearchHistoryItem): readonly LocationSearchHistoryItem[] => {
    const normalizedItem = normalizeHistoryItem(item);

    if (!normalizedItem) {
      return this.getHistory();
    }

    const nextHistory = this.getHistory().filter(
      (historyItem) => !isSameHistoryItem(historyItem, normalizedItem),
    );

    this.save(nextHistory);
    return nextHistory;
  };

  clear = (): readonly LocationSearchHistoryItem[] => {
    const storage = this.getStorage();

    if (!storage) {
      return [];
    }

    removeStoredValue(storage, this.key);
    this.notify();
    return [];
  };

  subscribe = (listener: () => void): (() => void) => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === this.key) {
        listener();
      }
    };

    window.addEventListener(LOCATION_SEARCH_HISTORY_CHANGE_EVENT, listener);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(LOCATION_SEARCH_HISTORY_CHANGE_EVENT, listener);
      window.removeEventListener("storage", handleStorage);
    };
  };

  private save = (history: readonly LocationSearchHistoryItem[]): void => {
    const storage = this.getStorage();

    if (!storage) {
      return;
    }

    writeStoredValue(storage, this.key, JSON.stringify(history));
    this.notify();
  };

  private notify = (): void => {
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(new Event(LOCATION_SEARCH_HISTORY_CHANGE_EVENT));
  };
}

export const locationSearchHistoryStorage = new LocationSearchHistoryStorage();

function getBrowserLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

const normalizeHistoryItem = (
  item: LocationSearchHistoryItem,
): LocationSearchHistoryItem | null => {
  const parsedItem = historyItemSchema.safeParse(item);

  if (!parsedItem.success) {
    return null;
  }

  return parsedItem.data;
};

const isSameHistoryItem = (
  left: LocationSearchHistoryItem,
  right: LocationSearchHistoryItem,
): boolean => {
  return toHistoryItemKey(left) === toHistoryItemKey(right);
};

export const toHistoryItemKey = (item: LocationSearchHistoryItem): string => {
  switch (item.type) {
    case "query":
      return `query:${item.query}`;
    case "location": {
      const { lat, lng, placeName, roadNameAddress } = item.location;

      return `location:${lat}:${lng}:${roadNameAddress}:${placeName ?? ""}`;
    }
  }
};

type JsonParseResult =
  | {
      readonly ok: true;
      readonly value: unknown;
    }
  | {
      readonly ok: false;
    };

const parseStoredJson = (rawValue: string): JsonParseResult => {
  try {
    return {
      ok: true,
      value: JSON.parse(rawValue),
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
      };
    }

    throw error;
  }
};

const readStoredValue = (storage: Storage, key: string): string | null => {
  try {
    return storage.getItem(key);
  } catch (error) {
    if (error instanceof DOMException) {
      return null;
    }

    throw error;
  }
};

const writeStoredValue = (storage: Storage, key: string, value: string): void => {
  try {
    storage.setItem(key, value);
  } catch (error) {
    if (error instanceof DOMException) {
      return;
    }

    throw error;
  }
};

const removeStoredValue = (storage: Storage, key: string): void => {
  try {
    storage.removeItem(key);
  } catch (error) {
    if (error instanceof DOMException) {
      return;
    }

    throw error;
  }
};
