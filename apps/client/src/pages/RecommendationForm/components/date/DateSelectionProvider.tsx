import type { ReactNode } from "react";
import { useCallback, useState } from "react";

import { useRecommendationFormInput } from "../../RecommendationForm.context";
import {
  type Calendar,
  type CalendarDate,
  getTodayCalendarDate,
} from "../../utils/calendarDayViewModel";
import { DateSelectionContext } from "./DateSelection.context";

const getCalendarFromDate = (date: CalendarDate | null): Calendar => {
  if (!date) {
    const today = getTodayCalendarDate();
    return {
      year: today.year,
      month: today.month,
    };
  }

  return {
    year: date.year,
    month: date.month,
  };
};

const moveCalendarMonth = (calendar: Calendar, offset: -1 | 1): Calendar => {
  const nextMonthIndex = calendar.month - 1 + offset;
  const nextDate = new Date(calendar.year, nextMonthIndex, 1);

  return {
    year: nextDate.getFullYear(),
    month: nextDate.getMonth() + 1,
  };
};

const getFirstDateOfMonth = (calendar: Calendar): CalendarDate => {
  return {
    year: calendar.year,
    month: calendar.month,
    day: 1,
  };
};

export const DateSelectionProvider = ({ children }: { readonly children: ReactNode }) => {
  const { date, setDate } = useRecommendationFormInput();
  const [calendar, setCalendar] = useState<Calendar>(() => getCalendarFromDate(date));

  const moveToCalendarMonth = useCallback(
    (offset: -1 | 1) => {
      const nextCalendar = moveCalendarMonth(calendar, offset);
      setCalendar(nextCalendar);
      setDate(getFirstDateOfMonth(nextCalendar));
    },
    [calendar, setDate],
  );

  const goToPreviousMonth = useCallback(() => {
    moveToCalendarMonth(-1);
  }, [moveToCalendarMonth]);

  const goToNextMonth = useCallback(() => {
    moveToCalendarMonth(1);
  }, [moveToCalendarMonth]);

  return (
    <DateSelectionContext.Provider value={{ calendar, goToNextMonth, goToPreviousMonth }}>
      {children}
    </DateSelectionContext.Provider>
  );
};
