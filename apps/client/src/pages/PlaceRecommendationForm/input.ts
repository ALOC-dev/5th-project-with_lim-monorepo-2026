import {
  type ActivityType,
  type BudgetRange,
  type PartyType,
  type UserInput,
  UserInputSchema,
} from "@monorepo/recommendation-engine/v1/contracts";

import { type CalendarDate, toDateISO } from "../../components/DatePicker/calendar";

export type PlaceRecommendationFormInput = {
  readonly locations: readonly {
    readonly lat: number;
    readonly lng: number;
  }[];
  readonly date: CalendarDate | null;
  readonly time24h: string | null;
  readonly stayDurationMinutes: number | null;
  readonly numberOfPeople: number | null;
  readonly partyType: PartyType | null;
  readonly activityType: ActivityType | null;
  readonly budgetPerPerson: BudgetRange | null;
  readonly userNaturalLanguageRequest: string;
};

export const buildPlaceRecommendationUserInput = (
  input: PlaceRecommendationFormInput,
): UserInput | null => {
  if (
    input.date === null ||
    input.time24h === null ||
    input.locations.length === 0 || // 출발지가 최소 1개 이상인지 확인
    input.userNaturalLanguageRequest.trim() === "" // 요청사항이 비어있는지 확인
  ) {
    return null;
  }

  const payload = {
    schedule: {
      dateISO: toDateISO(input.date),
      time24h: input.time24h,
      ...(input.stayDurationMinutes !== null && { stayDurationMinutes: input.stayDurationMinutes }),
    },
    location: input.locations.map((loc) => ({
      lat: loc.lat,
      lng: loc.lng,
    })),
    ...(input.numberOfPeople !== null && { numberOfPeople: input.numberOfPeople }),
    ...(input.partyType !== null && { partyType: input.partyType }),
    ...(input.activityType !== null && { activityType: input.activityType }),
    ...(input.budgetPerPerson !== null && { budgetPerPerson: input.budgetPerPerson }),
    userNaturalLanguageRequest: input.userNaturalLanguageRequest,
  };

  const parseResult = UserInputSchema.safeParse(payload);

  return parseResult.success ? parseResult.data : null;
};

export const dispatchPlaceRecommendationRequest = (
  userInput: UserInput | null,
  request: (userInput: UserInput) => void,
): boolean => {
  if (userInput === null) {
    return false;
  }

  request(userInput);
  return true;
};
