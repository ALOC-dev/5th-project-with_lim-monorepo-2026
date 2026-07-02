import { UserInputSchema } from "@monorepo/recommendation-engine/v1/contracts";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import LocationSelectionBottomSheet from "./components/location/LocationSelectionBottomSheet";
import {
  RecommendationFormInputContext,
  type RecommendationFormInputContextType,
  type RecommendationFormLocation,
  type RecommendationFormSheet,
  RecommendationFormUiContext,
  type RecommendationFormUiContextType,
} from "./RecommendationForm.context";

const getInitialLocation = (): RecommendationFormLocation => ({
  lat: 37.5665,
  lng: 126.978,
  roadNameAddress: "서울특별시 중구 세종대로 110",
});

const RecommendationFlowProvider = ({ children }: { readonly children: ReactNode }) => {
  const [location, setLocation] = useState(getInitialLocation);
  const [schedule, setSchedule] = useState<RecommendationFormInputContextType["schedule"]>(null);
  const [numberOfPeople, setNumberOfPeople] =
    useState<RecommendationFormInputContextType["numberOfPeople"]>(null);
  const [partyType, setPartyType] = useState<RecommendationFormInputContextType["partyType"]>(null);
  const [budgetPerPerson, setBudgetPerPerson] =
    useState<RecommendationFormInputContextType["budgetPerPerson"]>(null);
  const [userNaturalLanguageRequest, setUserNaturalLanguageRequest] = useState("");
  const [activeSheet, setActiveSheet] = useState<RecommendationFormSheet | null>("location");

  const resetForm = useCallback(() => {
    setLocation(getInitialLocation());
    setSchedule(null);
    setNumberOfPeople(null);
    setPartyType(null);
    setBudgetPerPerson(null);
    setUserNaturalLanguageRequest("");
    setActiveSheet("location");
  }, []);

  const buildUserInput = useCallback<RecommendationFormInputContextType["buildUserInput"]>(() => {
    if (!schedule || numberOfPeople === null || !partyType || !budgetPerPerson) {
      return null;
    }

    const parseResult = UserInputSchema.safeParse({
      schedule,
      location: [
        {
          lat: location.lat,
          lng: location.lng,
        },
      ],
      numberOfPeople,
      partyType,
      budgetPerPerson,
      userNaturalLanguageRequest,
    });

    return parseResult.success ? parseResult.data : null;
  }, [
    budgetPerPerson,
    location.lat,
    location.lng,
    numberOfPeople,
    partyType,
    schedule,
    userNaturalLanguageRequest,
  ]);

  const inputContextValue = useMemo<RecommendationFormInputContextType>(
    () => ({
      location,
      schedule,
      numberOfPeople,
      partyType,
      budgetPerPerson,
      userNaturalLanguageRequest,
      setLocation,
      setSchedule,
      setNumberOfPeople,
      setPartyType,
      setBudgetPerPerson,
      setUserNaturalLanguageRequest,
      resetForm,
      buildUserInput,
    }),
    [
      budgetPerPerson,
      buildUserInput,
      location,
      numberOfPeople,
      partyType,
      resetForm,
      schedule,
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
      <PageRoot backgroundColor={tokens.color.primary[500]}>
        <LocationSelectionBottomSheet />
      </PageRoot>
    </RecommendationFlowProvider>
  );
};

export default RecommendationFormPage;
