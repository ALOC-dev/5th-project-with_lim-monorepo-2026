import type { CoursePlace } from "./course.types";

export const COURSE_TIME_ZONE = "Asia/Seoul";
export const MIN_SELECTED_PLACES = 2;
export const MAX_SELECTED_PLACES = 15;
export const MIN_DURATION_HOURS = 2;
export const MAX_DURATION_HOURS = 8;

const SEOUL_OFFSET_HOURS = 9;
const MAX_SCHEDULE_DAYS = 365;

type SeoulDateTime = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
};

const seoulFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: COURSE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const toSeoulDateTime = (value: Date): SeoulDateTime => {
  const parts = Object.fromEntries(
    seoulFormatter
      .formatToParts(value)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, Number(partValue)]),
  );

  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  };
};

const pad2 = (value: number) => String(value).padStart(2, "0");

export const getDefaultCourseSchedule = (now = new Date()) => {
  const current = toSeoulDateTime(now);
  const minutesUntilNextSlot = 30 - (current.minute % 30);
  const nextSlot = toSeoulDateTime(new Date(now.getTime() + minutesUntilNextSlot * 60_000));

  return {
    date: `${nextSlot.year}-${pad2(nextSlot.month)}-${pad2(nextSlot.day)}`,
    startTime: `${pad2(nextSlot.hour)}:${pad2(nextSlot.minute)}`,
  } as const;
};

const toScheduleTimestamp = (date: string, startTime: string): number | null => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(startTime);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const timestamp = Date.UTC(year, month - 1, day, hour - SEOUL_OFFSET_HOURS, minute);
  const roundTrip = toSeoulDateTime(new Date(timestamp));

  if (
    roundTrip.year !== year ||
    roundTrip.month !== month ||
    roundTrip.day !== day ||
    roundTrip.hour !== hour ||
    roundTrip.minute !== minute
  ) {
    return null;
  }

  return timestamp;
};

export type CourseScheduleValidation = "VALID" | "INVALID" | "PAST" | "TOO_FAR";

export const validateCourseSchedule = (
  date: string,
  startTime: string,
  now = new Date(),
): CourseScheduleValidation => {
  const timestamp = toScheduleTimestamp(date, startTime);
  if (timestamp === null) return "INVALID";
  if (timestamp <= now.getTime()) return "PAST";
  if (timestamp > now.getTime() + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1_000) return "TOO_FAR";
  return "VALID";
};

export type CourseFormValidationField =
  | "places"
  | "numberOfPeople"
  | "budgetPerPersonWon"
  | "date"
  | "startTime";

export type CourseFormValidationError = {
  readonly field: CourseFormValidationField;
  readonly message: string;
};

export const getCourseFormValidationError = (
  {
    selectedPlaceCount,
    numberOfPeople,
    budgetPerPersonWon,
    date,
    startTime,
  }: {
    readonly selectedPlaceCount: number;
    readonly numberOfPeople: number;
    readonly budgetPerPersonWon?: number;
    readonly date: string;
    readonly startTime: string;
  },
  now = new Date(),
): CourseFormValidationError | null => {
  if (selectedPlaceCount < MIN_SELECTED_PLACES) {
    return {
      field: "places",
      message: `후보 장소를 ${MIN_SELECTED_PLACES}곳 이상 선택해 주세요.`,
    };
  }
  if (!Number.isInteger(numberOfPeople) || numberOfPeople < 1 || numberOfPeople > 20) {
    return { field: "numberOfPeople", message: "인원은 1~20명으로 입력해 주세요." };
  }
  if (
    budgetPerPersonWon !== undefined &&
    (!Number.isInteger(budgetPerPersonWon) ||
      budgetPerPersonWon < 5_000 ||
      budgetPerPersonWon > 500_000)
  ) {
    return {
      field: "budgetPerPersonWon",
      message: "1인당 예산은 5천원~50만원으로 입력해 주세요.",
    };
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(startTime)) {
    return { field: "startTime", message: "올바른 시작 시간을 입력해 주세요." };
  }

  const scheduleValidation = validateCourseSchedule(date, startTime, now);
  switch (scheduleValidation) {
    case "VALID":
      return null;
    case "PAST":
      return { field: "startTime", message: "현재보다 이후의 약속 시간을 선택해 주세요." };
    case "TOO_FAR":
      return { field: "date", message: "약속 시간은 1년 이내로 선택해 주세요." };
    case "INVALID":
      return { field: "date", message: "올바른 날짜를 입력해 주세요." };
  }
};

export const getCoursePlaceCanonicalKey = (place: CoursePlace) =>
  place.kakaoPlaceId
    ? `KAKAO:${place.kakaoPlaceId}`
    : place.savedPlaceId
      ? `SAVED:${place.savedPlaceId}`
      : `${place.name.trim().toLocaleLowerCase("ko-KR")}:${place.lat}:${place.lng}`;

export const isSameCoursePlace = (left: CoursePlace, right: CoursePlace) =>
  Boolean(
    (left.savedPlaceId && right.savedPlaceId && left.savedPlaceId === right.savedPlaceId) ||
    (left.kakaoPlaceId && right.kakaoPlaceId && left.kakaoPlaceId === right.kakaoPlaceId) ||
    getCoursePlaceCanonicalKey(left) === getCoursePlaceCanonicalKey(right),
  );

/**
 * Keep the first selected position, while preferring the richer saved-place representation.
 */
export const toggleCoursePlace = (
  selected: readonly CoursePlace[],
  next: CoursePlace,
): readonly CoursePlace[] => {
  const existingIndex = selected.findIndex((place) => isSameCoursePlace(place, next));

  if (existingIndex >= 0) return selected.filter((_, index) => index !== existingIndex);
  if (selected.length >= MAX_SELECTED_PLACES) return selected;

  const samePhysicalPlaceIndex = next.kakaoPlaceId
    ? selected.findIndex(({ kakaoPlaceId }) => kakaoPlaceId === next.kakaoPlaceId)
    : -1;
  if (samePhysicalPlaceIndex < 0) return [...selected, next];

  if (next.source !== "SAVED_PLACE") return selected;
  return selected.map((place, index) => (index === samePhysicalPlaceIndex ? next : place));
};
