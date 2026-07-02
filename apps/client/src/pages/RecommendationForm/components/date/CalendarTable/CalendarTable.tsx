import { useMemo } from "react";

import { useRecommendationFormInput } from "../../../RecommendationForm.context";
import { buildCalendarDayViewModels } from "../../../utils/calendarDayViewModel";
import { S } from "../DateSelectionBottomSheet.styled";
import { useDateSelection } from "../useDateSelection";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const CalendarTable = () => {
  const { calendar } = useDateSelection();
  const { date, setDate } = useRecommendationFormInput();
  const dayViewModels = useMemo(
    () => buildCalendarDayViewModels(calendar, { selectedDate: date }),
    [calendar, date],
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
              onClick={() => setDate(dayViewModel.date)}
            >
              <span style={{ lineHeight: 1, transform: "translateY(1px)" }}>
                {dayViewModel.day}
              </span>
            </S.DayButton>
          );
        })}
      </S.DayGrid>
    </S.Calendar>
  );
};

export default CalendarTable;
