import type { KeyboardEvent, Ref } from "react";
import { useMemo, useState } from "react";

import BottomSheet from "../BottomSheet/BottomSheet";
import { Icon } from "../Icon";
import { Input } from "../Input";
import {
  buildCalendarDayViewModels,
  type CalendarMonth,
  canMoveCalendarMonth,
  formatDateLabel,
  getCalendarMonth,
  getLocalTodayDateISO,
  moveCalendarMonth,
} from "./calendar";
import { S } from "./DatePicker.styled";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type DatePickerProps = {
  readonly value: string | null;
  readonly onChange: (value: string) => void;
  readonly minDate: string;
  readonly maxDate?: string;
  readonly inputId: string;
  readonly sheetId: string;
  readonly placeholder?: string;
  readonly ariaDescribedBy?: string;
  readonly ariaInvalid?: boolean;
  readonly inputRef?: Ref<HTMLInputElement>;
};

export const DatePicker = ({
  value,
  onChange,
  minDate,
  maxDate,
  inputId,
  sheetId,
  placeholder = "날짜를 선택해주세요",
  ariaDescribedBy,
  ariaInvalid,
  inputRef,
}: DatePickerProps) => {
  const initialMonth =
    getCalendarMonth(value ?? minDate) ?? getCalendarMonth(getLocalTodayDateISO());
  const [isOpen, setOpen] = useState(false);
  const [calendar, setCalendar] = useState<CalendarMonth>(
    () => initialMonth ?? { year: 1970, month: 1 },
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(value);

  const open = () => {
    setSelectedDate(value);
    const nextMonth = getCalendarMonth(value ?? minDate);
    if (nextMonth) setCalendar(nextMonth);
    setOpen(true);
  };

  const days = useMemo(
    () => buildCalendarDayViewModels(calendar, { selectedDate, minDate, maxDate }),
    [calendar, maxDate, minDate, selectedDate],
  );
  const canGoPrevious = canMoveCalendarMonth(calendar, -1, minDate, maxDate);
  const canGoNext = canMoveCalendarMonth(calendar, 1, minDate, maxDate);

  const close = () => setOpen(false);
  const confirm = () => {
    if (!selectedDate) return;
    onChange(selectedDate);
    close();
  };
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "ArrowDown") return;
    event.preventDefault();
    open();
  };

  return (
    <>
      <S.InputWrapper>
        <Input
          aria-controls={sheetId}
          aria-describedby={ariaDescribedBy}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-invalid={ariaInvalid}
          id={inputId}
          onClick={open}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          readOnly
          ref={inputRef}
          value={value ? formatDateLabel(value) : ""}
        />
      </S.InputWrapper>
      <BottomSheet ariaLabel="날짜 선택" close={close} id={sheetId} isModal isOpen={isOpen}>
        <S.Wrapper>
          <S.Title>날짜 선택</S.Title>
          <S.MonthSelector>
            <S.MonthButton
              aria-label="이전 달"
              disabled={!canGoPrevious}
              onClick={() => setCalendar((current) => moveCalendarMonth(current, -1))}
              type="button"
            >
              <Icon name="chevron-left" size={28} />
            </S.MonthButton>
            <S.MonthLabel>{`${calendar.year}년 ${calendar.month}월`}</S.MonthLabel>
            <S.MonthButton
              aria-label="다음 달"
              disabled={!canGoNext}
              onClick={() => setCalendar((current) => moveCalendarMonth(current, 1))}
              type="button"
            >
              <Icon name="chevron-right" size={28} />
            </S.MonthButton>
          </S.MonthSelector>
          <S.Calendar>
            <S.WeekdayRow>
              {WEEKDAY_LABELS.map((weekday) => (
                <S.WeekdayCell key={weekday}>{weekday}</S.WeekdayCell>
              ))}
            </S.WeekdayRow>
            <S.DayGrid>
              {days.map((day) =>
                day.kind === "empty" ? (
                  <S.EmptyDay aria-hidden key={day.key} />
                ) : (
                  <S.DayButton
                    $isSelected={day.isSelected}
                    $isToday={day.isToday}
                    aria-label={`${calendar.month}월 ${day.day}일`}
                    aria-pressed={day.isSelected}
                    disabled={day.isDisabled}
                    key={day.dateISO}
                    onClick={() => setSelectedDate(day.dateISO)}
                    type="button"
                  >
                    <span>{day.day}</span>
                    {day.isSelected ? <S.SelectedMark aria-hidden>✓</S.SelectedMark> : null}
                  </S.DayButton>
                ),
              )}
            </S.DayGrid>
          </S.Calendar>
          <S.Footer>
            <S.CancelButton onClick={close} type="button">
              취소
            </S.CancelButton>
            <S.ConfirmButton disabled={!selectedDate} onClick={confirm} type="button">
              선택 완료
            </S.ConfirmButton>
          </S.Footer>
        </S.Wrapper>
      </BottomSheet>
    </>
  );
};
