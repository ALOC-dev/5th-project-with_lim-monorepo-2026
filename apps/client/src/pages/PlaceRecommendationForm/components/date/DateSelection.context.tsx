import { createContext } from "react";

import type { Calendar } from "../../utils/calendarDayViewModel";

export type DateSelectionContextType = {
  readonly calendar: Calendar;
  readonly goToPreviousMonth: () => void;
  readonly goToNextMonth: () => void;
};

export const DateSelectionContext = createContext<DateSelectionContextType | null>(null);
