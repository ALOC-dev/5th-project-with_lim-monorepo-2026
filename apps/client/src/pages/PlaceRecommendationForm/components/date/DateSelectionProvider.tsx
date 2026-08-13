import type { ReactNode } from "react";
import { useCallback, useState } from "react";

import { usePlaceRecommendationFormInput } from "../../PlaceRecommendationForm.context";
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

const isBeforeCalendarMonth = (left: Calendar, right: Calendar): boolean =>
  left.year < right.year || (left.year === right.year && left.month < right.month);

export const DateSelectionProvider = ({ children }: { readonly children: ReactNode }) => {
  const { date, setDate } = usePlaceRecommendationFormInput();
  const [calendar, setCalendar] = useState<Calendar>(() => getCalendarFromDate(date));
  const [selectedDate, setSelectedDate] = useState<CalendarDate | null>(date);
  const today = getTodayCalendarDate();
  const canGoToPreviousMonth = !isBeforeCalendarMonth(calendar, today);

  const moveToCalendarMonth = useCallback((offset: -1 | 1) => {
    setCalendar((current) => moveCalendarMonth(current, offset));
  }, []);

  const goToPreviousMonth = useCallback(() => {
    if (!canGoToPreviousMonth) return;
    moveToCalendarMonth(-1);
  }, [canGoToPreviousMonth, moveToCalendarMonth]);

  const goToNextMonth = useCallback(() => {
    moveToCalendarMonth(1);
  }, [moveToCalendarMonth]);

  const selectDate = useCallback((nextDate: CalendarDate) => {
    setSelectedDate(nextDate);
  }, []);

  const confirmDate = useCallback(() => {
    setDate(selectedDate);
  }, [selectedDate, setDate]);

  return (
    <DateSelectionContext.Provider
      value={{
        calendar,
        selectedDate,
        canGoToPreviousMonth,
        goToNextMonth,
        goToPreviousMonth,
        selectDate,
        confirmDate,
      }}
    >
      {children}
    </DateSelectionContext.Provider>
  );
};
