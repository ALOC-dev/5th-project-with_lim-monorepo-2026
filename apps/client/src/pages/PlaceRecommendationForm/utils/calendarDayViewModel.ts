export type Calendar = {
  readonly year: number;
  readonly month: number;
};

export type CalendarDate = Calendar & {
  readonly day: number;
};

export type CalendarDayCell =
  | {
      readonly kind: "empty";
    }
  | {
      readonly kind: "day";
      readonly date: CalendarDate;
      readonly dateISO: string;
      readonly day: number;
      readonly weekday: number;
    };

export type CalendarDayViewModel = CalendarDayCell & {
  readonly isToday: boolean;
  readonly isSelected: boolean;
  readonly isDisabled: boolean;
};

export type CalendarDayViewModelOptions = {
  readonly selectedDate?: CalendarDate | null;
  readonly today?: CalendarDate;
  readonly minDate?: CalendarDate;
  readonly maxDate?: CalendarDate;
};

export const toDateISO = (date: CalendarDate) => {
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");

  return `${date.year}-${month}-${day}`;
};

export const getTodayCalendarDate = (): CalendarDate => {
  const today = new Date();

  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
};

export const buildCalendarMonthCells = (calendar: Calendar): readonly CalendarDayCell[] => {
  const firstWeekday = new Date(calendar.year, calendar.month - 1, 1).getDay();
  const daysInMonth = new Date(calendar.year, calendar.month, 0).getDate();
  const fixedCalendarCellCount = 42;

  const leadingEmptyCells = Array.from(
    { length: firstWeekday },
    () => ({ kind: "empty" }) as const,
  );
  const dayCells = Array.from({ length: daysInMonth }, (_, index): CalendarDayCell => {
    const day = index + 1;
    const date = {
      year: calendar.year,
      month: calendar.month,
      day,
    };

    return {
      kind: "day",
      date,
      dateISO: toDateISO(date),
      day,
      weekday: new Date(calendar.year, calendar.month - 1, day).getDay(),
    };
  });

  const cells = [...leadingEmptyCells, ...dayCells];
  const trailingEmptyCellCount = fixedCalendarCellCount - cells.length;
  const trailingEmptyCells = Array.from(
    { length: trailingEmptyCellCount },
    () => ({ kind: "empty" }) as const,
  );

  return [...cells, ...trailingEmptyCells];
};

export const buildCalendarDayViewModels = (
  calendar: Calendar,
  options: CalendarDayViewModelOptions = {},
): readonly CalendarDayViewModel[] => {
  const today = options.today ?? getTodayCalendarDate();

  return buildCalendarMonthCells(calendar).map((cell): CalendarDayViewModel => {
    if (cell.kind === "empty") {
      return {
        ...cell,
        isToday: false,
        isSelected: false,
        isDisabled: false,
      };
    }

    return {
      ...cell,
      isToday: isSameCalendarDate(cell.date, today),
      isSelected: options.selectedDate
        ? isSameCalendarDate(cell.date, options.selectedDate)
        : false,
      isDisabled:
        (options.minDate ? isBeforeCalendarDate(cell.date, options.minDate) : false) ||
        (options.maxDate ? isBeforeCalendarDate(options.maxDate, cell.date) : false),
    };
  });
};

const isSameCalendarDate = (left: CalendarDate, right: CalendarDate) => {
  return left.year === right.year && left.month === right.month && left.day === right.day;
};

const isBeforeCalendarDate = (left: CalendarDate, right: CalendarDate) => {
  if (left.year !== right.year) return left.year < right.year;
  if (left.month !== right.month) return left.month < right.month;
  return left.day < right.day;
};
