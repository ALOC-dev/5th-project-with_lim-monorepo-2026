import { Icon } from "../../../../../components/Icon";
import { S } from "../DateSelectionBottomSheet.styled";
import { useDateSelection } from "../useDateSelection";

const MonthSelector = () => {
  const { calendar, canGoToPreviousMonth, goToNextMonth, goToPreviousMonth } = useDateSelection();

  return (
    <S.MonthSelector>
      <S.MonthButton
        aria-label="이전 달"
        disabled={!canGoToPreviousMonth}
        onClick={goToPreviousMonth}
        type="button"
      >
        <Icon name="chevron-left" size={28} />
      </S.MonthButton>
      <S.MonthLabel>{`${calendar.year}년 ${calendar.month}월`}</S.MonthLabel>
      <S.MonthButton type="button" aria-label="다음 달" onClick={goToNextMonth}>
        <Icon name="chevron-right" size={28} />
      </S.MonthButton>
    </S.MonthSelector>
  );
};

export default MonthSelector;
