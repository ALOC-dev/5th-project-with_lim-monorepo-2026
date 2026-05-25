export type LocalSeedSearchParams = {
  query: string;
  pagination?: {
    page?: number;
    count?: number;
  };
  location?: {
    longitude: number;
    latitude: number;
    radiusKm?: number;
  };
};

export type NormalizedLocalSeedSearchParams = {
  query: string;
  page: number;
  count: number;
  location?: {
    longitude: number;
    latitude: number;
    radiusKm: number;
  };
};
