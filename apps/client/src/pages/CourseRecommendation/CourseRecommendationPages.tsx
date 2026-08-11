import styled from "@emotion/styled";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CustomOverlayMap, Map, Polyline } from "react-kakao-maps-sdk";
import { useNavigate, useParams } from "react-router-dom";

import { getCourseStreamUrl } from "../../apis/server/courses";
import BottomSheet from "../../components/BottomSheet/BottomSheet";
import { Button } from "../../components/Button";
import FeedbackState from "../../components/FeedbackState/FeedbackState";
import Header from "../../components/Header/Header";
import { Icon } from "../../components/Icon";
import { Input } from "../../components/Input";
import Modal from "../../components/Modal/Modal";
import PageRoot from "../../components/PageRoot/PageRoot";
import {
  RecommendationProgress,
  type RecommendationProgressStep,
} from "../../components/RecommendationProgress";
import { SearchInput } from "../../components/SearchInput";
import { tokens } from "../../design-system/tokens.generated";
import { getCourseRoutePath } from "./courseMap";
import { courseRepository } from "./courseRepository";
import type { CourseHistoryItem, CourseOption, CoursePlace } from "./course.types";

const MAX_SELECTED_PLACES = 15;
const formatCurrency = (value: number) => `${new Intl.NumberFormat("ko-KR").format(value)}원`;
const formatMinutes = (value: number) =>
  value % 60 === 0
    ? `${Math.floor(value / 60)}시간`
    : `${Math.floor(value / 60)}시간 ${value % 60}분`;
const formatDate = (value: string) => value.slice(0, 10).replace(/-/g, ". ");

const COURSE_PROGRESS_STEP_IDS = [
  "input_validated",
  "generating_options",
  "persisting_results",
] as const;

type CourseProgressStep = (typeof COURSE_PROGRESS_STEP_IDS)[number];
type CourseHistoryDisplayStatus = "pending" | "success" | "failed" | "empty" | "cancelled";

const COURSE_PROGRESS_LABELS = {
  input_validated: "선택한 장소와 약속 시간을 확인하고 있어요.",
  generating_options: "여러 코스 옵션을 만들고 있어요.",
  persisting_results: "추천 결과를 저장하고 있어요.",
} satisfies Record<CourseProgressStep, string>;

const toCourseProgressSteps = (
  activeStep: CourseProgressStep,
): readonly RecommendationProgressStep[] => {
  const activeIndex = COURSE_PROGRESS_STEP_IDS.indexOf(activeStep);

  return COURSE_PROGRESS_STEP_IDS.map((id, index) => ({
    id,
    label: COURSE_PROGRESS_LABELS[id],
    status: index < activeIndex ? "done" : index === activeIndex ? "active" : "pending",
  }));
};

const historySummary = (item: CourseHistoryItem) =>
  item.status === "PENDING"
    ? "추천 결과를 만드는 중이에요"
    : item.status === "FAILED"
      ? "추천을 만들지 못했어요"
      : item.status === "CANCELLED"
        ? "추천 생성을 취소했어요"
        : item.status === "EMPTY"
          ? "조건에 맞는 코스를 찾지 못했어요"
          : `추천 코스 ${item.optionCount ?? 0}개`;

const historyDisplayStatus = (item: CourseHistoryItem): CourseHistoryDisplayStatus => {
  switch (item.status) {
    case "PENDING":
      return "pending";
    case "SUCCESS":
      return "success";
    case "FAILED":
      return "failed";
    case "EMPTY":
      return "empty";
    case "CANCELLED":
      return "cancelled";
  }
};

const historyStatusLabel = (item: CourseHistoryItem) => {
  if (item.status === "EMPTY") return "결과 없음";
  if (item.status === "CANCELLED") return "생성 취소됨";
  return null;
};

const canOpenHistory = (item: CourseHistoryItem) =>
  item.status === "SUCCESS" || item.status === "EMPTY";

const CoursePage = ({
  children,
  title,
  onBack,
  right,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
  readonly onBack?: () => void;
  readonly right?: React.ReactNode;
}) => (
  <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
    <Header onBack={onBack} right={right} title={title} />
    <S.Page>{children}</S.Page>
  </PageRoot>
);

