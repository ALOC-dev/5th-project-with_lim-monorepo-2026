import type {
  RecommendationFormInputContextType,
  RecommendationFormLocation,
} from "./RecommendationForm.context";

export const USE_PREDEFINED = true;

type RecommendationFormInitialValues = Pick<
  RecommendationFormInputContextType,
  | "locations"
  | "date"
  | "time24h"
  | "stayDurationMinutes"
  | "numberOfPeople"
  | "partyType"
  | "activityType"
  | "budgetPerPerson"
  | "userNaturalLanguageRequest"
>;

const getInitialLocations = (): RecommendationFormLocation[] => [
  {
    lat: 37.5665,
    lng: 126.978,
    roadNameAddress: "서울특별시 중구 세종대로 110",
  },
];

export const getRecommendationFormInitialValues = (
  usePredefined: boolean = USE_PREDEFINED,
): RecommendationFormInitialValues => {
  const locations = getInitialLocations();

  if (!usePredefined) {
    return {
      locations,
      date: null,
      time24h: null,
      stayDurationMinutes: null,
      numberOfPeople: null,
      partyType: null,
      activityType: null,
      budgetPerPerson: null,
      userNaturalLanguageRequest: "",
    };
  }

  return {
    locations: [...locations],
    date: { year: 2026, month: 8, day: 4 },
    time24h: "",
    stayDurationMinutes: null,
    numberOfPeople: null,
    partyType: null,
    activityType: null,
    budgetPerPerson: [20000, 50000],
    userNaturalLanguageRequest: "",
  };
};
