import BottomSheet from "../../../../components/BottomSheet/BottomSheet";
import { theme } from "../../../../design-system/theme.generated";
import {
  type RecommendationFormDate,
  useRecommendationFormInput,
  useRecommendationFormUi,
} from "../../RecommendationForm.context";
import CalendarTable from "./CalendarTable/CalendarTable";
import { S } from "./DateSelectionBottomSheet.styled";
import { DateSelectionProvider } from "./DateSelectionProvider";
import MonthSelector from "./MonthSelector/MonthSelector";

const getConfirmButtonText = (date: RecommendationFormDate | null) => {
  if (date === null) {
    return "닫기";
  }

  return `${date.month}월 ${date.day}일로 선택 완료`;
};

const DateSelectionBottomSheet = () => {
  const { isSheetOpen, closeSheet } = useRecommendationFormUi();
  const { date } = useRecommendationFormInput();

  return (
    <BottomSheet isOpen={isSheetOpen("date")} close={closeSheet} id="date-selection">
      <DateSelectionProvider>
        <S.Wrapper>
          <S.Title>날짜 선택</S.Title>
          <MonthSelector />
          <CalendarTable />
          <S.Footer>
            <S.ConfirmButton type="button" onClick={closeSheet}>
              {getConfirmButtonText(date)}
            </S.ConfirmButton>
          </S.Footer>
        </S.Wrapper>
      </DateSelectionProvider>
    </BottomSheet>
  );
};

export default DateSelectionBottomSheet;
