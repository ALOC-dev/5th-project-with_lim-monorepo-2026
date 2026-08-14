import { type UserInput, UserInputSchema } from "@monorepo/recommendation-engine/v1/contracts";

import type {
  PlaceRecommendationFormInputContextType,
  PlaceRecommendationFormLocation,
} from "./PlaceRecommendationForm.context";
import type { CalendarDate } from "./utils/calendarDayViewModel";

export const USE_PREDEFINED = true;

const PLACE_RECOMMENDATION_RETRY_STATE_TYPE = "place-recommendation-retry";

export type PlaceRecommendationFormInitialValues = Pick<
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
> & {
  readonly isStayDurationEnabled: boolean;
  readonly isActivityTypeEnabled: boolean;
  readonly isNumberOfPeopleEnabled: boolean;
  readonly isPartyTypeEnabled: boolean;
  readonly isBudgetEnabled: boolean;
};

export type PlaceRecommendationRetryRouteState = {
  readonly type: typeof PLACE_RECOMMENDATION_RETRY_STATE_TYPE;
  readonly input: unknown;
  readonly formLocations: unknown;
};

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
      isStayDurationEnabled: false,
      isActivityTypeEnabled: false,
      isNumberOfPeopleEnabled: false,
      isPartyTypeEnabled: false,
      isBudgetEnabled: false,
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
    isStayDurationEnabled: false,
    isActivityTypeEnabled: false,
    isNumberOfPeopleEnabled: false,
    isPartyTypeEnabled: false,
    isBudgetEnabled: false,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toCalendarDate = (dateISO: string): CalendarDate | null => {
  const [yearText, monthText, dayText] = dateISO.split("-");
  if (!yearText || !monthText || !dayText) return null;

  return {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
  };
};

const toFormLocations = (
  value: unknown,
  inputLocations: UserInput["location"],
): PlaceRecommendationFormLocation[] | null => {
  if (!Array.isArray(value) || value.length !== inputLocations.length) return null;

  const locations: PlaceRecommendationFormLocation[] = [];
  for (const [index, snapshot] of value.entries()) {
    const inputLocation = inputLocations[index];
    if (!inputLocation || !isRecord(snapshot)) return null;

    const { lat, lng, placeName, roadNameAddress } = snapshot;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      lat !== inputLocation.lat ||
      lng !== inputLocation.lng ||
      typeof roadNameAddress !== "string" ||
      roadNameAddress.trim().length === 0 ||
      (placeName !== undefined && (typeof placeName !== "string" || placeName.trim().length === 0))
    ) {
      return null;
    }

    locations.push({
      lat,
      lng,
      ...(typeof placeName === "string" ? { placeName } : {}),
      roadNameAddress,
    });
  }

  return locations;
};

export const createPlaceRecommendationRetryRouteState = (
  input: unknown,
  formLocations: unknown,
): PlaceRecommendationRetryRouteState => ({
  type: PLACE_RECOMMENDATION_RETRY_STATE_TYPE,
  input,
  formLocations,
});

export const getPlaceRecommendationRetryInitialValues = (
  state: unknown,
): PlaceRecommendationFormInitialValues | null => {
  if (!isRecord(state) || state.type !== PLACE_RECOMMENDATION_RETRY_STATE_TYPE) return null;

  const parsedInput = UserInputSchema.safeParse(state.input);
  if (!parsedInput.success) return null;

  const date = toCalendarDate(parsedInput.data.schedule.dateISO);
  const locations = toFormLocations(state.formLocations, parsedInput.data.location);
  if (date === null || locations === null) return null;

  return {
    locations,
    date,
    time24h: parsedInput.data.schedule.time24h,
    stayDurationMinutes: parsedInput.data.schedule.stayDurationMinutes ?? null,
    numberOfPeople: parsedInput.data.numberOfPeople ?? null,
    partyType: parsedInput.data.partyType ?? null,
    activityType: parsedInput.data.activityType ?? null,
    budgetPerPerson: parsedInput.data.budgetPerPerson ?? null,
    userNaturalLanguageRequest: parsedInput.data.userNaturalLanguageRequest,
    isStayDurationEnabled: parsedInput.data.schedule.stayDurationMinutes !== undefined,
    isActivityTypeEnabled: parsedInput.data.activityType !== undefined,
    isNumberOfPeopleEnabled: parsedInput.data.numberOfPeople !== undefined,
    isPartyTypeEnabled: parsedInput.data.partyType !== undefined,
    isBudgetEnabled: parsedInput.data.budgetPerPerson !== undefined,
  };
};
