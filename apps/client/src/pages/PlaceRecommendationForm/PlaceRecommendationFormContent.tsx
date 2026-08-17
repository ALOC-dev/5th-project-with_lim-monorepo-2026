import {
  ActivityTypeSchema,
  BudgetRangeSchema,
  PartyTypeSchema,
} from "@monorepo/recommendation-engine/v1/contracts";
import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";

import { createPlaceRecommendationJob } from "../../apis/server/placeRecommendation";
import { Button } from "../../components/Button";
import { fromDateISO, getLocalTodayDateISO, toDateISO } from "../../components/DatePicker/calendar";
import { DatePicker } from "../../components/DatePicker/DatePicker";
import { Dropdown, type DropdownOption } from "../../components/Dropdown";
import Header from "../../components/Header/Header";
import { RangeSlider } from "../../components/Rangeslider";
import {
  MIDNIGHT_HOUR_OPTION,
  NUMBER_OF_PEOPLE_OPTIONS,
  TIME_HOUR_OPTIONS,
  TIME_MINUTE_OPTIONS,
} from "../../components/recommendationFormOptions";
import { useAppBackNavigate, useAppNavigate } from "../../routes/useAppNavigate";
import { dispatchPlaceRecommendationRequest } from "./input";
import {
  usePlaceRecommendationFormInput,
  usePlaceRecommendationFormUi,
} from "./PlaceRecommendationForm.context";
import { S } from "./PlaceRecommendationFormContent.styled";

const ACTIVITY_OPTIONS: DropdownOption[] = [
  { label: "식사", value: "MEAL" },
  { label: "카페", value: "CAFE" },
  { label: "술자리", value: "DRINK" },
  { label: "문화/액티비티", value: "ACTIVITY" },
];

const PARTY_OPTIONS: DropdownOption[] = [
  { label: "친구", value: "FRIENDS" },
  { label: "가족", value: "FAMILY" },
  { label: "연인", value: "LOVERS" },
  { label: "동료", value: "COLLEAGUES" },
];

const HOUR_OPTIONS: readonly DropdownOption[] = [...TIME_HOUR_OPTIONS, MIDNIGHT_HOUR_OPTION];
const MINUTE_OPTIONS = TIME_MINUTE_OPTIONS;

const STAY_DURATION_OPTIONS: readonly DropdownOption[] = Array.from({ length: 24 }, (_, index) => {
  const value = (index + 1) * 15;
  return { label: `${value}분`, value: String(value) };
});

const ALPHABETS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("ko-KR").format(value) + "원";
};

