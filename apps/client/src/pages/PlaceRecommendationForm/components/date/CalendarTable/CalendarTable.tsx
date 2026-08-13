import { useMemo } from "react";

import {
  buildCalendarDayViewModels,
  getTodayCalendarDate,
} from "../../../utils/calendarDayViewModel";
import { S } from "../DateSelectionBottomSheet.styled";
import { useDateSelection } from "../useDateSelection";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const CalendarTable = () => {
  const { calendar, selectedDate, selectDate } = useDateSelection();
  const dayViewModels = useMemo(
    () =>
      buildCalendarDayViewModels(calendar, {
        minDate: getTodayCalendarDate(),
        selectedDate,
      }),
    [calendar, selectedDate],
  );

  return (
    <S.Calendar>
      <S.WeekdayRow>
        {WEEKDAY_LABELS.map((weekday) => (
          <S.WeekdayCell key={weekday}>{weekday}</S.WeekdayCell>
        ))}
      </S.WeekdayRow>
      <S.DayGrid>
        {dayViewModels.map((dayViewModel, index) => {
          if (dayViewModel.kind === "empty") {
            return <S.EmptyDay key={`empty-${index}`} aria-hidden />;
          }

          return (
            <S.DayButton
              key={dayViewModel.dateISO}
              type="button"
              aria-label={`${dayViewModel.date.month}월 ${dayViewModel.day}일`}
              aria-pressed={dayViewModel.isSelected}
              disabled={dayViewModel.isDisabled}
              $isSelected={dayViewModel.isSelected}
              $isToday={dayViewModel.isToday}
              onClick={() => selectDate(dayViewModel.date)}
            >
              <span style={{ lineHeight: 1, transform: "translateY(1px)" }}>
                {dayViewModel.day}
              </span>
              {dayViewModel.isSelected ? <S.SelectedMark aria-hidden>✓</S.SelectedMark> : null}
            </S.DayButton>
          );
        })}
      </S.DayGrid>
    </S.Calendar>
  );
};

export default CalendarTable;
