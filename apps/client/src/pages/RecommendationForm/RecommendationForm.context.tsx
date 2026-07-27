import type {
  ActivityType,
  BudgetRange,
  PartyType,
  UserInput,
} from "@monorepo/recommendation-engine/v1/contracts";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";

import type { CalendarDate } from "./utils/calendarDayViewModel";

export type RecommendationFormLocation = {
  readonly lat: number;
  readonly lng: number;
  readonly placeName?: string;
  readonly roadNameAddress: string;
};

export type RecommendationFormDate = CalendarDate;

export type RecommendationFormSheet = "location" | "date";

export type RecommendationFormInputContextType = {
  readonly location: RecommendationFormLocation;
  readonly date: RecommendationFormDate | null;
  readonly time24h: string | null;
  readonly stayDurationMinutes: number | null;
  readonly numberOfPeople: number | null;
  readonly partyType: PartyType | null;
  readonly activityType: ActivityType | null;
  readonly budgetPerPerson: BudgetRange | null;
  readonly userNaturalLanguageRequest: string;

  readonly setLocation: Dispatch<SetStateAction<RecommendationFormLocation>>;
  readonly setDate: Dispatch<SetStateAction<RecommendationFormDate | null>>;
  readonly setTime24h: Dispatch<SetStateAction<string | null>>;
  readonly setStayDurationMinutes: Dispatch<SetStateAction<number | null>>;
  readonly setNumberOfPeople: Dispatch<SetStateAction<number | null>>;
  readonly setPartyType: Dispatch<SetStateAction<PartyType | null>>;
  readonly setActivityType: Dispatch<SetStateAction<ActivityType | null>>;
  readonly setBudgetPerPerson: Dispatch<SetStateAction<BudgetRange | null>>;
  readonly setUserNaturalLanguageRequest: Dispatch<SetStateAction<string>>;

  readonly resetForm: () => void;
  readonly buildUserInput: () => UserInput | null;
};

export type RecommendationFormUiContextType = {
  readonly activeSheet: RecommendationFormSheet | null;
  readonly openSheet: (sheet: RecommendationFormSheet) => void;
  readonly closeSheet: () => void;
  readonly isSheetOpen: (sheet: RecommendationFormSheet) => boolean;
};

export const RecommendationFormInputContext =
  createContext<RecommendationFormInputContextType | null>(null);
export const RecommendationFormUiContext = createContext<RecommendationFormUiContextType | null>(
  null,
);

export const useRecommendationFormInput = () => {
  const context = useContext(RecommendationFormInputContext);
  if (!context) {
    throw new Error("useRecommendationFormInput must be used within RecommendationFlowProvider");
  }

  return context;
};

export const useRecommendationFormUi = () => {
  const context = useContext(RecommendationFormUiContext);
  if (!context) {
    throw new Error("useRecommendationFormUi must be used within RecommendationFlowProvider");
  }

  return context;
};
