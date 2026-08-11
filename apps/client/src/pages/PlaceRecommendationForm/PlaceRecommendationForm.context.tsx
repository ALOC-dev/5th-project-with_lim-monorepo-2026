import type {
  ActivityType,
  BudgetRange,
  PartyType,
  UserInput,
} from "@monorepo/recommendation-engine/v1/contracts";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";

import type { CalendarDate } from "./utils/calendarDayViewModel";

export type PlaceRecommendationFormLocation = {
  readonly lat: number;
  readonly lng: number;
  readonly placeName?: string;
  readonly roadNameAddress: string;
};

export type PlaceRecommendationFormDate = CalendarDate;

export type PlaceRecommendationFormSheet = "location" | "date";

export type PlaceRecommendationFormInputContextType = {
  readonly locations: PlaceRecommendationFormLocation[];
  readonly date: PlaceRecommendationFormDate | null;
  readonly time24h: string | null;
  readonly userNaturalLanguageRequest: string;

  // 선택 입력 항목들
  readonly stayDurationMinutes: number | null;
  readonly numberOfPeople: number | null;
  readonly partyType: PartyType | null;
  readonly activityType: ActivityType | null;
  readonly budgetPerPerson: BudgetRange | null;

  // 선택 입력 활성화(체크박스) 상태
  readonly isStayDurationEnabled: boolean;
  readonly isActivityTypeEnabled: boolean;
  readonly isNumberOfPeopleEnabled: boolean;
  readonly isPartyTypeEnabled: boolean;
  readonly isBudgetEnabled: boolean;

  readonly setLocations: Dispatch<SetStateAction<PlaceRecommendationFormLocation[]>>;
  readonly setDate: Dispatch<SetStateAction<PlaceRecommendationFormDate | null>>;
  readonly setTime24h: Dispatch<SetStateAction<string | null>>;
  readonly setUserNaturalLanguageRequest: Dispatch<SetStateAction<string>>;

  readonly setStayDurationMinutes: Dispatch<SetStateAction<number | null>>;
  readonly setNumberOfPeople: Dispatch<SetStateAction<number | null>>;
  readonly setPartyType: Dispatch<SetStateAction<PartyType | null>>;
  readonly setActivityType: Dispatch<SetStateAction<ActivityType | null>>;
  readonly setBudgetPerPerson: Dispatch<SetStateAction<BudgetRange | null>>;

  readonly setIsStayDurationEnabled: Dispatch<SetStateAction<boolean>>;
  readonly setIsActivityTypeEnabled: Dispatch<SetStateAction<boolean>>;
  readonly setIsNumberOfPeopleEnabled: Dispatch<SetStateAction<boolean>>;
  readonly setIsPartyTypeEnabled: Dispatch<SetStateAction<boolean>>;
  readonly setIsBudgetEnabled: Dispatch<SetStateAction<boolean>>;

  readonly resetForm: () => void;
  readonly buildUserInput: () => UserInput | null;
};

export type PlaceRecommendationFormUiContextType = {
  readonly activeSheet: PlaceRecommendationFormSheet | null;
  readonly openSheet: (sheet: PlaceRecommendationFormSheet) => void;
  readonly closeSheet: () => void;
  readonly isSheetOpen: (sheet: PlaceRecommendationFormSheet) => boolean;
};

export const PlaceRecommendationFormInputContext =
  createContext<PlaceRecommendationFormInputContextType | null>(null);
export const PlaceRecommendationFormUiContext =
  createContext<PlaceRecommendationFormUiContextType | null>(null);

export const usePlaceRecommendationFormInput = () => {
  const context = useContext(PlaceRecommendationFormInputContext);
  if (!context) {
    throw new Error(
      "usePlaceRecommendationFormInput must be used within PlaceRecommendationFlowProvider",
    );
  }
  return context;
};

export const usePlaceRecommendationFormUi = () => {
  const context = useContext(PlaceRecommendationFormUiContext);
  if (!context) {
    throw new Error(
      "usePlaceRecommendationFormUi must be used within PlaceRecommendationFlowProvider",
    );
  }
  return context;
};
