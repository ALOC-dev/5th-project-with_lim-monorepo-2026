import type {
  RecommendationFormInputContextType,
  RecommendationFormLocation,
} from "./RecommendationForm.context";

export const USE_PREDEFINED = true;

type RecommendationFormInitialValues = Pick<
  RecommendationFormInputContextType,
  | "location"
  | "date"
  | "time24h"
  | "stayDurationMinutes"
  | "numberOfPeople"
  | "partyType"
  | "activityType"
  | "budgetPerPerson"
  | "userNaturalLanguageRequest"
>;

const getInitialLocation = (): RecommendationFormLocation => ({
  lat: 37.5665,
  lng: 126.978,
  roadNameAddress: "서울특별시 중구 세종대로 110",
});

export const getRecommendationFormInitialValues = (
  usePredefined: boolean = USE_PREDEFINED,
): RecommendationFormInitialValues => {
  const location = getInitialLocation();

  if (!usePredefined) {
    return {
      location,
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
    location,
    date: { year: 2026, month: 7, day: 7 },
    time24h: "13:00",
    stayDurationMinutes: 5,
    numberOfPeople: 3,
    partyType: "FRIENDS",
    activityType: "CAFE",
    budgetPerPerson: [20000, 50000],
    userNaturalLanguageRequest: "곱창",
  };
};
