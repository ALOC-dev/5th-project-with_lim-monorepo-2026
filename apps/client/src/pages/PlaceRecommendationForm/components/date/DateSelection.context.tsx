import { createContext } from "react";

import type { Calendar, CalendarDate } from "../../utils/calendarDayViewModel";

export type DateSelectionContextType = {
  readonly calendar: Calendar;
  readonly selectedDate: CalendarDate | null;
  readonly canGoToPreviousMonth: boolean;
  readonly goToPreviousMonth: () => void;
  readonly goToNextMonth: () => void;
  readonly selectDate: (date: CalendarDate) => void;
  readonly confirmDate: () => void;
};

export const DateSelectionContext = createContext<DateSelectionContextType | null>(null);
