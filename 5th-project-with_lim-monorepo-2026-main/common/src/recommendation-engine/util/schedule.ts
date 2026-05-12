import type {
  DayOfWeek,
  OperationSchedule,
  UserInput,
} from "../contracts/index.js";
import type { RecommendationCandidate } from "./types.js";

const DAY_OF_WEEK_BY_JS_DAY: readonly DayOfWeek[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export const isAvailableForVisit = (
  candidate: RecommendationCandidate,
  userInput: UserInput,
): boolean => {
  const schedule = findScheduleForDate(
    candidate.operationInfo.schedules,
    userInput.schedule.dateISO,
  );
  if (!schedule || schedule.status === "CLOSED") return false;

  const visitStart = timeToMinutes(userInput.schedule.time24h);
  const visitEnd = visitStart + userInput.schedule.stayDurationMinutes;
  const open = timeToMinutes(schedule.open);
  let close = timeToMinutes(schedule.close);
  if (close <= open) close += 24 * 60;

  if (visitStart < open || visitEnd > close) return false;
  if (
    schedule.lastOrderTime &&
    visitStart > timeToMinutes(schedule.lastOrderTime)
  ) {
    return false;
  }

  return !schedule.breakTimes.some((breakTime) => {
    const breakStart = timeToMinutes(breakTime.start);
    const breakEnd = timeToMinutes(breakTime.end);
    return visitStart < breakEnd && visitEnd > breakStart;
  });
};

export const getTimeBufferScore = (
  candidate: RecommendationCandidate,
  userInput: UserInput,
): number => {
  const schedule = findScheduleForDate(
    candidate.operationInfo.schedules,
    userInput.schedule.dateISO,
  );
  if (!schedule || schedule.status === "CLOSED") return 0;

  const visitEnd =
    timeToMinutes(userInput.schedule.time24h) +
    userInput.schedule.stayDurationMinutes;
  const open = timeToMinutes(schedule.open);
  let close = timeToMinutes(schedule.close);
  if (close <= open) close += 24 * 60;

  const bufferMinutes = Math.max(0, close - Math.max(open, visitEnd));
  return Math.min(100, 60 + bufferMinutes / 3);
};

const findScheduleForDate = (
  schedules: OperationSchedule[],
  dateISO: string,
): OperationSchedule | undefined => {
  const dayOfWeek = getDayOfWeek(dateISO);
  return schedules.find((schedule) => schedule.daysOfWeek.includes(dayOfWeek));
};

const getDayOfWeek = (dateISO: string): DayOfWeek => {
  const [yearText, monthText, dayText] = dateISO.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = DAY_OF_WEEK_BY_JS_DAY[date.getUTCDay()];
  if (!dayOfWeek) {
    throw new Error(`invalid date: ${dateISO}`);
  }
  return dayOfWeek;
};

const timeToMinutes = (time24h: string): number => {
  const [hourText, minuteText] = time24h.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return hour * 60 + minute;
};
