import BottomSheet from "../../../../components/BottomSheet/BottomSheet";
import { usePlaceRecommendationFormUi } from "../../PlaceRecommendationForm.context";
import CalendarTable from "./CalendarTable/CalendarTable";
import { S } from "./DateSelectionBottomSheet.styled";
import { DateSelectionProvider } from "./DateSelectionProvider";
import MonthSelector from "./MonthSelector/MonthSelector";
import { useDateSelection } from "./useDateSelection";

const DateSelectionBottomSheet = () => {
  const { isSheetOpen, closeSheet } = usePlaceRecommendationFormUi();

  return (
    <BottomSheet isOpen={isSheetOpen("date")} close={closeSheet} id="date-selection">
      <DateSelectionProvider>
        <DateSelectionBottomSheetContent />
      </DateSelectionProvider>
    </BottomSheet>
  );
};

const DateSelectionBottomSheetContent = () => {
  const { closeSheet } = usePlaceRecommendationFormUi();
  const { confirmDate, selectedDate } = useDateSelection();

  const handleConfirm = () => {
    confirmDate();
    closeSheet();
  };

  return (
    <S.Wrapper>
      <S.Title>날짜 선택</S.Title>
      <MonthSelector />
      <CalendarTable />
      <S.Footer>
        <S.CancelButton type="button" onClick={closeSheet}>
          취소
        </S.CancelButton>
        <S.ConfirmButton disabled={selectedDate === null} type="button" onClick={handleConfirm}>
          선택 완료
        </S.ConfirmButton>
      </S.Footer>
    </S.Wrapper>
  );
};

export default DateSelectionBottomSheet;
