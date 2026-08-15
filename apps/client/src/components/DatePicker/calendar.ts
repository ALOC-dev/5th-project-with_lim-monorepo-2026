/** Pure date and calendar helpers shared by recommendation forms. */
export type CalendarMonth = {
  readonly year: number;
  readonly month: number;
};

export type CalendarDate = CalendarMonth & {
  readonly day: number;
};

export type CalendarDayViewModel =
  | {
      readonly kind: "empty";
      readonly key: string;
    }
  | {
      readonly kind: "day";
      readonly dateISO: string;
      readonly day: number;
      readonly isToday: boolean;
      readonly isSelected: boolean;
      readonly isDisabled: boolean;
    };

const pad2 = (value: number) => String(value).padStart(2, "0");

export const toDateISO = (date: CalendarDate): string =>
  `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;

export const fromDateISO = (value: string): CalendarDate | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(year, month - 1, day);

  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() + 1 !== month ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

export const getLocalTodayDateISO = (now = new Date()): string =>
  toDateISO({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });

export const formatDateLabel = (value: string): string => {
  const date = fromDateISO(value);
  if (!date) return "";

  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(date.year, date.month - 1, date.day).getDay()
  ];
  return `${toDateISO(date)} (${weekday})`;
};

export const getCalendarMonth = (value: string): CalendarMonth | null => {
  const date = fromDateISO(value);
  return date ? { year: date.year, month: date.month } : null;
};

export const moveCalendarMonth = (calendar: CalendarMonth, offset: -1 | 1): CalendarMonth => {
  const next = new Date(calendar.year, calendar.month - 1 + offset, 1);
  return { year: next.getFullYear(), month: next.getMonth() + 1 };
};

const monthIndex = ({ year, month }: CalendarMonth): number => year * 12 + month - 1;

export const canMoveCalendarMonth = (
  calendar: CalendarMonth,
  offset: -1 | 1,
  minDate?: string,
  maxDate?: string,
): boolean => {
  const target = moveCalendarMonth(calendar, offset);
  const minimum = minDate ? getCalendarMonth(minDate) : null;
  const maximum = maxDate ? getCalendarMonth(maxDate) : null;

  if (minimum && monthIndex(target) < monthIndex(minimum)) return false;
  if (maximum && monthIndex(target) > monthIndex(maximum)) return false;
  return true;
};

export const buildCalendarDayViewModels = (
  calendar: CalendarMonth,
  {
    selectedDate,
    today = getLocalTodayDateISO(),
    minDate,
    maxDate,
  }: {
    readonly selectedDate?: string | null;
    readonly today?: string;
    readonly minDate?: string;
    readonly maxDate?: string;
  } = {},
): readonly CalendarDayViewModel[] => {
  const firstWeekday = new Date(calendar.year, calendar.month - 1, 1).getDay();
  const daysInMonth = new Date(calendar.year, calendar.month, 0).getDate();
  const leading = Array.from({ length: firstWeekday }, (_, index) => ({
    kind: "empty" as const,
    key: `leading-${index}`,
  }));
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const dateISO = toDateISO({ ...calendar, day: index + 1 });
    return {
      kind: "day" as const,
      dateISO,
      day: index + 1,
      isToday: dateISO === today,
      isSelected: dateISO === selectedDate,
      isDisabled:
        (minDate !== undefined && dateISO < minDate) ||
        (maxDate !== undefined && dateISO > maxDate),
    };
  });
  const trailingCount = 42 - leading.length - days.length;
  const trailing = Array.from({ length: trailingCount }, (_, index) => ({
    kind: "empty" as const,
    key: `trailing-${index}`,
  }));

  return [...leading, ...days, ...trailing];
};
