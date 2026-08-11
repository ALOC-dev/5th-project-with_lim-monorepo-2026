import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import BottomSheet from "../../components/BottomSheet/BottomSheet";
import { Button } from "../../components/Button";
import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { Icon } from "../../components/Icon";
import { Input } from "../../components/Input";
import { SearchInput } from "../../components/SearchInput";
import { CourseIconButton } from "../../features/CourseRecommendation/components/CourseIconButton";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import type { CoursePlace } from "../../features/CourseRecommendation/course.types";
import { MAX_SELECTED_PLACES } from "../../features/CourseRecommendation/courseRecommendation.constants";
import { courseRepository } from "../../features/CourseRecommendation/courseRepository";
import { S } from "./CourseRecommendationFormPage.styled";

export const CourseRecommendationFormPage = () => {
  const navigate = useNavigate();
  const [places, setPlaces] = useState<CoursePlace[]>([]);
  const [date, setDate] = useState("2026-07-18");
  const [startTime, setStartTime] = useState("18:30");
  const [durationHours, setDurationHours] = useState(3);
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [pickerSource, setPickerSource] = useState<"FAVORITE" | "KAKAO">("FAVORITE");
  const [query, setQuery] = useState("");
  const pickerQuery = useQuery({
    queryKey: ["course-picker", pickerSource, query],
    queryFn: () => courseRepository.listPickerPlaces(query, pickerSource),
    enabled: isPickerOpen && (pickerSource === "FAVORITE" || query.trim().length > 0),
    retry: false,
  });
  const createMutation = useMutation({
    mutationFn: () =>
      courseRepository.startRecommendation({ places, date, startTime, durationHours }),
    onSuccess: (course) => void navigate(`/course/recommendation/${encodeURIComponent(course.id)}`),
  });
  const toggle = (place: CoursePlace) =>
    setPlaces((current) =>
      current.some(({ id }) => id === place.id)
        ? current.filter(({ id }) => id !== place.id)
        : current.length < MAX_SELECTED_PLACES
          ? [...current, place]
          : current,
    );

  return (
    <CoursePage onBack={() => navigate(-1)} title="코스 추천">
      <S.Scroll>
        <S.Section>
          <S.Heading>
            선택 장소 {places.length} / {MAX_SELECTED_PLACES}
          </S.Heading>
          <S.PickerOpen onClick={() => setPickerOpen(true)} type="button">
            <strong>{places.length === 0 ? "장소 선택" : "선택 장소"}</strong>
            <span>
              {places.length === 0
                ? "즐겨찾기 또는 검색으로 장소를 골라주세요."
                : `${places[0]?.name ?? ""} 외 ${places.length - 1}곳`}
            </span>
            <Icon name="chevron-right" size={20} />
          </S.PickerOpen>
          {places.map((place) => (
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
          <S.FieldGrid>
            <S.Field>
              <label htmlFor="course-date">날짜</label>
              <Input
                id="course-date"
                onChange={(event) => setDate(event.target.value)}
                type="date"
                value={date}
              />
            </S.Field>
            <S.Field>
              <label htmlFor="course-time">시작 시간</label>
              <Input
                id="course-time"
                onChange={(event) => setStartTime(event.target.value)}
                type="time"
                value={startTime}
              />
            </S.Field>
          </S.FieldGrid>
          <S.Field>
            <label htmlFor="course-duration">총 시간</label>
            <S.Select
              id="course-duration"
              onChange={(event) => setDurationHours(Number(event.target.value))}
              value={durationHours}
            >
              {[2, 3, 4, 5].map((hours) => (
                <option key={hours} value={hours}>
                  {hours}시간
                </option>
              ))}
            </S.Select>
          </S.Field>
        </S.Section>
        {createMutation.isError ? (
          <FeedbackState kind="error" title="코스 추천 요청을 만들지 못했어요" />
        ) : null}
      </S.Scroll>
      <S.Bottom>
        <Button
          disabled={places.length === 0 || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          type="button"
          width="100%"
        >
          코스 추천 받기
        </Button>
      </S.Bottom>
      <BottomSheet
        close={() => setPickerOpen(false)}
        height="min(78dvh, 680px)"
        id="course-place-picker"
        isOpen={isPickerOpen}
        isModal
        ariaLabel="장소 선택"
      >
        <S.Sheet>
          <S.Heading>장소 선택</S.Heading>
          <S.Tabs>
            <S.Tab
              aria-pressed={pickerSource === "FAVORITE"}
              $active={pickerSource === "FAVORITE"}
              onClick={() => {
                setPickerSource("FAVORITE");
                setQuery("");
              }}
              type="button"
            >
              즐겨찾기
            </S.Tab>
            <S.Tab
              aria-pressed={pickerSource === "KAKAO"}
              $active={pickerSource === "KAKAO"}
              onClick={() => setPickerSource("KAKAO")}
              type="button"
            >
              장소 검색
            </S.Tab>
          </S.Tabs>
          {pickerSource === "KAKAO" ? (
            <SearchInput
              backHandler={() => setPickerSource("FAVORITE")}
              clearHandler={() => setQuery("")}
              isSearchMode
              onChange={(event) => setQuery(event.target.value)}
              placeholder="장소명으로 검색"
              value={query}
            />
          ) : null}
          <S.Count>
            선택 장소 {places.length} / {MAX_SELECTED_PLACES}
          </S.Count>
          <S.PickerResults>
            {pickerQuery.isPending ? (
              <FeedbackState kind="loading" title="장소를 불러오는 중이에요" />
            ) : pickerQuery.isError ? (
              <FeedbackState
                action={{ label: "다시 시도", onClick: () => void pickerQuery.refetch() }}
                kind="error"
                title="장소를 불러오지 못했어요"
              />
            ) : pickerQuery.data?.length ? (
              <S.List>
                {pickerQuery.data.map((place) => {
                  const selected = places.some(({ id }) => id === place.id);
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
                  pickerSource === "FAVORITE"
                    ? "마음에 드는 장소를 찜하면 여기에서 바로 선택할 수 있어요."
                    : query.trim().length === 0
                      ? "장소명으로 검색해 보세요."
                      : "다른 검색어로 다시 찾아보세요."
                }
                kind="empty"
                title={
                  pickerSource === "FAVORITE" ? "아직 찜한 장소가 없어요" : "검색 결과가 없어요"
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