const COURSE_SINGLE_POINT_MAP_LEVEL = 4;
const COURSE_MAP_BOUNDS_PADDING = { bottom: 32, left: 32, right: 32, top: 32 } as const;

const CourseMap = ({
  option,
  height,
}: {
  readonly option: CourseOption;
  readonly height?: string;
}) => {
  const routePath = useMemo(() => getCourseRoutePath(option), [option]);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const center = routePath[0];
  const fitMapToRoute = useCallback(
    (targetMap: kakao.maps.Map) => {
      if (routePath.length === 0) return;
      if (routePath.length === 1) {
        const point = routePath[0];
        if (!point) return;
        targetMap.setCenter(new kakao.maps.LatLng(point.lat, point.lng));
        targetMap.setLevel(COURSE_SINGLE_POINT_MAP_LEVEL);
        return;
      }
      const bounds = new kakao.maps.LatLngBounds();
      routePath.forEach(({ lat, lng }) => bounds.extend(new kakao.maps.LatLng(lat, lng)));
      targetMap.setBounds(
        bounds,
        COURSE_MAP_BOUNDS_PADDING.top,
        COURSE_MAP_BOUNDS_PADDING.right,
        COURSE_MAP_BOUNDS_PADDING.bottom,
        COURSE_MAP_BOUNDS_PADDING.left,
      );
    },
    [routePath],
  );
  const handleMapCreate = useCallback(
    (createdMap: kakao.maps.Map) => {
      setMap(createdMap);
      fitMapToRoute(createdMap);
    },
    [fitMapToRoute],
  );

  useEffect(() => {
    if (map) fitMapToRoute(map);
  }, [fitMapToRoute, map]);

  if (!center) return <S.MapFallback>표시할 장소가 없어요.</S.MapFallback>;
  return (
    <S.Map $height={height}>
      <Map
        center={{ lat: center.lat, lng: center.lng }}
        level={5}
        onCreate={handleMapCreate}
        style={{ height: "100%", width: "100%" }}
      >
        <Polyline
          path={routePath.map(({ lat, lng }) => ({ lat, lng }))}
          strokeColor={tokens.color.primary[500]}
          strokeOpacity={0.8}
          strokeStyle="solid"
          strokeWeight={4}
        />
        {option.stops.map((stop, index) => (
          <CustomOverlayMap
            key={stop.id}
            position={{ lat: stop.lat, lng: stop.lng }}
            xAnchor={0.5}
            yAnchor={0.5}
          >
            <S.Marker aria-label={`${index + 1}번째 장소 ${stop.name}`} role="img">
              {index + 1}
            </S.Marker>
          </CustomOverlayMap>
        ))}
      </Map>
    </S.Map>
  );
};

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
    onSuccess: (course) =>
      void navigate(`/course/recommendation/pending/${encodeURIComponent(course.id)}`),
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
              <S.IconButton
                aria-label={`${place.name} 선택 해제`}
                onClick={() => toggle(place)}
                type="button"
              >
                <Icon name="close" size={18} />
              </S.IconButton>
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

export const CourseRecommendationPendingPage = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [error, setError] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState<CourseProgressStep>("input_validated");
  useEffect(() => {
    if (!courseId) {
      setError("추천 요청을 찾을 수 없습니다.");
      return;
    }
    const source = new EventSource(getCourseStreamUrl(courseId), { withCredentials: true });
    let terminalEventReceived = false;
    const updateProgress = (event: MessageEvent<string>) => {
      try {
        const data: unknown = JSON.parse(event.data);
        if (typeof data !== "object" || data === null) return;
        const record = data as { type?: string; step?: string };
        if (record.type !== "progress") return;
        setProgressStep(
          record.step === "generating_options" || record.step === "persisting_results"
            ? record.step
            : "input_validated",
        );
      } catch {
        // A malformed progress event must not end a valid stream.
      }
    };
    const terminal = (event: MessageEvent<string>) => {
      try {
        terminalEventReceived = true;
        const data: unknown = JSON.parse(event.data);
        if (typeof data !== "object" || data === null) throw new Error();
        const record = data as { type?: string; message?: string };
        if (record.type === "result")
          void navigate(`/course/recommendation/result/${encodeURIComponent(courseId)}`, {
            replace: true,
          });
        else if (record.type === "cancelled")
          void navigate("/course/recommendation/history", { replace: true });
        else setError(record.message ?? "코스 추천을 만들지 못했습니다.");
        source.close();
      } catch {
        setError("코스 추천 상태를 읽지 못했습니다.");
        source.close();
      }
    };
    source.addEventListener("result", terminal as EventListener);
    source.addEventListener("error", terminal as EventListener);
    source.addEventListener("cancelled", terminal as EventListener);
    source.addEventListener("progress", updateProgress as EventListener);
    source.onerror = () => {
      if (!terminalEventReceived) setError("코스 추천 연결이 끊어졌습니다.");
    };
    return () => source.close();
  }, [courseId, navigate]);
  return (
    <RecommendationProgress
      description={COURSE_PROGRESS_LABELS[progressStep]}
      error={
        error
          ? {
              title: "추천 결과를 만들지 못했어요",
              description: error,
              action: {
                label: "추천 폼으로",
                onClick: () => void navigate("/course/recommendation/form"),
              },
            }
          : undefined
      }
      headerTitle="코스 추천 중"
      onBack={() => void navigate("/course/recommendation/form")}
      steps={toCourseProgressSteps(progressStep)}
      title="코스 추천을 만드는 중이에요"
    />
  );
};

