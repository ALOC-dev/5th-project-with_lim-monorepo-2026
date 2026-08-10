import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import DateSelectionBottomSheet from "./components/date/DateSelectionBottomSheet";
import LocationSelectionBottomSheet from "./components/location/LocationSelectionBottomSheet";
import FormContent from "./FormContent";
import { getRecommendationFormInitialValues } from "./initialValues";
import { buildRecommendationUserInput } from "./input";
import {
  RecommendationFormInputContext,
  type RecommendationFormInputContextType,
  type RecommendationFormSheet,
  RecommendationFormUiContext,
  type RecommendationFormUiContextType,
} from "./RecommendationForm.context";

const RecommendationFlowProvider = ({ children }: { readonly children: ReactNode }) => {
  const [locations, setLocations] = useState<RecommendationFormInputContextType["locations"]>(
    () => getRecommendationFormInitialValues().locations || [],
  );

  // 필수 입력 상태
  const [date, setDate] = useState(() => getRecommendationFormInitialValues().date);
  const [time24h, setTime24h] = useState(() => getRecommendationFormInitialValues().time24h);
  const [userNaturalLanguageRequest, setUserNaturalLanguageRequest] = useState(
    () => getRecommendationFormInitialValues().userNaturalLanguageRequest,
  );

  // 선택 입력 값 상태
  const [stayDurationMinutes, setStayDurationMinutes] = useState(
    () => getRecommendationFormInitialValues().stayDurationMinutes,
  );
  const [numberOfPeople, setNumberOfPeople] = useState(
    () => getRecommendationFormInitialValues().numberOfPeople,
  );
  const [partyType, setPartyType] = useState(() => getRecommendationFormInitialValues().partyType);
  const [activityType, setActivityType] = useState(
    () => getRecommendationFormInitialValues().activityType,
  );
  const [budgetPerPerson, setBudgetPerPerson] = useState(
    () => getRecommendationFormInitialValues().budgetPerPerson,
  );

  // 선택 입력 활성화(체크박스) 여부를 관리하는 boolean 상태
  const [isStayDurationEnabled, setIsStayDurationEnabled] = useState(false);
  const [isActivityTypeEnabled, setIsActivityTypeEnabled] = useState(false);
  const [isNumberOfPeopleEnabled, setIsNumberOfPeopleEnabled] = useState(false);
  const [isPartyTypeEnabled, setIsPartyTypeEnabled] = useState(false);
  const [isBudgetEnabled, setIsBudgetEnabled] = useState(false);

  const [activeSheet, setActiveSheet] = useState<RecommendationFormSheet | null>(null);

  const resetForm = useCallback(() => {
    const initialFormValues = getRecommendationFormInitialValues();

    setLocations(initialFormValues.locations || []);
    setDate(initialFormValues.date);
    setTime24h(initialFormValues.time24h);
    setUserNaturalLanguageRequest(initialFormValues.userNaturalLanguageRequest);

    setStayDurationMinutes(initialFormValues.stayDurationMinutes);
    setNumberOfPeople(initialFormValues.numberOfPeople);
    setPartyType(initialFormValues.partyType);
    setActivityType(initialFormValues.activityType);
    setBudgetPerPerson(initialFormValues.budgetPerPerson);

    setIsStayDurationEnabled(false);
    setIsActivityTypeEnabled(false);
    setIsNumberOfPeopleEnabled(false);
    setIsPartyTypeEnabled(false);
    setIsBudgetEnabled(false);

    setActiveSheet("location");
  }, []);

  const buildUserInput = useCallback<RecommendationFormInputContextType["buildUserInput"]>(() => {
    return buildRecommendationUserInput({
      locations,
      date,
      time24h,
      userNaturalLanguageRequest,

      // 체크박스가 활성화된 경우에만 해당 값을 전달, 아니면 null 처리
      stayDurationMinutes: isStayDurationEnabled ? stayDurationMinutes : null,
      numberOfPeople: isNumberOfPeopleEnabled ? numberOfPeople : null,
      partyType: isPartyTypeEnabled ? partyType : null,
      activityType: isActivityTypeEnabled ? activityType : null,
      budgetPerPerson: isBudgetEnabled ? budgetPerPerson : null,
    });
  }, [
    locations,
    date,
    time24h,
    userNaturalLanguageRequest,
    stayDurationMinutes,
    isStayDurationEnabled,
    numberOfPeople,
    isNumberOfPeopleEnabled,
    partyType,
    isPartyTypeEnabled,
    activityType,
    isActivityTypeEnabled,
    budgetPerPerson,
    isBudgetEnabled,
  ]);

  const inputContextValue = useMemo<RecommendationFormInputContextType>(
    () => ({
      locations,
      date,
      time24h,
      userNaturalLanguageRequest,
      stayDurationMinutes,
      numberOfPeople,
      partyType,
      activityType,
      budgetPerPerson,

      isStayDurationEnabled,
      isActivityTypeEnabled,
      isNumberOfPeopleEnabled,
      isPartyTypeEnabled,
      isBudgetEnabled,

      setLocations,
      setDate,
      setTime24h,
      setUserNaturalLanguageRequest,
      setStayDurationMinutes,
      setNumberOfPeople,
      setPartyType,
      setActivityType,
      setBudgetPerPerson,

      setIsStayDurationEnabled,
      setIsActivityTypeEnabled,
      setIsNumberOfPeopleEnabled,
      setIsPartyTypeEnabled,
      setIsBudgetEnabled,

      resetForm,
      buildUserInput,
    }),
    [
      locations,
      date,
      time24h,
      userNaturalLanguageRequest,
      stayDurationMinutes,
      numberOfPeople,
      partyType,
      activityType,
      budgetPerPerson,
      isStayDurationEnabled,
      isActivityTypeEnabled,
      isNumberOfPeopleEnabled,
      isPartyTypeEnabled,
      isBudgetEnabled,
      resetForm,
      buildUserInput,
    ],
  );

  const openSheet = useCallback((sheet: RecommendationFormSheet) => {
    setActiveSheet(sheet);
  }, []);

  const closeSheet = useCallback(() => {
    setActiveSheet(null);
  }, []);

  const isSheetOpen = useCallback(
    (sheet: RecommendationFormSheet) => activeSheet === sheet,
    [activeSheet],
  );

  const uiContextValue = useMemo<RecommendationFormUiContextType>(
    () => ({
      activeSheet,
      openSheet,
      closeSheet,
      isSheetOpen,
    }),
    [activeSheet, closeSheet, isSheetOpen, openSheet],
  );

  return (
    <RecommendationFormInputContext.Provider value={inputContextValue}>
      <RecommendationFormUiContext.Provider value={uiContextValue}>
        {children}
      </RecommendationFormUiContext.Provider>
    </RecommendationFormInputContext.Provider>
  );
};

const RecommendationFormPage = () => {
  return (
    <RecommendationFlowProvider>
      <PageRoot backgroundColor={tokens.color.neutral[50]}>
        <FormContent />
        <LocationSelectionBottomSheet />
        <DateSelectionBottomSheet />
      </PageRoot>
    </RecommendationFlowProvider>
  );
};

export default RecommendationFormPage;
