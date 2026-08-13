import {
  ActivityTypeSchema,
  BudgetRangeSchema,
  PartyTypeSchema,
} from "@monorepo/recommendation-engine/v1/contracts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { createPlaceRecommendationJob } from "../../apis/server/placeRecommendation";
import { Button } from "../../components/Button";
import { Dropdown, type DropdownOption } from "../../components/Dropdown";
import Header from "../../components/Header/Header";
import { Input } from "../../components/Input";
import Modal from "../../components/Modal/Modal";
import { RangeSlider } from "../../components/Rangeslider";
import { useAppNavigate } from "../../routes/useAppNavigate";
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

const HOUR_OPTIONS: DropdownOption[] = Array.from({ length: 25 }, (_, hour) => {
  const value = String(hour).padStart(2, "0");
  return { label: `${value}시`, value };
});

const MINUTE_OPTIONS: DropdownOption[] = ["00", "15", "30", "45"].map((value) => ({
  label: `${value}분`,
  value,
}));

const ALPHABETS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("ko-KR").format(value) + "원";
};

const getDayOfWeek = (year: number, month: number, day: number) => {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return days[new Date(year, month - 1, day).getDay()];
};

const PlaceRecommendationFormContent = () => {
  const {
    locations,
    setLocations,
    date,
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

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const recommendationMutation = useMutation({
    mutationFn: createPlaceRecommendationJob,
    onSuccess: (response) => {
      if (!response.success) {
        return;
      }
      void navigate(`/place/recommendation/${encodeURIComponent(response.data.jobId)}`);
    },
  });

  const formattedDate = date
    ? `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")} (${getDayOfWeek(date.year, date.month, date.day)})`
    : "";
  const [timeHour = "", timeMinute = ""] = (time24h ?? "").split(":");
  const minuteOptions = timeHour === "24" ? MINUTE_OPTIONS.slice(0, 1) : MINUTE_OPTIONS;

  const formUserInput = buildUserInput();
  const canSubmit = formUserInput !== null && !recommendationMutation.isPending;
  const submitErrorMessage =
    recommendationMutation.data?.success === false ? recommendationMutation.data.error : null;

  const handleRecommendationClick = () => {
    const userInput = buildUserInput();
    if (userInput === null) return;
    setIsConfirmModalOpen(true);
  };

  const handleConfirmSubmit = () => {
    setIsConfirmModalOpen(false);
    const userInput = buildUserInput();
    if (userInput === null) return;

    dispatchPlaceRecommendationRequest(userInput, (requestInput) => {
      recommendationMutation.mutate(requestInput);
    });
  };

  const handleRemoveLocation = (indexToRemove: number) => {
    setLocations((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <S.RootContainer>
      <Header title="장소 추천" onBack={() => navigate(-1)} />
      <S.ScrollContent>
        <S.RequiredNotice>*필수 입력</S.RequiredNotice>

        <S.FormRow>
          <S.FormLabel htmlFor="form-date" $required>
            날짜
          </S.FormLabel>
          <S.DateInputWrapper onClick={() => openSheet("date")}>
            <Input
              id="form-date"
              value={formattedDate}
              placeholder="날짜를 선택해주세요"
              readOnly
            />
          </S.DateInputWrapper>
        </S.FormRow>

        <S.FormRow>
          <S.FormLabel $required>시각</S.FormLabel>
          <S.TimeSelection aria-label="시각 선택">
            <Dropdown
              onChange={(hour) => {
                setTime24h(`${hour}:${hour === "24" ? "00" : timeMinute || "00"}`);
              }}
              options={HOUR_OPTIONS}
              placeholder="시"
              value={timeHour || undefined}
            />
            <S.TimeSeparator aria-hidden>:</S.TimeSeparator>
            <Dropdown
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
                <S.RemoveButton type="button" onClick={() => handleRemoveLocation(idx)}>
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
          <S.FormLabel as="span" $required>
            요청사항
          </S.FormLabel>
          <S.StyledTextarea
            value={userNaturalLanguageRequest}
            onChange={(e) => setUserNaturalLanguageRequest(e.target.value)}
            placeholder="예 : 대화하기 좋은 저녁 식사 장소를 추천해주세요."
          />
        </S.TextareaContainer>

        <S.OptionalSection>
          <S.OptionalRow>
            <S.Checkbox
              type="checkbox"
              checked={isStayDurationEnabled}
              onChange={(e) => {
                setIsStayDurationEnabled(e.target.checked);
                if (!e.target.checked) setStayDurationMinutes(null);
              }}
            />
            <S.OptionalLabel>머무는 시간</S.OptionalLabel>
            <Input
              value={stayDurationMinutes || ""}
              onChange={(e) => {
                const onlyNumber = e.target.value.replace(/[^0-9]/g, "");
                setStayDurationMinutes(onlyNumber ? Number(onlyNumber) : null);
                if (onlyNumber) setIsStayDurationEnabled(true);
              }}
              placeholder="예: 120 (분)"
            />
          </S.OptionalRow>

          <S.OptionalRow>
            <S.Checkbox
              type="checkbox"
              checked={isActivityTypeEnabled}
              onChange={(e) => {
                setIsActivityTypeEnabled(e.target.checked);
                if (!e.target.checked) setActivityType(null);
              }}
            />
            <S.OptionalLabel>활동 유형</S.OptionalLabel>
            <Dropdown
              value={activityType || undefined}
              onChange={(val) => {
                const res = ActivityTypeSchema.safeParse(val);
                if (res.success) {
                  setActivityType(res.data);
                  setIsActivityTypeEnabled(true);
                }
              }}
              options={ACTIVITY_OPTIONS}
              placeholder="선택"
            />
          </S.OptionalRow>

          <S.OptionalRow>
            <S.Checkbox
              type="checkbox"
              checked={isNumberOfPeopleEnabled}
              onChange={(e) => {
                setIsNumberOfPeopleEnabled(e.target.checked);
                if (!e.target.checked) setNumberOfPeople(null);
              }}
            />
            <S.OptionalLabel>인원</S.OptionalLabel>
            <Input
              value={numberOfPeople || ""}
              onChange={(e) => {
                const onlyNumber = e.target.value.replace(/[^0-9]/g, "");
                setNumberOfPeople(onlyNumber ? Number(onlyNumber) : null);
                if (onlyNumber) setIsNumberOfPeopleEnabled(true);
              }}
              placeholder="예 : 3 (명)"
            />
          </S.OptionalRow>

          <S.OptionalRow>
            <S.Checkbox
              type="checkbox"
              checked={isPartyTypeEnabled}
              onChange={(e) => {
                setIsPartyTypeEnabled(e.target.checked);
                if (!e.target.checked) setPartyType(null);
              }}
            />
            <S.OptionalLabel>관계 유형</S.OptionalLabel>
            <Dropdown
              value={partyType || undefined}
              options={PARTY_OPTIONS}
              onChange={(val) => {
                const res = PartyTypeSchema.safeParse(val);
                if (res.success) {
                  setPartyType(res.data);
                  setIsPartyTypeEnabled(true);
                }
              }}
              placeholder="선택"
            />
          </S.OptionalRow>

          <S.OptionalRow>
            <S.Checkbox
              type="checkbox"
              checked={isBudgetEnabled}
              onChange={(e) => {
                setIsBudgetEnabled(e.target.checked);
                if (!e.target.checked) setBudgetPerPerson(null);
              }}
            />
            <S.OptionalLabel>예산</S.OptionalLabel>
            <S.BudgetWrapper $disabled={!isBudgetEnabled}>
              <S.BudgetAmountText>
                {formatCurrency(budgetPerPerson?.[0] ?? 20000)} ~{" "}
                {formatCurrency(budgetPerPerson?.[1] ?? 40000)}
              </S.BudgetAmountText>
              <RangeSlider
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
      </S.ScrollContent>

      <Modal
        id="recommendation-confirm-modal"
        isOpen={isConfirmModalOpen}
        close={() => setIsConfirmModalOpen(false)}
        title="진행하시겠어요?"
        description="추천 조건으로 다음 단계로 이동합니다."
        secondaryAction={{
          label: "취소",
          onClick: () => setIsConfirmModalOpen(false),
        }}
        primaryAction={{
          label: "진행",
          onClick: handleConfirmSubmit,
        }}
      />
    </S.RootContainer>
  );
};

export default PlaceRecommendationFormContent;