export const CourseRecommendationResultPage = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const result = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => courseRepository.getRecommendation(courseId ?? ""),
    enabled: Boolean(courseId),
    retry: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && result.data?.options[0]) setSelectedId(result.data.options[0].id);
  }, [result.data, selectedId]);
  if (result.isPending)
    return (
      <CoursePage onBack={() => navigate(-1)} title="코스 결과">
        <FeedbackState kind="loading" title="추천 결과를 불러오는 중이에요" />
      </CoursePage>
    );
  const recommendation = result.data;
  if (!recommendation || !courseId)
    return (
      <CoursePage onBack={() => navigate("/course/recommendation/form")} title="코스 결과">
        <FeedbackState
          action={{
            label: "다시 추천받기",
            onClick: () => void navigate("/course/recommendation/form"),
          }}
          description="추천 기록에서 다시 열거나 새 추천을 요청해 주세요."
          kind="error"
          title="추천 결과를 찾을 수 없어요"
        />
      </CoursePage>
    );
  if (recommendation.status === "EMPTY")
    return (
      <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 결과">
        <FeedbackState
          action={{
            label: "다시 추천받기",
            onClick: () => void navigate("/course/recommendation/form"),
          }}
          kind="empty"
          title="조건에 맞는 코스를 찾지 못했어요"
        />
      </CoursePage>
    );
  if (recommendation.status !== "SUCCESS")
    return (
      <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 결과">
        <FeedbackState
          action={{
            label: "다시 추천받기",
            onClick: () => void navigate("/course/recommendation/form"),
          }}
          description={recommendation.errorMessage}
          kind="error"
          title="추천 결과를 불러오지 못했어요"
        />
      </CoursePage>
    );
  const selected =
    recommendation.options.find(({ id }) => id === selectedId) ?? recommendation.options[0];
  if (!selected) return null;
  const selectedIndex = Math.max(
    0,
    recommendation.options.findIndex(({ id }) => id === selected.id),
  );
  return (
    <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 결과">
      <S.ResultMap>
        <S.MapLabel aria-live="polite">
          {selectedIndex + 1}번 코스 · {selected.type}
        </S.MapLabel>
        <CourseMap option={selected} />
      </S.ResultMap>
      <S.Result>
        <S.ResultHeader>
          <S.ResultTitle>
            추천 코스 <S.ResultCount>{recommendation.options.length}개</S.ResultCount>
          </S.ResultTitle>
          <S.SelectionStatus aria-live="polite">
            {selectedIndex + 1}번 코스 선택됨
          </S.SelectionStatus>
        </S.ResultHeader>
        {recommendation.options.map((option, index) => (
          <S.Option $selected={option.id === selected.id} key={option.id}>
            <S.OptionSelect
              aria-label={`${index + 1}번 ${option.type} 코스 선택`}
              aria-pressed={option.id === selected.id}
              onClick={() => setSelectedId(option.id)}
              type="button"
            >
              <b>{index + 1}</b>
              <span>
                <strong>{option.type}</strong>
                <small>{option.stops.map((stop) => stop.name).join(" → ")}</small>
                <small>
                  {option.stops.length}곳 · 총 {formatMinutes(option.totalDurationMinutes)} · 이동{" "}
                  {option.totalTravelMinutes}분
                </small>
              </span>
            </S.OptionSelect>
            <S.TextButton
              aria-label={`${index + 1}번 ${option.type} 코스 상세 보기`}
              onClick={() =>
                void navigate(
                  `/course/recommendation/result/${encodeURIComponent(courseId)}/option/${encodeURIComponent(option.id)}`,
                )
              }
              type="button"
            >
              상세 보기
            </S.TextButton>
          </S.Option>
        ))}
      </S.Result>
    </CoursePage>
  );
};

