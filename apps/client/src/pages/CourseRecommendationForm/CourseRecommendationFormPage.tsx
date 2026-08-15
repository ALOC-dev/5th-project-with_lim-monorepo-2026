import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import BottomSheet from "../../components/BottomSheet/BottomSheet";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/DatePicker/DatePicker";
import { Dropdown, type DropdownOption } from "../../components/Dropdown";
import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { Icon } from "../../components/Icon";
import { Input } from "../../components/Input";
import { SearchInput } from "../../components/SearchInput";
import { Skeleton } from "../../components/Skeleton";
import { CourseIconButton } from "../../features/CourseRecommendation/components/CourseIconButton";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import type {
  CoursePacePreference,
  CoursePlace,
  CoursePlaceSource,
} from "../../features/CourseRecommendation/course.types";
import {
  type CourseFormValidationField,
  getCourseFormValidationError,
  getCourseScheduleDateBounds,
  getDefaultCourseSchedule,
  isSameCoursePlace,
  MAX_DURATION_HOURS,
  MAX_SELECTED_PLACES,
  MIN_DURATION_HOURS,
  toggleCoursePlace,
} from "../../features/CourseRecommendation/courseForm";
import { courseRepository } from "../../features/CourseRecommendation/courseRepository";
import { useAppBackNavigate, useAppNavigate } from "../../routes/useAppNavigate";
import { S } from "./CourseRecommendationFormPage.styled";
import { getCourseRecommendationRetryDraft } from "./retryDraft";

const DURATION_OPTIONS: readonly DropdownOption[] = Array.from(
  { length: MAX_DURATION_HOURS - MIN_DURATION_HOURS + 1 },
  (_, index) => {
    const hours = MIN_DURATION_HOURS + index;
    return { label: `${hours}시간`, value: String(hours) };
  },
);

const PACE_OPTIONS: readonly DropdownOption[] = [
  { label: "여유롭게", value: "RELAXED" },
  { label: "적당하게", value: "NORMAL" },
  { label: "알차게", value: "PACKED" },
];

const HOUR_OPTIONS: readonly DropdownOption[] = Array.from({ length: 24 }, (_, hour) => {
  const value = String(hour).padStart(2, "0");
  return { label: `${value}시`, value };
});

const MINUTE_OPTIONS: readonly DropdownOption[] = ["00", "15", "30", "45"].map((value) => ({
  label: `${value}분`,
  value,
}));

const pickerSkeletonKeys = ["first", "second", "third"] as const;

const PickerResultsSkeleton = () => (
  <S.PickerSkeleton aria-busy="true" aria-label="장소를 불러오는 중이에요" role="status">
    {pickerSkeletonKeys.map((key) => (
      <S.PickerSkeletonItem key={key}>
        <S.PickerSkeletonInfo>
          <Skeleton height={24} width="42%" />
          <Skeleton height={20} width="72%" />
        </S.PickerSkeletonInfo>
        <Skeleton borderRadius={8} height={40} width={52} />
      </S.PickerSkeletonItem>
    ))}
  </S.PickerSkeleton>
);

