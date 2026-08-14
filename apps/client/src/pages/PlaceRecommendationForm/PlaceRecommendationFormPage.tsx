import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import DateSelectionBottomSheet from "./components/date/DateSelectionBottomSheet";
import LocationSelectionBottomSheet from "./components/location/LocationSelectionBottomSheet";
import {
  getPlaceRecommendationFormInitialValues,
  getPlaceRecommendationRetryInitialValues,
  type PlaceRecommendationFormInitialValues,
} from "./initialValues";
import { buildPlaceRecommendationUserInput } from "./input";
import {
  PlaceRecommendationFormInputContext,
  type PlaceRecommendationFormInputContextType,
  type PlaceRecommendationFormSheet,
  PlaceRecommendationFormUiContext,
  type PlaceRecommendationFormUiContextType,
} from "./PlaceRecommendationForm.context";
import PlaceRecommendationFormContent from "./PlaceRecommendationFormContent";

const PlaceRecommendationFlowProvider = ({
  children,
  initialValues,
}: {
  readonly children: ReactNode;
  readonly initialValues: PlaceRecommendationFormInitialValues;
}) => {
  const [locations, setLocations] = useState<PlaceRecommendationFormInputContextType["locations"]>(
    () => [...initialValues.locations],
  );

  // 필수 입력 상태
  const [date, setDate] = useState(() => initialValues.date);
  const [time24h, setTime24h] = useState(() => initialValues.time24h);
  const [userNaturalLanguageRequest, setUserNaturalLanguageRequest] = useState(
    () => initialValues.userNaturalLanguageRequest,
  );

  // 선택 입력 값 상태
  const [stayDurationMinutes, setStayDurationMinutes] = useState(
    () => initialValues.stayDurationMinutes,
  );
  const [numberOfPeople, setNumberOfPeople] = useState(
    () => initialValues.numberOfPeople,
  );
  const [partyType, setPartyType] = useState(() => initialValues.partyType);
  const [activityType, setActivityType] = useState(
    () => initialValues.activityType,
  );
  const [budgetPerPerson, setBudgetPerPerson] = useState(
    () => initialValues.budgetPerPerson,
  );

  // 선택 입력 활성화(체크박스) 여부를 관리하는 boolean 상태
  const [isStayDurationEnabled, setIsStayDurationEnabled] = useState(
    () => initialValues.isStayDurationEnabled,
  );
  const [isActivityTypeEnabled, setIsActivityTypeEnabled] = useState(
    () => initialValues.isActivityTypeEnabled,
  );
  const [isNumberOfPeopleEnabled, setIsNumberOfPeopleEnabled] = useState(
    () => initialValues.isNumberOfPeopleEnabled,
  );
  const [isPartyTypeEnabled, setIsPartyTypeEnabled] = useState(
    () => initialValues.isPartyTypeEnabled,
  );
  const [isBudgetEnabled, setIsBudgetEnabled] = useState(
    () => initialValues.isBudgetEnabled,
  );

  const [activeSheet, setActiveSheet] = useState<PlaceRecommendationFormSheet | null>(null);

  const resetForm = useCallback(() => {
    const initialFormValues = getPlaceRecommendationFormInitialValues();

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

  const buildUserInput = useCallback<
    PlaceRecommendationFormInputContextType["buildUserInput"]
  >(() => {
    return buildPlaceRecommendationUserInput({
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

  const inputContextValue = useMemo<PlaceRecommendationFormInputContextType>(
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

  const openSheet = useCallback((sheet: PlaceRecommendationFormSheet) => {
    setActiveSheet(sheet);
  }, []);

  const closeSheet = useCallback(() => {
    setActiveSheet(null);
  }, []);

  const isSheetOpen = useCallback(
    (sheet: PlaceRecommendationFormSheet) => activeSheet === sheet,
    [activeSheet],
  );

  const uiContextValue = useMemo<PlaceRecommendationFormUiContextType>(
    () => ({
      activeSheet,
      openSheet,
      closeSheet,
      isSheetOpen,
    }),
    [activeSheet, closeSheet, isSheetOpen, openSheet],
  );

  return (
    <PlaceRecommendationFormInputContext.Provider value={inputContextValue}>
      <PlaceRecommendationFormUiContext.Provider value={uiContextValue}>
        {children}
      </PlaceRecommendationFormUiContext.Provider>
    </PlaceRecommendationFormInputContext.Provider>
  );
};

const PlaceRecommendationFormPage = () => {
  const location = useLocation();
  const initialValues =
    getPlaceRecommendationRetryInitialValues(location.state as unknown) ??
    getPlaceRecommendationFormInitialValues();

  return (
    <PlaceRecommendationFlowProvider initialValues={initialValues}>
      <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
        <PlaceRecommendationFormContent />
        <LocationSelectionBottomSheet />
        <DateSelectionBottomSheet />
      </PageRoot>
    </PlaceRecommendationFlowProvider>
  );
};

export default PlaceRecommendationFormPage;