export const CourseRecommendationOptionDetailPage = () => {
  const navigate = useNavigate();
  const { courseId, optionId } = useParams();
  const queryClient = useQueryClient();
  const optionQuery = useQuery({
    queryKey: ["course-option", courseId, optionId],
    queryFn: () => courseRepository.getOption(courseId ?? "", optionId ?? ""),
    enabled: Boolean(courseId && optionId),
    retry: false,
  });
  const favorite = useMutation({
    mutationFn: (value: boolean) =>
      courseRepository.toggleFavorite(courseId ?? "", optionId ?? "", value),
    onSuccess: () =>
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["course-option", courseId, optionId] }),
        queryClient.invalidateQueries({ queryKey: ["course", courseId] }),
        queryClient.invalidateQueries({ queryKey: ["course-favorites"] }),
      ]),
  });
  if (optionQuery.isPending)
    return (
      <CoursePage onBack={() => navigate(-1)} title="코스 상세">
        <FeedbackState kind="loading" title="코스 상세를 불러오는 중이에요" />
      </CoursePage>
    );
  const option = optionQuery.data;
  if (!option)
    return (
      <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 상세">
        <FeedbackState kind="error" title="코스 상세를 찾을 수 없어요" />
      </CoursePage>
    );
  return (
    <CoursePage
      onBack={() => navigate(`/course/recommendation/result/${encodeURIComponent(courseId ?? "")}`)}
      right={
        <S.IconButton
          aria-label={option.isFavorite ? "코스 찜 해제" : "코스 찜하기"}
          disabled={favorite.isPending}
          onClick={() => favorite.mutate(!option.isFavorite)}
          type="button"
        >
          <Icon name={option.isFavorite ? "heart-filled" : "heart-outline"} />
        </S.IconButton>
      }
      title="코스 상세"
    >
      <S.Detail>
        <CourseMap height="232px" option={option} />
        {favorite.isError ? (
          <S.InlineError role="alert">코스 찜 상태를 변경하지 못했어요.</S.InlineError>
        ) : null}
        <S.Card>
          <S.Heading>{option.title}</S.Heading>
          <span>
            {option.stops.length}곳 · 총 {formatMinutes(option.totalDurationMinutes)} · 이동{" "}
            {option.totalTravelMinutes}분 · 1인 {formatCurrency(option.pricePerPersonWon)}
          </span>
          <S.Route>{option.stops.map((stop) => stop.name).join(" → ")}</S.Route>
        </S.Card>
        <S.Card>
          <h3>코스 구성 이유</h3>
          <p>{option.reason}</p>
        </S.Card>
        <S.Card>
          <h3>시간순 코스</h3>
          {option.stops.map((stop, index) => (
            <S.Stop key={stop.id}>
              <time>{stop.visitTime}</time>
              <b>{index + 1}</b>
              <span>
                <strong>{stop.name}</strong>
                <small>
                  {stop.activityLabel} · {stop.stayMinutes}분 체류
                </small>
              </span>
            </S.Stop>
          ))}
        </S.Card>
      </S.Detail>
    </CoursePage>
  );
};

export const CourseRecommendationHistoryPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const histories = useQuery({
    queryKey: ["course-history"],
    queryFn: () => courseRepository.listHistory(),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === "PENDING") ? 5_000 : false,
  });
  const [editing, setEditing] = useState<CourseHistoryItem | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<CourseHistoryItem | null>(null);
  const renameInvalid = title.trim().length === 0 || title.trim().length > 60;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["course-history"] });
  const rename = useMutation({
    mutationFn: () => courseRepository.renameHistory(editing?.id ?? "", title),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      deleting?.status === "PENDING"
        ? courseRepository.cancelPendingHistory(deleting.id)
        : courseRepository.deleteHistory(deleting?.id ?? ""),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });
  return (
    <CoursePage onBack={() => navigate(-1)} title="코스 추천 기록">
      <S.HistoryContent>
        {histories.isPending ? (
          <FeedbackState kind="loading" title="추천 기록을 불러오는 중이에요" />
        ) : histories.isError ? (
          <FeedbackState
            action={{ label: "다시 시도", onClick: () => void histories.refetch() }}
            kind="error"
            title="추천 기록을 불러오지 못했어요"
          />
        ) : !histories.data?.length ? (
          <FeedbackState
            action={{
              label: "코스 추천받기",
              onClick: () => void navigate("/course/recommendation/form"),
            }}
            description="추천 요청 후 이곳에서 결과를 확인해요."
            kind="empty"
            title="아직 저장된 기록이 없어요"
          />
        ) : (
          <>
            <S.HistoryNotice>추천 요청을 시작하면 기록이 자동으로 저장됩니다.</S.HistoryNotice>
            <S.HistoryList>
              {histories.data.map((item) => {
                const displayStatus = historyDisplayStatus(item);
                const statusLabel = historyStatusLabel(item);
                const cardInfo = (
                  <S.HistoryInfo>
                    <S.HistoryDate>{formatDate(item.requestedAt)}</S.HistoryDate>
                    <S.HistoryTitle>{item.title}</S.HistoryTitle>
                    <S.HistoryDescription $status={displayStatus}>
                      {historySummary(item)}
                    </S.HistoryDescription>
                    {statusLabel ? (
                      <S.HistoryStatusBadge $status={displayStatus}>{statusLabel}</S.HistoryStatusBadge>
                    ) : null}
                  </S.HistoryInfo>
                );

                return (
                  <S.History $status={displayStatus} key={item.id}>
                    {canOpenHistory(item) ? (
                      <S.HistoryOpen
                        aria-label={`${item.title} 추천 기록 열기`}
                        onClick={() =>
                          void navigate(
                            `/course/recommendation/result/${encodeURIComponent(item.id)}`,
                          )
                        }
                        type="button"
                      >
                        {cardInfo}
                      </S.HistoryOpen>
                    ) : (
                      cardInfo
                    )}
                    <S.HistoryActions>
                      {item.status === "PENDING" ? (
                        <S.HistorySpinner aria-label="추천 생성 중" role="status" />
                      ) : null}
                      {item.status === "SUCCESS" ? (
                        <S.IconButton
                          aria-label={`${item.title} 추천 기록 이름 변경`}
                          onClick={() => {
                            rename.reset();
                            setEditing(item);
                            setTitle(item.title);
                          }}
                          type="button"
                        >
                          <Icon name="edit" size={18} />
                        </S.IconButton>
                      ) : null}
                      <S.IconButton
                        aria-label={`${item.title} 추천 기록 삭제`}
                        onClick={() => {
                          remove.reset();
                          setDeleting(item);
                        }}
                        type="button"
                      >
                        <Icon name="close" size={18} />
                      </S.IconButton>
                    </S.HistoryActions>
                  </S.History>
                );
              })}
            </S.HistoryList>
          </>
        )}
      </S.HistoryContent>
      <Modal
        close={() => {
          rename.reset();
          setEditing(null);
        }}
        id="course-rename"
        isOpen={Boolean(editing)}
        primaryAction={{
          label: "변경",
          onClick: () => rename.mutate(),
          disabled: renameInvalid || rename.isPending,
        }}
        secondaryAction={{
          label: "취소",
          onClick: () => {
            rename.reset();
            setEditing(null);
          },
        }}
        title="기록 이름 변경"
      >
        <S.ModalInput
          aria-label="코스 기록 이름"
          $invalid={renameInvalid}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
        {renameInvalid ? (
          <S.ModalError role="alert">이름은 1~60자로 입력해 주세요.</S.ModalError>
        ) : rename.isError ? (
          <S.ModalError role="alert">이름을 변경하지 못했어요.</S.ModalError>
        ) : null}
      </Modal>
      <Modal
        close={() => {
          remove.reset();
          setDeleting(null);
        }}
        description={
          deleting?.status === "PENDING"
            ? "생성 중인 코스 추천을 취소합니다."
            : "삭제한 기록은 다시 복구할 수 없어요."
        }
        id="course-delete"
        isOpen={Boolean(deleting)}
        primaryAction={{
          label: deleting?.status === "PENDING" ? "취소하기" : "삭제하기",
          onClick: () => remove.mutate(),
          disabled: remove.isPending,
        }}
        secondaryAction={{
          label: "돌아가기",
          onClick: () => {
            remove.reset();
            setDeleting(null);
          },
        }}
        title={
          deleting?.status === "PENDING" ? "추천 생성을 취소할까요?" : "추천 기록을 삭제할까요?"
        }
      >
        {remove.isError ? (
          <S.ModalError role="alert">
            {deleting?.status === "PENDING"
              ? "추천 생성을 취소하지 못했어요."
              : "추천 기록을 삭제하지 못했어요."}
          </S.ModalError>
        ) : null}
      </Modal>
    </CoursePage>
  );
};