export const CourseRecommendationFormPage = () => {
  const navigate = useAppNavigate();
  const navigateBack = useAppBackNavigate("/");
  const location = useLocation();
  const retryDraft = getCourseRecommendationRetryDraft(location.state as unknown);
  const defaultSchedule = getDefaultCourseSchedule();
  const scheduleDateBounds = getCourseScheduleDateBounds();
  const [places, setPlaces] = useState<CoursePlace[]>(() => [...(retryDraft?.places ?? [])]);
  const [date, setDate] = useState(() => retryDraft?.date ?? defaultSchedule.date);
  const [startTime, setStartTime] = useState(
    () => retryDraft?.startTime ?? defaultSchedule.startTime,
  );
  const [durationHours, setDurationHours] = useState(() => retryDraft?.durationHours ?? 3);
  const [numberOfPeople, setNumberOfPeople] = useState(() => retryDraft?.numberOfPeople ?? 2);
  const [budgetPerPersonWon, setBudgetPerPersonWon] = useState<number | undefined>(
    () => retryDraft?.budgetPerPersonWon,
  );
  const [pacePreference, setPacePreference] = useState<CoursePacePreference>(
    () => retryDraft?.pacePreference ?? "NORMAL",
  );
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [pickerSource, setPickerSource] = useState<CoursePlaceSource>("SAVED_PLACE");
  const [query, setQuery] = useState("");
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<HTMLSelectElement>(null);
  const numberOfPeopleRef = useRef<HTMLInputElement>(null);
  const budgetRef = useRef<HTMLInputElement>(null);
  const retrySavedPlaceIds =
    retryDraft?.places.flatMap(({ savedPlaceId }) => (savedPlaceId ? [savedPlaceId] : [])) ?? [];
  const retrySavedPlacesQuery = useQuery({
    queryKey: ["course-picker", "SAVED_PLACE", ""],
    queryFn: () => courseRepository.listPickerPlaces("", "SAVED_PLACE"),
    enabled: retrySavedPlaceIds.length > 0,
    retry: false,
  });
  const pickerQuery = useQuery({
    queryKey: ["course-picker", pickerSource, query],
    queryFn: () => courseRepository.listPickerPlaces(query, pickerSource),
    enabled: isPickerOpen && (pickerSource === "SAVED_PLACE" || query.trim().length > 0),
    retry: false,
  });
  const savedPlaceById = new Map(
    retrySavedPlacesQuery.data?.flatMap((place) =>
      place.savedPlaceId ? [[place.savedPlaceId, place] as const] : [],
    ) ?? [],
  );
  const displayPlaces = places.map((place) =>
    place.savedPlaceId ? (savedPlaceById.get(place.savedPlaceId) ?? place) : place,
  );
  const [startTimeHour = "", startTimeMinute = ""] = startTime.split(":");
  const minuteOptions =
    startTimeMinute === "" || MINUTE_OPTIONS.some(({ value }) => value === startTimeMinute)
      ? MINUTE_OPTIONS
      : [...MINUTE_OPTIONS, { label: `${startTimeMinute}분`, value: startTimeMinute }].sort(
          (left, right) => left.value.localeCompare(right.value),
        );
  const createMutation = useMutation({
    mutationFn: () =>
      courseRepository.startRecommendation({
        places,
        date,
        startTime,
        durationHours,
        numberOfPeople,
        ...(budgetPerPersonWon ? { budgetPerPersonWon } : {}),
        pacePreference,
      }),
    onSuccess: (course) => void navigate(`/course/recommendation/${encodeURIComponent(course.id)}`),
  });
  const toggle = (place: CoursePlace) =>
    setPlaces((current) => [...toggleCoursePlace(current, place)]);
  const validationInput = {
    selectedPlaceCount: places.length,
    numberOfPeople,
    ...(budgetPerPersonWon !== undefined ? { budgetPerPersonWon } : {}),
    date,
    startTime,
  } as const;
  const formError = getCourseFormValidationError(validationInput);
  const errorDescriptionFor = (field: CourseFormValidationField) =>
    formError?.field === field ? "course-form-error" : undefined;
  const focusValidationField = (field: CourseFormValidationField) => {
    switch (field) {
      case "places":
        pickerTriggerRef.current?.focus();
        return;
      case "numberOfPeople":
        numberOfPeopleRef.current?.focus();
        return;
      case "budgetPerPersonWon":
        budgetRef.current?.focus();
        return;
      case "date":
        dateRef.current?.focus();
        return;
      case "startTime":
        startTimeRef.current?.focus();
    }
  };
  const handleSubmit = () => {
    const validationError = getCourseFormValidationError(validationInput);
    if (validationError) {
      focusValidationField(validationError.field);
      return;
    }
    createMutation.mutate();
  };

  return (
    <CoursePage onBack={navigateBack} title="코스 추천">
      <S.Scroll>
        <S.Section>
          <S.SectionHeader>
            <S.Heading $required>후보 장소</S.Heading>
            <S.SectionCount>
              후보 장소 {places.length} / {MAX_SELECTED_PLACES}
            </S.SectionCount>
          </S.SectionHeader>
          <S.Helper>결과에는 후보 중 2~6곳이 포함되며, 제외된 이유도 함께 보여드려요.</S.Helper>
          <S.PickerOpen
            aria-describedby={errorDescriptionFor("places")}
            aria-invalid={formError?.field === "places"}
            id="course-places"
            onClick={() => setPickerOpen(true)}
            ref={pickerTriggerRef}
            type="button"
          >
            <strong>{places.length === 0 ? "후보 장소 선택" : "선택한 후보"}</strong>
            <span>
              {places.length === 0
                ? "저장한 장소 또는 검색으로 후보를 골라주세요."
                : displayPlaces.length === 1
                  ? displayPlaces[0]?.name
                  : `${displayPlaces[0]?.name ?? ""} 외 ${displayPlaces.length - 1}곳`}
            </span>
            <Icon name="chevron-right" size={20} />
          </S.PickerOpen>
          {displayPlaces.map((place) => (
            <S.SelectedPlace key={place.id}>
              <span>{place.name}</span>
              <CourseIconButton
                aria-label={`${place.name} 선택 해제`}
                onClick={() => toggle(place)}
                type="button"
              >
                <Icon name="close" size={18} />
              </CourseIconButton>
            </S.SelectedPlace>
          ))}
        </S.Section>
        <S.Section>
          <S.Heading>약속 시간</S.Heading>
          <S.Field $required>
            <label htmlFor="course-date">날짜</label>
            <DatePicker
              ariaDescribedBy={errorDescriptionFor("date")}
              ariaInvalid={formError?.field === "date"}
              inputId="course-date"
              inputRef={dateRef}
              maxDate={scheduleDateBounds.maxDate}
              minDate={scheduleDateBounds.minDate}
              onChange={setDate}
              sheetId="course-date-selection"
              value={date}
            />
          </S.Field>
          <S.Field $required>
            <label htmlFor="course-time-hour">시각</label>
            <S.TimeSelection aria-label="시각 선택">
              <Dropdown
                ariaDescribedBy={errorDescriptionFor("startTime")}
                ariaInvalid={formError?.field === "startTime"}
                id="course-time-hour"
                onChange={(hour) => setStartTime(`${hour}:${startTimeMinute || "00"}`)}
                options={HOUR_OPTIONS}
                placeholder="시"
                ref={startTimeRef}
                value={startTimeHour || undefined}
              />
              <S.TimeSeparator aria-hidden>:</S.TimeSeparator>
              <Dropdown
                ariaDescribedBy={errorDescriptionFor("startTime")}
                ariaInvalid={formError?.field === "startTime"}
                ariaLabel="분"
                disabled={!startTimeHour}
                id="course-time-minute"
                onChange={(minute) => setStartTime(`${startTimeHour}:${minute}`)}
                options={minuteOptions}
                placeholder="분"
                value={startTimeMinute || undefined}
              />
            </S.TimeSelection>
          </S.Field>
          <S.Field $required>
            <label htmlFor="course-duration">총 시간</label>
            <Dropdown
              id="course-duration"
              onChange={(value) => setDurationHours(Number(value))}
              options={DURATION_OPTIONS}
              value={String(durationHours)}
            />
          </S.Field>
          <S.FieldGrid>
            <S.Field $required>
              <label htmlFor="course-people">인원</label>
              <Input
                aria-describedby={errorDescriptionFor("numberOfPeople")}
                aria-invalid={formError?.field === "numberOfPeople"}
                id="course-people"
                max={20}
                min={1}
                onChange={(event) => setNumberOfPeople(Number(event.target.value))}
                ref={numberOfPeopleRef}
                type="number"
                value={numberOfPeople}
              />
            </S.Field>
            <S.Field $required>
              <label htmlFor="course-pace">코스 페이스</label>
              <Dropdown
                id="course-pace"
                onChange={(value) => setPacePreference(value as CoursePacePreference)}
                options={PACE_OPTIONS}
                value={pacePreference}
              />
            </S.Field>
          </S.FieldGrid>
          <S.Field>
            <label htmlFor="course-budget">1인당 예산 (선택)</label>
            <Input
              aria-describedby={errorDescriptionFor("budgetPerPersonWon")}
              aria-invalid={formError?.field === "budgetPerPersonWon"}
              id="course-budget"
              max={500_000}
              min={5_000}
              onChange={(event) =>
                setBudgetPerPersonWon(
                  event.target.value === "" ? undefined : Number(event.target.value),
                )
              }
              placeholder="예: 50000"
              ref={budgetRef}
              step={1_000}
              type="number"
              value={budgetPerPersonWon ?? ""}
            />
          </S.Field>
          {formError ? (
            <S.FieldError id="course-form-error" role="alert">
              {formError.message}
            </S.FieldError>
          ) : null}
        </S.Section>
        {createMutation.isError ? (
          <FeedbackState kind="error" title="코스 추천 요청을 만들지 못했어요" />
        ) : null}
      </S.Scroll>
      <S.Bottom>
        <Button
          aria-describedby={formError ? "course-form-error" : undefined}
          disabled={createMutation.isPending}
          onClick={handleSubmit}
          type="button"
          width="100%"
        >
          코스 추천 받기
        </Button>
      </S.Bottom>
      <BottomSheet
        close={() => setPickerOpen(false)}
        initialHeight="min(78dvh, 680px)"
        id="course-place-picker"
        isOpen={isPickerOpen}
        isModal
        ariaLabel="장소 선택"
      >
        <S.Sheet>
          <S.Heading>후보 장소 선택</S.Heading>
          <S.Tabs>
            <S.Tab
              aria-pressed={pickerSource === "SAVED_PLACE"}
              $active={pickerSource === "SAVED_PLACE"}
              onClick={() => {
                setPickerSource("SAVED_PLACE");
                setQuery("");
              }}
              type="button"
            >
              저장한 장소
            </S.Tab>
            <S.Tab
              aria-pressed={pickerSource === "DIRECT_SEARCH"}
              $active={pickerSource === "DIRECT_SEARCH"}
              onClick={() => setPickerSource("DIRECT_SEARCH")}
              type="button"
            >
              장소 검색
            </S.Tab>
          </S.Tabs>
          {pickerSource === "DIRECT_SEARCH" ? (
            <SearchInput
              backHandler={() => setPickerSource("SAVED_PLACE")}
              clearHandler={() => setQuery("")}
              isSearchMode
              onChange={(event) => setQuery(event.target.value)}
              placeholder="장소명으로 검색"
              value={query}
            />
          ) : null}
          <S.Count>
            후보 장소 {places.length} / {MAX_SELECTED_PLACES}
          </S.Count>
          <S.PickerResults>
            {pickerSource === "DIRECT_SEARCH" && query.trim().length === 0 ? (
              <FeedbackState
                description="상호명이나 장소명으로 후보를 찾아보세요."
                kind="empty"
                title="장소를 검색해 주세요"
              />
            ) : pickerQuery.isFetching ? (
              <PickerResultsSkeleton />
            ) : pickerQuery.isError ? (
              <FeedbackState
                action={{ label: "다시 시도", onClick: () => void pickerQuery.refetch() }}
                kind="error"
                title="장소를 불러오지 못했어요"
              />
            ) : pickerQuery.data?.length ? (
              <S.List>
                {pickerQuery.data.map((place) => {
                  const selected = places.some((selectedPlace) =>
                    isSameCoursePlace(selectedPlace, place),
                  );
                  const atLimit = places.length >= MAX_SELECTED_PLACES && !selected;
                  return (
                    <S.ListItem key={place.id}>
                      <span>
                        <strong>{place.name}</strong>
                        <small>
                          {place.category} · {place.address}
                        </small>
                      </span>
                      <S.SelectPlace
                        aria-label={`${place.name} ${selected ? "선택 해제" : "선택"}`}
                        aria-pressed={selected}
                        disabled={atLimit}
                        onClick={() => toggle(place)}
                        type="button"
                      >
                        {selected ? "선택됨" : atLimit ? "최대 선택" : "선택"}
                      </S.SelectPlace>
                    </S.ListItem>
                  );
                })}
              </S.List>
            ) : (
              <FeedbackState
                description={
                  pickerSource === "SAVED_PLACE"
                    ? "장소 추천에서 저장한 장소를 여기에서 선택할 수 있어요."
                    : query.trim().length === 0
                      ? "장소명으로 검색해 보세요."
                      : "다른 검색어로 다시 찾아보세요."
                }
                kind="empty"
                title={
                  pickerSource === "SAVED_PLACE"
                    ? "아직 저장한 장소가 없어요"
                    : "검색 결과가 없어요"
                }
              />
            )}
          </S.PickerResults>
          <S.SheetBottom>
            <Button onClick={() => setPickerOpen(false)} type="button" width="100%">
              선택 완료
            </Button>
          </S.SheetBottom>
        </S.Sheet>
      </BottomSheet>
    </CoursePage>
  );
};
