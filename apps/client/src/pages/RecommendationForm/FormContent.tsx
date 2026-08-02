import {
  ActivityTypeSchema,
  BudgetRangeSchema,
  PartyTypeSchema,
} from "@monorepo/recommendation-engine/v1/contracts";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { createRecommendationJob } from "../../apis/server/recommendation";
import { Button } from "../../components/Button";
import { Dropdown, type DropdownOption } from "../../components/Dropdown";
import { Icon } from "../../components/Icon";
import { Input } from "../../components/Input";
import { RangeSlider } from "../../components/Rangeslider";
import { S } from "./FormContent.style";
import { dispatchRecommendationRequest } from "./input";
import { useRecommendationFormInput, useRecommendationFormUi } from "./RecommendationForm.context";

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

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("ko-KR").format(value) + "원";
};

const FormContent = () => {
  const {
    location,
    date,
    time24h,
    setTime24h,
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
    userNaturalLanguageRequest,
    setUserNaturalLanguageRequest,
    buildUserInput,
  } = useRecommendationFormInput();

  const { openSheet } = useRecommendationFormUi();
  const navigate = useNavigate();
  const recommendationMutation = useMutation({
    mutationFn: createRecommendationJob,
    onSuccess: (response, submittedUserInput) => {
      if (!response.success) {
        return;
      }

      void navigate(
        `/place/recommendation/pending?jobId=${encodeURIComponent(response.data.jobId)}`,
        {
          state: { userInput: submittedUserInput },
        },
      );
    },
  });

  const formattedDate = date
    ? `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`
    : "";
  const formUserInput = buildUserInput();
  const canSubmit = formUserInput !== null && !recommendationMutation.isPending;
  const submitErrorMessage =
    recommendationMutation.data?.success === false ? recommendationMutation.data.error : null;

  const submitRecommendation = () => {
    const userInput = buildUserInput();

    if (userInput === null) {
      return;
    }

    dispatchRecommendationRequest(userInput, (requestInput) => {
      recommendationMutation.mutate(requestInput);
    });
  };

  return (
    <S.RootContainer>
      <S.Header>
        <S.StatusBarMock>
          <span>9:41</span>
          <span>•••</span>
        </S.StatusBarMock>

        <S.NavBar>
          <S.BackButton type="button" onClick={() => navigate(-1)}>
            <Icon name="back-arrow" />
          </S.BackButton>
          <S.Title>장소 추천</S.Title>
        </S.NavBar>
      </S.Header>

      <S.ScrollContent>
        <S.FormRow>
          <S.FormLabel htmlFor="form-date">날짜</S.FormLabel>
          <Input
            id="form-date"
            value={formattedDate}
            placeholder=""
            onClick={() => openSheet("date")}
            readOnly
            style={{ cursor: "pointer" }}
          />
        </S.FormRow>

        <S.FlexRow $gap="12px">
          <S.FlexColumn>
            <S.FormLabel htmlFor="form-time">시각</S.FormLabel>
            <Input
              id="form-time"
              value={time24h || ""}
              onChange={(e) => setTime24h(e.target.value)}
              placeholder=""
            />
          </S.FlexColumn>

          <S.FlexColumn>
            <S.FormLabel htmlFor="form-duration">머무는 시간</S.FormLabel>
            <Input
              id="form-duration"
              value={stayDurationMinutes || ""}
              onChange={(e) => {
                const onlyNumber = e.target.value.replace(/[^0-9]/g, "");
                setStayDurationMinutes(onlyNumber ? Number(onlyNumber) : null);
              }}
              placeholder=""
            />
          </S.FlexColumn>
        </S.FlexRow>

        <S.FormRow>
          <S.FormLabel htmlFor="form-location">위치</S.FormLabel>
          <Input
            id="form-location"
            value={location.roadNameAddress || ""}
            placeholder=""
            onClick={() => openSheet("location")}
            readOnly
            style={{ cursor: "pointer" }}
          />
        </S.FormRow>

        <S.FormRow>
          <S.FormLabel as="span">활동 유형</S.FormLabel>
          <Dropdown
            value={activityType || undefined}
            onChange={(selectedValue) => {
              const parseResult = ActivityTypeSchema.safeParse(selectedValue);
              if (parseResult.success) {
                setActivityType(parseResult.data);
              }
            }}
            options={ACTIVITY_OPTIONS}
            placeholder="선택"
          />
        </S.FormRow>

        <S.FlexRow $gap="16px">
          <S.FlexColumn>
            <S.FormLabel htmlFor="form-people">인원</S.FormLabel>
            <Input
              id="form-people"
              value={numberOfPeople || ""}
              onChange={(e) => {
                const onlyNumber = e.target.value.replace(/[^0-9]/g, "");
                setNumberOfPeople(onlyNumber ? Number(onlyNumber) : null);
              }}
              placeholder=""
            />
          </S.FlexColumn>

          <S.FlexColumn>
            <S.FormLabel as="span">관계 유형</S.FormLabel>
            <Dropdown
              value={partyType || undefined}
              options={PARTY_OPTIONS}
              placeholder="선택"
              onChange={(val) => {
                const parseResult = PartyTypeSchema.safeParse(val);
                if (parseResult.success) {
                  setPartyType(parseResult.data);
                }
              }}
            />
          </S.FlexColumn>
        </S.FlexRow>

        <S.BudgetContainer>
          <S.BudgetTextWrapper>
            <S.FormLabel as="span">1인당 예산</S.FormLabel>
            <S.BudgetValue>
              {budgetPerPerson
                ? `${formatCurrency(budgetPerPerson[0])} ~ ${formatCurrency(budgetPerPerson[1])}`
                : "금액을 설정해주세요"}
            </S.BudgetValue>
          </S.BudgetTextWrapper>

          <RangeSlider
            min={0}
            max={150000}
            step={5000}
            value={budgetPerPerson || [20000, 40000]}
            onChange={(newValue) => {
              const parseResult = BudgetRangeSchema.safeParse(newValue);
              if (parseResult.success) {
                setBudgetPerPerson(parseResult.data);
              }
            }}
          />
        </S.BudgetContainer>

        <S.TextareaContainer>
          <S.FormLabel as="span">요청사항</S.FormLabel>
          <S.StyledTextarea
            value={userNaturalLanguageRequest}
            onChange={(e) => setUserNaturalLanguageRequest(e.target.value)}
            placeholder="대화하기 좋은 저녁 식사 장소 추천"
          />
        </S.TextareaContainer>

        <S.ButtonWrapper>
          {submitErrorMessage !== null && (
            <S.SubmitErrorMessage role="alert">{submitErrorMessage}</S.SubmitErrorMessage>
          )}
          <Button type="button" width="100%" disabled={!canSubmit} onClick={submitRecommendation}>
            {recommendationMutation.isPending ? "추천 요청 중..." : "추천 받기"}
          </Button>
        </S.ButtonWrapper>
      </S.ScrollContent>
    </S.RootContainer>
  );
};

export default FormContent;
