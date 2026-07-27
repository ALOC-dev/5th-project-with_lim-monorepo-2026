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
  const [location, setLocation] = useState(() => getRecommendationFormInitialValues().location);
  const [date, setDate] = useState(() => getRecommendationFormInitialValues().date);
  const [time24h, setTime24h] = useState(() => getRecommendationFormInitialValues().time24h);
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
  const [userNaturalLanguageRequest, setUserNaturalLanguageRequest] = useState(
    () => getRecommendationFormInitialValues().userNaturalLanguageRequest,
  );
  const [activeSheet, setActiveSheet] = useState<RecommendationFormSheet | null>(null);

  const resetForm = useCallback(() => {
    const initialFormValues = getRecommendationFormInitialValues();

    setLocation(initialFormValues.location);
    setDate(initialFormValues.date);
    setTime24h(initialFormValues.time24h);
    setStayDurationMinutes(initialFormValues.stayDurationMinutes);
    setNumberOfPeople(initialFormValues.numberOfPeople);
    setPartyType(initialFormValues.partyType);
    setActivityType(initialFormValues.activityType);
    setBudgetPerPerson(initialFormValues.budgetPerPerson);
    setUserNaturalLanguageRequest(initialFormValues.userNaturalLanguageRequest);
    setActiveSheet("location");
  }, []);

  const buildUserInput = useCallback<RecommendationFormInputContextType["buildUserInput"]>(() => {
    return buildRecommendationUserInput({
      location,
      date,
      time24h,
      stayDurationMinutes,
      numberOfPeople,
      partyType,
      activityType,
      budgetPerPerson,
      userNaturalLanguageRequest,
    });
  }, [
    budgetPerPerson,
    date,
    numberOfPeople,
    partyType,
    activityType,
    stayDurationMinutes,
    time24h,
    userNaturalLanguageRequest,
    location,
  ]);

  const inputContextValue = useMemo<RecommendationFormInputContextType>(
    () => ({
      location,
      date,
      time24h,
      stayDurationMinutes,
      numberOfPeople,
      partyType,
      activityType,
      budgetPerPerson,
      userNaturalLanguageRequest,
      setLocation,
      setDate,
      setTime24h,
      setStayDurationMinutes,
      setNumberOfPeople,
      setPartyType,
      setActivityType,
      setBudgetPerPerson,
      setUserNaturalLanguageRequest,
      resetForm,
      buildUserInput,
    }),
    [
      budgetPerPerson,
      buildUserInput,
      date,
      location,
      numberOfPeople,
      partyType,
      activityType,
      resetForm,
      stayDurationMinutes,
      time24h,
      userNaturalLanguageRequest,
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
