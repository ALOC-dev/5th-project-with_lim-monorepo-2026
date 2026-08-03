import {
  type ActivityType,
  type BudgetRange,
  type PartyType,
  type UserInput,
  UserInputSchema,
} from "@monorepo/recommendation-engine/v1/contracts";

import type { CalendarDate } from "./utils/calendarDayViewModel";
import { toDateISO } from "./utils/calendarDayViewModel";

export type RecommendationFormInput = {
  readonly location: {
    readonly lat: number;
    readonly lng: number;
  };
  readonly date: CalendarDate | null;
  readonly time24h: string | null;
  readonly stayDurationMinutes: number | null;
  readonly numberOfPeople: number | null;
  readonly partyType: PartyType | null;
  readonly activityType: ActivityType | null;
  readonly budgetPerPerson: BudgetRange | null;
  readonly userNaturalLanguageRequest: string;
};

export const buildRecommendationUserInput = (input: RecommendationFormInput): UserInput | null => {
  if (
    input.date === null ||
    input.time24h === null ||
    input.stayDurationMinutes === null ||
    input.numberOfPeople === null ||
    !input.partyType ||
    !input.activityType ||
    !input.budgetPerPerson
  ) {
    return null;
  }

  const parseResult = UserInputSchema.safeParse({
    schedule: {
      dateISO: toDateISO(input.date),
      time24h: input.time24h,
      stayDurationMinutes: input.stayDurationMinutes,
    },
    location: [
      {
        lat: input.location.lat,
        lng: input.location.lng,
      },
    ],
    numberOfPeople: input.numberOfPeople,
    partyType: input.partyType,
    activityType: input.activityType,
    budgetPerPerson: input.budgetPerPerson,
    userNaturalLanguageRequest: input.userNaturalLanguageRequest,
  });

  return parseResult.success ? parseResult.data : null;
};

export const dispatchRecommendationRequest = (
  userInput: UserInput | null,
  request: (userInput: UserInput) => void,
): boolean => {
  if (userInput === null) {
    return false;
  }

  request(userInput);
  return true;
};