const PlaceRecommendationFormContent = () => {
  const {
    locations,
    setLocations,
    date,
    setDate,
    time24h,
    setTime24h,
    userNaturalLanguageRequest,
    setUserNaturalLanguageRequest,

    stayDurationMinutes,
    setStayDurationMinutes,
    numberOfPeople,
    setNumberOfPeople,
    partyType,
    setPartyType,
    activityType,
    setActivityType,
    budgetPerPerson,
    setBudgetPerPerson,

    isStayDurationEnabled,
    setIsStayDurationEnabled,
    isActivityTypeEnabled,
    setIsActivityTypeEnabled,
    isNumberOfPeopleEnabled,
    setIsNumberOfPeopleEnabled,
    isPartyTypeEnabled,
    setIsPartyTypeEnabled,
    isBudgetEnabled,
    setIsBudgetEnabled,

    buildUserInput,
  } = usePlaceRecommendationFormInput();

  const { openSheet } = usePlaceRecommendationFormUi();
  const navigate = useAppNavigate();
  const navigateBack = useAppBackNavigate("/");

  const stayDurationSelectRef = useRef<HTMLSelectElement>(null);
  const activityTypeSelectRef = useRef<HTMLSelectElement>(null);
  const numberOfPeopleSelectRef = useRef<HTMLSelectElement>(null);
  const partyTypeSelectRef = useRef<HTMLSelectElement>(null);

  const recommendationMutation = useMutation({
    mutationFn: createPlaceRecommendationJob,
    onSuccess: (response) => {
      if (!response.success) {
        return;
      }
      void navigate(`/place/recommendation/${encodeURIComponent(response.data.jobId)}`, {
        replace: true,
      });
    },
  });

  const dateISO = date ? toDateISO(date) : null;
  const [timeHour = "", timeMinute = ""] = (time24h ?? "").split(":");
  const minuteOptions = timeHour === "24" ? MINUTE_OPTIONS.slice(0, 1) : MINUTE_OPTIONS;

  const formUserInput = buildUserInput();
  const canSubmit = formUserInput !== null && !recommendationMutation.isPending;
  const submitErrorMessage =
    recommendationMutation.data?.success === false ? recommendationMutation.data.error : null;

  const handleRecommendationClick = () => {
    const userInput = buildUserInput();
    if (userInput === null) return;

    dispatchPlaceRecommendationRequest(userInput, (requestInput) => {
      recommendationMutation.mutate({
        input: requestInput,
        formLocations: locations.map(({ lat, lng, placeName, roadNameAddress }) => ({
          lat,
          lng,
          ...(placeName ? { placeName } : {}),
          roadNameAddress,
        })),
      });
    });
  };

  const handleRemoveLocation = (indexToRemove: number) => {
    setLocations((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <S.RootContainer>
      <Header title="장소 추천" onBack={navigateBack} />
      <S.ScrollContent>
        <S.RequiredNotice>*필수 입력</S.RequiredNotice>

        <S.FormRow>
          <S.FormLabel htmlFor="form-date" $required>
            날짜
          </S.FormLabel>
          <DatePicker
            inputId="form-date"
            minDate={getLocalTodayDateISO()}
            onChange={(nextDateISO) => {
              const nextDate = fromDateISO(nextDateISO);
              if (nextDate) setDate(nextDate);
            }}
            sheetId="place-date-selection"
            value={dateISO}
          />
        </S.FormRow>

        <S.FormRow>
          <S.FormLabel $required>시각</S.FormLabel>
          <S.TimeSelection aria-label="시각 선택">
            <Dropdown
              ariaLabel="시각(시)"
              onChange={(hour) => {
                setTime24h(`${hour}:${hour === "24" ? "00" : timeMinute || "00"}`);
              }}
              options={HOUR_OPTIONS}
              placeholder="시"
              value={timeHour || undefined}
            />
            <S.TimeSeparator aria-hidden>:</S.TimeSeparator>
            <Dropdown
              ariaLabel="시각(분)"
              disabled={!timeHour}
              onChange={(minute) => setTime24h(`${timeHour}:${minute}`)}
              options={minuteOptions}
              placeholder="분"
              value={timeMinute || undefined}
            />
          </S.TimeSelection>
        </S.FormRow>

        <S.LocationSection>
          <S.LocationHeader>
            <S.FormLabel $required>출발지</S.FormLabel>
            <S.LocationCount>출발지 {locations.length} / 8</S.LocationCount>
          </S.LocationHeader>
          <S.LocationList>
            {locations.map((loc, idx) => (
              <S.LocationItem key={idx}>
                <S.LocationBadge>{ALPHABETS[idx]}</S.LocationBadge>
                <S.LocationText>{loc.roadNameAddress}</S.LocationText>
                <S.RemoveButton
                  aria-label={`${loc.roadNameAddress} 출발지 삭제`}
                  type="button"
                  onClick={() => handleRemoveLocation(idx)}
                >
                  ✕
                </S.RemoveButton>
              </S.LocationItem>
            ))}
          </S.LocationList>
          {locations.length < 8 && (
            <S.AddLocationButton type="button" onClick={() => openSheet("location")}>
              + 출발지 추가
            </S.AddLocationButton>
          )}
        </S.LocationSection>

        <S.TextareaContainer>
          <S.FormLabel htmlFor="place-request" $required>
            요청사항
          </S.FormLabel>
          <S.StyledTextarea
            id="place-request"
            value={userNaturalLanguageRequest}
            onChange={(e) => setUserNaturalLanguageRequest(e.target.value)}
            placeholder="예 : 대화하기 좋은 저녁 식사 장소를 추천해주세요."
          />
        </S.TextareaContainer>

        <S.OptionalSection>
          <S.OptionalRow>
            <S.Checkbox
              id="place-stay-duration-enabled"
              type="checkbox"
              checked={isStayDurationEnabled}
              onChange={(e) => {
                if (e.target.checked) {
                  setIsStayDurationEnabled(true);
                  stayDurationSelectRef.current?.focus();
                  return;
                }
                setIsStayDurationEnabled(false);
                setStayDurationMinutes(null);
              }}
            />
            <S.OptionalLabel htmlFor="place-stay-duration-enabled">
              머무는 시간 (분)
            </S.OptionalLabel>
            <Dropdown
              ariaLabel="머무는 시간(분)"
              ref={stayDurationSelectRef}
              value={stayDurationMinutes === null ? undefined : String(stayDurationMinutes)}
              onChange={(value) => {
                const parsedStayDuration = Number(value);
                if (Number.isInteger(parsedStayDuration) && parsedStayDuration > 0) {
                  setStayDurationMinutes(parsedStayDuration);
                  setIsStayDurationEnabled(true);
                  return;
                }
                setStayDurationMinutes(null);
                setIsStayDurationEnabled(false);
              }}
              onBlur={(e) => {
                if (e.currentTarget.value === "") setIsStayDurationEnabled(false);
              }}
              onFocus={() => setIsStayDurationEnabled(true)}
              options={STAY_DURATION_OPTIONS}
              placeholder="선택"
            />
          </S.OptionalRow>

          <S.OptionalRow>
            <S.Checkbox
              id="place-activity-enabled"
              type="checkbox"
              checked={isActivityTypeEnabled}
              onChange={(e) => {
                if (e.target.checked) {
                  setIsActivityTypeEnabled(true);
                  activityTypeSelectRef.current?.focus();
                  return;
                }
                setIsActivityTypeEnabled(false);
                setActivityType(null);
              }}
            />
            <S.OptionalLabel htmlFor="place-activity-enabled">활동 유형</S.OptionalLabel>
            <Dropdown
              ariaLabel="활동 유형"
              ref={activityTypeSelectRef}
              value={activityType || undefined}
              onBlur={(e) => {
                if (e.currentTarget.value === "") setIsActivityTypeEnabled(false);
              }}
              onFocus={() => setIsActivityTypeEnabled(true)}
              onChange={(val) => {
                const res = ActivityTypeSchema.safeParse(val);
                if (res.success) {
                  setActivityType(res.data);
                  setIsActivityTypeEnabled(true);
                  return;
                }
                setActivityType(null);
                setIsActivityTypeEnabled(false);
              }}
              options={ACTIVITY_OPTIONS}
              placeholder="선택"
            />
          </S.OptionalRow>

          <S.OptionalRow>
            <S.Checkbox
              id="place-people-enabled"
              type="checkbox"
              checked={isNumberOfPeopleEnabled}
              onChange={(e) => {
                if (e.target.checked) {
                  setIsNumberOfPeopleEnabled(true);
                  numberOfPeopleSelectRef.current?.focus();
                  return;
                }
                setIsNumberOfPeopleEnabled(false);
                setNumberOfPeople(null);
              }}
            />
            <S.OptionalLabel htmlFor="place-people-enabled">인원</S.OptionalLabel>
            <Dropdown
              ariaLabel="인원"
              ref={numberOfPeopleSelectRef}
              value={numberOfPeople === null ? undefined : String(numberOfPeople)}
              onBlur={(e) => {
                if (e.currentTarget.value === "") setIsNumberOfPeopleEnabled(false);
              }}
              onFocus={() => setIsNumberOfPeopleEnabled(true)}
              onChange={(value) => {
                const parsedNumberOfPeople = Number(value);
                if (
                  Number.isInteger(parsedNumberOfPeople) &&
                  parsedNumberOfPeople >= 1 &&
                  parsedNumberOfPeople <= 20
                ) {
                  setNumberOfPeople(parsedNumberOfPeople);
                  setIsNumberOfPeopleEnabled(true);
                  return;
                }
                setNumberOfPeople(null);
                setIsNumberOfPeopleEnabled(false);
              }}
              options={NUMBER_OF_PEOPLE_OPTIONS}
              placeholder="선택"
            />
          </S.OptionalRow>

          <S.OptionalRow>
            <S.Checkbox
              id="place-party-enabled"
              type="checkbox"
              checked={isPartyTypeEnabled}
              onChange={(e) => {
                if (e.target.checked) {
                  setIsPartyTypeEnabled(true);
                  partyTypeSelectRef.current?.focus();
                  return;
                }
                setIsPartyTypeEnabled(false);
                setPartyType(null);
              }}
            />
            <S.OptionalLabel htmlFor="place-party-enabled">관계 유형</S.OptionalLabel>
            <Dropdown
              ariaLabel="관계 유형"
              ref={partyTypeSelectRef}
              value={partyType || undefined}
              onBlur={(e) => {
                if (e.currentTarget.value === "") setIsPartyTypeEnabled(false);
              }}
              onFocus={() => setIsPartyTypeEnabled(true)}
              options={PARTY_OPTIONS}
              onChange={(val) => {
                const res = PartyTypeSchema.safeParse(val);
                if (res.success) {
                  setPartyType(res.data);
                  setIsPartyTypeEnabled(true);
                  return;
                }
                setPartyType(null);
                setIsPartyTypeEnabled(false);
              }}
              placeholder="선택"
            />
          </S.OptionalRow>

          <S.OptionalRow>
            <S.Checkbox
              id="place-budget-enabled"
              type="checkbox"
              checked={isBudgetEnabled}
              onChange={(e) => {
                setIsBudgetEnabled(e.target.checked);
              }}
            />
            <S.OptionalLabel htmlFor="place-budget-enabled">예산</S.OptionalLabel>
            <S.BudgetWrapper $disabled={!isBudgetEnabled} aria-disabled={!isBudgetEnabled}>
              <S.BudgetAmountText>
                {formatCurrency(budgetPerPerson?.[0] ?? 20000)} ~{" "}
                {formatCurrency(budgetPerPerson?.[1] ?? 40000)}
              </S.BudgetAmountText>
              <RangeSlider
                ariaLabels={["최소 예산", "최대 예산"]}
                disabled={!isBudgetEnabled}
                min={0}
                max={150000}
                step={5000}
                value={budgetPerPerson || [20000, 40000]}
                onChange={(newValue) => {
                  const res = BudgetRangeSchema.safeParse(newValue);
                  if (res.success) {
                    setBudgetPerPerson(res.data);
                    setIsBudgetEnabled(true);
                  }
                }}
              />
            </S.BudgetWrapper>
          </S.OptionalRow>
        </S.OptionalSection>
      </S.ScrollContent>

      <S.ButtonWrapper>
        {submitErrorMessage !== null && (
          <S.SubmitErrorMessage role="alert">{submitErrorMessage}</S.SubmitErrorMessage>
        )}
        <Button
          type="button"
          width="100%"
          disabled={!canSubmit}
          onClick={handleRecommendationClick}
        >
          {recommendationMutation.isPending ? "추천 요청 중..." : "추천 받기"}
        </Button>
      </S.ButtonWrapper>
    </S.RootContainer>
  );
};

export default PlaceRecommendationFormContent;