export const CourseFavoritePage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const favorites = useQuery({
    queryKey: ["course-favorites"],
    queryFn: () => courseRepository.listFavorites(),
    retry: false,
  });
  const remove = useMutation({
    mutationFn: (favorite: { courseId: string; optionId: string }) =>
      courseRepository.toggleFavorite(favorite.courseId, favorite.optionId, false),
    onSuccess: (_result, favorite) =>
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["course-favorites"] }),
        queryClient.invalidateQueries({
          queryKey: ["course-option", favorite.courseId, favorite.optionId],
        }),
        queryClient.invalidateQueries({ queryKey: ["course", favorite.courseId] }),
      ]),
  });
  return (
    <CoursePage onBack={() => navigate(-1)} title="찜한 코스 보기">
      {favorites.isPending ? (
        <FeedbackState kind="loading" title="찜한 코스를 불러오는 중이에요" />
      ) : favorites.isError ? (
        <FeedbackState
          action={{ label: "다시 시도", onClick: () => void favorites.refetch() }}
          kind="error"
          title="찜한 코스를 불러오지 못했어요"
        />
      ) : !favorites.data?.length ? (
        <FeedbackState
          action={{
            label: "추천 기록 보기",
            onClick: () => void navigate("/course/recommendation/history"),
          }}
          kind="empty"
          title="아직 찜한 코스가 없어요"
        />
      ) : (
        <S.FavoriteContent>
          {remove.isError ? (
            <S.InlineError role="alert">찜을 해제하지 못했어요.</S.InlineError>
          ) : null}
          <S.FavoriteList>
            {favorites.data.map((favorite) => (
              <S.Favorite key={`${favorite.recommendationId}:${favorite.optionId}`}>
                <time>{formatDate(favorite.savedAt)}</time>
                <S.FavoriteOpen
                  onClick={() =>
                    void navigate(
                      `/course/recommendation/result/${encodeURIComponent(favorite.recommendationId)}/option/${encodeURIComponent(favorite.optionId)}`,
                    )
                  }
                  type="button"
                >
                  <strong>{favorite.option.title}</strong>
                  <small>
                    {favorite.option.stops.length}곳 · 이동 {favorite.option.totalTravelMinutes}분 ·{" "}
                    {formatMinutes(favorite.option.totalDurationMinutes)}
                  </small>
                </S.FavoriteOpen>
                <S.IconButton
                  aria-label={`${favorite.option.title} 찜 삭제`}
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate({
                      courseId: favorite.recommendationId,
                      optionId: favorite.optionId,
                    })
                  }
                  type="button"
                >
                  <Icon name="heart-filled" />
                </S.IconButton>
              </S.Favorite>
            ))}
          </S.FavoriteList>
        </S.FavoriteContent>
      )}
    </CoursePage>
  );
};

