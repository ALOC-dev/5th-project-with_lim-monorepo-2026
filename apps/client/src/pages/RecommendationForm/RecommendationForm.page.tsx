import { UserInputSchema } from "@monorepo/recommendation-engine/v1/contracts";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

import FormContent from "../../components/FormContent";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import DateSelectionBottomSheet from "./components/date/DateSelectionBottomSheet";
import LocationSelectionBottomSheet from "./components/location/LocationSelectionBottomSheet";
import {
  RecommendationFormInputContext,
  type RecommendationFormInputContextType,
  type RecommendationFormLocation,
  type RecommendationFormSheet,
  RecommendationFormUiContext,
  type RecommendationFormUiContextType,
} from "./RecommendationForm.context";
import { toDateISO } from "./utils/calendarDayViewModel";

const getInitialLocation = (): RecommendationFormLocation => ({
  lat: 37.5665,
  lng: 126.978,
  roadNameAddress: "서울특별시 중구 세종대로 110",
});

const RecommendationFlowProvider = ({ children }: { readonly children: ReactNode }) => {
  const [location, setLocation] = useState(getInitialLocation);
  const [date, setDate] = useState<RecommendationFormInputContextType["date"]>(null);
  const [time24h, setTime24h] = useState<RecommendationFormInputContextType["time24h"]>(null);
  const [stayDurationMinutes, setStayDurationMinutes] =
    useState<RecommendationFormInputContextType["stayDurationMinutes"]>(null);
  const [numberOfPeople, setNumberOfPeople] =
    useState<RecommendationFormInputContextType["numberOfPeople"]>(null);
  const [partyType, setPartyType] = useState<RecommendationFormInputContextType["partyType"]>(null);
  const [activityType, setActivityType] = useState<RecommendationFormInputContextType["activityType"]>(null);
  const [budgetPerPerson, setBudgetPerPerson] =
    useState<RecommendationFormInputContextType["budgetPerPerson"]>(null);
  const [userNaturalLanguageRequest, setUserNaturalLanguageRequest] = useState("");
  const [activeSheet, setActiveSheet] = useState<RecommendationFormSheet | null>(null);

  const resetForm = useCallback(() => {
    setLocation(getInitialLocation());
    setDate(null);
    setTime24h(null);
    setStayDurationMinutes(null);
    setNumberOfPeople(null);
    setPartyType(null);
    setActivityType(null);
    setBudgetPerPerson(null);
    setUserNaturalLanguageRequest("");
    setActiveSheet("location");
  }, []);

  const buildUserInput = useCallback<RecommendationFormInputContextType["buildUserInput"]>(() => {
    if (
      date === null ||
      time24h === null ||
      stayDurationMinutes === null ||
      numberOfPeople === null ||
      !partyType ||
      !activityType ||
      !budgetPerPerson
    ) {
      return null;
    }

    const parseResult = UserInputSchema.safeParse({
      schedule: {
        dateISO: toDateISO(date),
        time24h,
        stayDurationMinutes,
      },
      location: [
        {
          lat: location.lat,
          lng: location.lng,
        },
      ],
      numberOfPeople,
      partyType,
      activityType,
      budgetPerPerson,
      userNaturalLanguageRequest,
    });

    return parseResult.success ? parseResult.data : null;
  }, [
    budgetPerPerson,
    date,
    location.lat,
    location.lng,
    numberOfPeople,
    partyType,
    activityType,
    stayDurationMinutes,
    time24h,
    userNaturalLanguageRequest,
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
