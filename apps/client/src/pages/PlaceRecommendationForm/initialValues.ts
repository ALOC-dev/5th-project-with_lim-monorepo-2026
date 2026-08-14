import type {
  PlaceRecommendationFormInputContextType,
  PlaceRecommendationFormLocation,
} from "./PlaceRecommendationForm.context";

export const USE_PREDEFINED = true;

type PlaceRecommendationFormInitialValues = Pick<
  PlaceRecommendationFormInputContextType,
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

const getInitialLocations = (): PlaceRecommendationFormLocation[] => [];

export const getPlaceRecommendationFormInitialValues = (
  usePredefined: boolean = USE_PREDEFINED,
): PlaceRecommendationFormInitialValues => {
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
    date: null,
    time24h: null,
    stayDurationMinutes: null,
    numberOfPeople: null,
    partyType: null,
    activityType: null,
    budgetPerPerson: [20000, 50000],
    userNaturalLanguageRequest: "",
  };
};