const S = {
  Page: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
  `,
  Scroll: styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 24px;
    padding: 24px;
    overflow: auto;
  `,
  Section: styled.section`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  Heading: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};
  `,
  PickerOpen: styled.button`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    padding: 16px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background: ${tokens.color.neutral[0]};
    text-align: left;
    strong {
      color: ${tokens.color.neutral[900]};
    }
    span {
      grid-column: 1;
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.body.xs};
    }
  `,
  SelectedPlace: styled.div`
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: ${tokens.color.primary[100]};

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  IconButton: styled.button`
    display: grid;
    width: 44px;
    height: 44px;
    flex: none;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: ${tokens.color.primary[500]};

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
    }
  `,
  FieldGrid: styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  `,
  Field: styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    label {
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.label.sm};
    }
  `,
  Select: styled.select`
    height: 48px;
    padding: 0 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 8px;
    background: ${tokens.color.neutral[0]};
  `,
  Bottom: styled.div`
    padding: 16px 24px 24px;
    border-top: 1px solid ${tokens.color.neutral[200]};
  `,
  Sheet: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 14px;
  `,
  PickerResults: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    overflow: auto;
  `,
  SheetBottom: styled.div`
    flex: none;
    padding-top: 2px;
  `,
  Tabs: styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid ${tokens.color.neutral[200]};
  `,
  Tab: styled.button<{ $active: boolean }>`
    padding: 10px;
    border: 0;
    border-bottom: 2px solid
      ${({ $active }) => ($active ? tokens.color.primary[500] : "transparent")};
    background: transparent;
    color: ${({ $active }) => ($active ? tokens.color.primary[700] : tokens.color.neutral[700])};
  `,
  Count: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[700]};
  `,
  List: styled.ul`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  `,
  ListItem: styled.li`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 10px;
    span {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 3px;
    }
    small {
      overflow: hidden;
      color: ${tokens.color.neutral[700]};
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  SelectPlace: styled.button`
    padding: 8px;
    border: 0;
    border-radius: 8px;
    background: ${tokens.color.primary[100]};
    color: ${tokens.color.primary[700]};
    &:disabled {
      background: ${tokens.color.neutral[200]};
    }
  `,
  Map: styled.div<{ $height?: string }>`
    height: ${({ $height }) => $height ?? "100%"};
    min-height: ${({ $height }) => $height ?? "220px"};
    overflow: hidden;
    background: ${tokens.color.secondary[100]};
  `,
  MapFallback: styled.div`
    display: grid;
    min-height: 220px;
    place-items: center;
    background: ${tokens.color.secondary[100]};
  `,
  Marker: styled.span`
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 2px solid white;
    border-radius: 50%;
    background: ${tokens.color.primary[500]};
    color: white;
  `,
  ResultMap: styled.section`
    position: relative;
    height: 310px;
  `,
  MapLabel: styled.span`
    position: absolute;
    z-index: 1;
    top: 12px;
    left: 16px;
    padding: 8px 10px;
    border-radius: 16px;
    background: ${tokens.color.neutral[0]};
  `,
  Result: styled.section`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    padding: 20px 24px;
  `,
  ResultHeader: styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `,
  ResultTitle: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};
  `,
  ResultCount: styled.span`
    color: ${tokens.color.primary[700]};
  `,
  SelectionStatus: styled.p`
    margin: 0;
    padding: 5px 10px;
    border-radius: 999px;
    background: ${tokens.color.primary[100]};
    color: ${tokens.color.primary[700]};
    white-space: nowrap;
    ${tokens.typography.label.xs};
  `,
  Option: styled.article<{ $selected: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border: 1px solid
      ${({ $selected }) => ($selected ? tokens.color.primary[500] : tokens.color.neutral[200])};
    border-radius: 12px;
    background: ${({ $selected }) =>
      $selected ? tokens.color.primary[50] : tokens.color.neutral[0]};
  `,
  OptionSelect: styled.button`
    display: flex;
    min-width: 0;
    flex: 1;
    gap: 10px;
    border: 0;
    background: transparent;
    cursor: pointer;
    text-align: left;
    b {
      display: grid;
      width: 24px;
      height: 24px;
      place-items: center;
      border-radius: 50%;
      background: ${tokens.color.primary[100]};
      color: ${tokens.color.primary[700]};
    }
    span {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 3px;
    }
    small {
      overflow: hidden;
      color: ${tokens.color.neutral[700]};
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
      border-radius: 8px;
    }
  `,
  TextButton: styled.button`
    min-height: 36px;
    flex: none;
    padding: 6px 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 999px;
    background: ${tokens.color.neutral[0]};
    color: ${tokens.color.primary[700]};
    cursor: pointer;
    ${tokens.typography.label.xs};

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
    }
  `,
  Detail: styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 14px;
    overflow: auto;
  `,
  Card: styled.section`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 24px;
    padding: 16px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background: white;
    h3,
    p {
      margin: 0;
    }
    span,
    p {
      color: ${tokens.color.neutral[700]};
    }
  `,
  Route: styled.p`
    color: ${tokens.color.primary[700]}!important;
  `,
  Stop: styled.div`
    display: grid;
    grid-template-columns: 42px 26px 1fr;
    gap: 8px;
    time {
      color: ${tokens.color.neutral[700]};
    }
    b {
      display: grid;
      width: 24px;
      height: 24px;
      place-items: center;
      border-radius: 50%;
      background: ${tokens.color.primary[100]};
    }
    span {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    small {
      color: ${tokens.color.neutral[700]};
    }
  `,
  HistoryContent: styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 20px;
    padding: 16px 24px;
  `,
  HistoryNotice: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
  `,
  HistoryList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  History: styled.li<{ $status: CourseHistoryDisplayStatus }>`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 16px 12px;
    border: 1px solid
      ${({ $status }) =>
        $status === "failed"
          ? tokens.color.warning[500]
          : $status === "empty" || $status === "cancelled"
            ? tokens.color.secondary[300]
            : tokens.color.neutral[200]};
    border-radius: 12px;
    background: ${({ $status }) =>
      $status === "empty" ? tokens.color.secondary[50] : tokens.color.neutral[0]};
    opacity: ${({ $status }) => ($status === "cancelled" ? 0.72 : 1)};
  `,
  HistoryOpen: styled.button`
    display: flex;
    flex: 1;
    align-self: stretch;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;

    &:active {
      background: ${tokens.color.neutral[50]};
    }

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: -2px;
      border-radius: 8px;
    }
  `,
  HistoryInfo: styled.div`
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 3px;
  `,
  HistoryDate: styled.time`
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
    font-size: 12px;
    font-weight: 500;
    line-height: 18px;
  `,
  HistoryTitle: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};
    font-size: 16px;
    line-height: 24px;
  `,
  HistoryDescription: styled.p<{ $status: CourseHistoryDisplayStatus }>`
    margin: 0;
    color: ${({ $status }) =>
      $status === "failed"
        ? tokens.color.warning[500]
        : $status === "empty" || $status === "cancelled"
          ? tokens.color.secondary[700]
          : tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
    font-size: 12px;
    line-height: 18px;
  `,
  HistoryStatusBadge: styled.span<{ $status: CourseHistoryDisplayStatus }>`
    width: fit-content;
    margin-top: 2px;
    padding: 3px 8px;
    border-radius: 999px;
    background: ${({ $status }) =>
      $status === "empty" ? tokens.color.secondary[100] : tokens.color.neutral[200]};
    color: ${tokens.color.secondary[700]};
    ${tokens.typography.label.xs};
  `,
  HistoryActions: styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: 12px;
  `,
  HistorySpinner: styled.div`
    width: 20px;
    height: 20px;
    border: 2px solid ${tokens.color.neutral[200]};
    border-top-color: ${tokens.color.primary[500]};
    border-radius: 50%;
    animation: course-history-spin 1s linear infinite;

    @keyframes course-history-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
  ModalInput: styled.input<{ $invalid: boolean }>`
    height: 44px;
    padding: 0 12px;
    border: 1px solid
      ${({ $invalid }) => ($invalid ? tokens.color.warning[500] : tokens.color.neutral[200])};
    border-radius: 8px;
  `,
  ModalError: styled.p`
    margin: 0;
    color: ${tokens.color.warning[500]};
    ${tokens.typography.body.xs};
  `,
  FavoriteContent: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  InlineError: styled.p`
    margin: 20px 24px 0;
    color: ${tokens.color.warning[500]};
    ${tokens.typography.body.xs};
  `,
  FavoriteList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 20px 24px;
    list-style: none;
  `,
  Favorite: styled.li`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
    padding: 14px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background: white;
    time {
      grid-column: 1/-1;
      color: ${tokens.color.neutral[700]};
    }
  `,
  FavoriteOpen: styled.button`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    border: 0;
    background: transparent;
    text-align: left;
    small {
      color: ${tokens.color.neutral[700]};
    }
  `,
};
