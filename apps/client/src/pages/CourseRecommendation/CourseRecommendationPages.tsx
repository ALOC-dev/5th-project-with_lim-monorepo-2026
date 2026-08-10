import styled from "@emotion/styled";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomOverlayMap, Map, Polyline } from "react-kakao-maps-sdk";
import { useNavigate, useParams } from "react-router-dom";

import BottomSheet from "../../components/BottomSheet/BottomSheet";
import { Button } from "../../components/Button";
import FeedbackState from "../../components/FeedbackState/FeedbackState";
import Header from "../../components/Header/Header";
import { Icon } from "../../components/Icon";
import { Input } from "../../components/Input";
import Modal from "../../components/Modal/Modal";
import PageRoot from "../../components/PageRoot/PageRoot";
import { SearchInput } from "../../components/SearchInput";
import { tokens } from "../../design-system/tokens.generated";
import { courseRepository, getCoursePlace } from "./courseRepository";
import type { CourseDraft, CourseHistoryItem, CourseOption, CoursePlace } from "./course.types";

const MAX_SELECTED_PLACES = 15;
const formatCurrency = (value: number) => `${new Intl.NumberFormat("ko-KR").format(value)}원`;
const formatMinutes = (value: number) => {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
};
const formatDate = (value: string) => value.replace(/-/g, ". ");
const getHistoryResultSummary = (history: CourseHistoryItem) => {
  if (history.status === "PENDING") return "추천 결과를 만드는 중이에요";
  if (history.status === "FAILED") return "추천을 만들지 못했어요";
  if (history.status === "CANCELLED") return "추천 생성을 취소했어요";
  return `추천 코스 ${history.optionCount ?? 0}개`;
};

const CoursePage = ({
  children,
  onBack,
  title,
  right,
}: {
  readonly children: React.ReactNode;
  readonly onBack?: () => void;
  readonly title: string;
  readonly right?: React.ReactNode;
}) => (
  <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
    <Header onBack={onBack} right={right} title={title} />
    <S.Content>{children}</S.Content>
  </PageRoot>
);

const CourseOptionMap = ({
  option,
  onSelectStop,
}: {
  readonly option: CourseOption;
  readonly onSelectStop?: () => void;
}) => {
  const center = option.stops[0] ?? null;
  if (!center) {
    return <S.MapFallback>표시할 장소가 없어요.</S.MapFallback>;
  }

  return (
    <S.MapArea>
      <Map
        center={{ lat: center.lat, lng: center.lng }}
        level={5}
        style={{ height: "100%", width: "100%" }}
      >
        <Polyline
          path={option.stops.map((stop) => ({ lat: stop.lat, lng: stop.lng }))}
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
            <S.MapMarker
              aria-label={`${index + 1}번째 장소 ${stop.name}`}
              onClick={onSelectStop}
              type="button"
            >
              {index + 1}
            </S.MapMarker>
          </CustomOverlayMap>
        ))}
      </Map>
    </S.MapArea>
  );
};

export const CourseRecommendationFormPage = () => {
  const navigate = useNavigate();
  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const [date, setDate] = useState("2026-07-18");
  const [startTime, setStartTime] = useState("18:30");
  const [durationHours, setDurationHours] = useState(3);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerSource, setPickerSource] = useState<"FAVORITE" | "SEARCH">("FAVORITE");
  const [query, setQuery] = useState("");

  const selectedPlaces = useMemo(
    () => placeIds.map(getCoursePlace).filter((place): place is CoursePlace => place !== null),
    [placeIds],
  );
  const pickerPlaces = useMemo(
    () => courseRepository.listPickerPlaces(query, pickerSource),
    [pickerSource, query],
  );
  const togglePlace = (id: string) => {
    setPlaceIds((current) => {
      if (current.includes(id)) {
        return current.filter((placeId) => placeId !== id);
      }
      return current.length >= MAX_SELECTED_PLACES ? current : [...current, id];
    });
  };
  const submit = () => {
    const draft: CourseDraft = { date, durationHours, placeIds, startTime };
    const job = courseRepository.startRecommendation(draft);
    void navigate(`/course/recommendation/pending/${encodeURIComponent(job.id)}`);
  };

  return (
    <CoursePage onBack={() => navigate(-1)} title="코스 추천">
      <S.Scroll>
        <S.Section>
          <S.SectionHeading>
            선택 장소 {placeIds.length} / {MAX_SELECTED_PLACES}
          </S.SectionHeading>
          <S.PlacePickerButton onClick={() => setIsPickerOpen(true)} type="button">
            <S.PlacePickerTitle>
              {selectedPlaces.length === 0 ? "장소 선택" : "선택 장소"}
            </S.PlacePickerTitle>
            <S.PlacePickerHint>
              {selectedPlaces.length === 0
                ? "즐겨찾기 또는 검색으로 장소를 골라주세요."
                : `${selectedPlaces[0]?.name ?? ""} 외 ${selectedPlaces.length - 1}곳`}
            </S.PlacePickerHint>
            <Icon name="chevron-right" size={20} />
          </S.PlacePickerButton>
          {selectedPlaces.length > 0 ? (
            <S.SelectedPlaceList aria-label="선택한 장소">
              {selectedPlaces.map((place) => (
                <S.SelectedPlace key={place.id}>
                  <span>{place.name}</span>
                  <S.IconButton
                    aria-label={`${place.name} 선택 해제`}
                    onClick={() => togglePlace(place.id)}
                    type="button"
                  >
                    <Icon name="close" size={18} />
                  </S.IconButton>
                </S.SelectedPlace>
              ))}
            </S.SelectedPlaceList>
          ) : null}
        </S.Section>

        <S.Section>
          <S.SectionHeading>약속 시간</S.SectionHeading>
          <S.FieldGrid>
            <S.Field>
              <S.Label>날짜</S.Label>
              <Input
                id="course-date"
                onChange={(event) => setDate(event.target.value)}
                type="date"
                value={date}
              />
            </S.Field>
            <S.Field>
              <S.Label>시작 시간</S.Label>
              <Input
                id="course-time"
                onChange={(event) => setStartTime(event.target.value)}
                type="time"
                value={startTime}
              />
            </S.Field>
          </S.FieldGrid>
          <S.Field>
            <S.Label>총 시간</S.Label>
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
      </S.Scroll>

      <S.BottomAction>
        <Button disabled={placeIds.length === 0} onClick={submit} type="button" width="100%">
          코스 추천 받기
        </Button>
      </S.BottomAction>

      <BottomSheet
        close={() => setIsPickerOpen(false)}
        height="min(78dvh, 680px)"
        id="course-place-picker"
        isOpen={isPickerOpen}
      >
        <S.SheetContent>
          <S.SheetTitle>장소 선택</S.SheetTitle>
          <S.TabRow>
            <S.TabButton
              $active={pickerSource === "FAVORITE"}
              onClick={() => {
                setPickerSource("FAVORITE");
                setQuery("");
              }}
              type="button"
            >
              즐겨찾기
            </S.TabButton>
            <S.TabButton
              $active={pickerSource === "SEARCH"}
              onClick={() => setPickerSource("SEARCH")}
              type="button"
            >
              장소 검색
            </S.TabButton>
          </S.TabRow>
          {pickerSource === "SEARCH" ? (
            <SearchInput
              backHandler={() => {
                setQuery("");
                setPickerSource("FAVORITE");
              }}
              clearHandler={() => setQuery("")}
              isSearchMode
              onChange={(event) => setQuery(event.target.value)}
              placeholder="장소명으로 검색"
              value={query}
            />
          ) : null}
          <S.PickerCount>
            선택 장소 {placeIds.length} / {MAX_SELECTED_PLACES}
          </S.PickerCount>
          {pickerPlaces.length === 0 ? (
            <FeedbackState
              description="다른 검색어로 다시 찾아보세요."
              kind="empty"
              title="검색 결과가 없어요"
            />
          ) : (
            <S.PickerList>
              {pickerPlaces.map((place) => {
                const isSelected = placeIds.includes(place.id);
                const isAtLimit = placeIds.length >= MAX_SELECTED_PLACES && !isSelected;
                return (
                  <S.PickerItem key={place.id}>
                    <S.PickerText>
                      <strong>{place.name}</strong>
                      <span>{place.category}</span>
                      <span>{place.address}</span>
                    </S.PickerText>
                    <S.SelectPlaceButton
                      disabled={isAtLimit}
                      onClick={() => togglePlace(place.id)}
                      type="button"
                    >
                      {isSelected ? "선택됨" : isAtLimit ? "최대 선택" : "선택"}
                    </S.SelectPlaceButton>
                  </S.PickerItem>
                );
              })}
            </S.PickerList>
          )}
          <Button onClick={() => setIsPickerOpen(false)} type="button" width="100%">
            선택 완료
          </Button>
        </S.SheetContent>
      </BottomSheet>
    </CoursePage>
  );
};

export const CourseRecommendationPendingPage = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) {
      setError("추천 요청을 찾을 수 없습니다.");
      return;
    }
    let active = true;
    void courseRepository.completeRecommendation(courseId).then(
      (result) => {
        if (!active) return;
        void navigate(`/course/recommendation/result/${encodeURIComponent(result.id)}`, {
          replace: true,
        });
      },
      () => active && setError("코스 추천을 만들지 못했습니다. 다시 시도해 주세요."),
    );
    return () => {
      active = false;
    };
  }, [courseId, navigate]);

  return (
    <CoursePage onBack={() => navigate("/course/recommendation/form")} title="코스 추천 중">
      {error ? (
        <FeedbackState
          action={{
            label: "추천 폼으로",
            onClick: () => void navigate("/course/recommendation/form"),
          }}
          kind="error"
          title={error}
        />
      ) : (
        <FeedbackState
          description="선택한 장소와 약속 시간을 바탕으로 4개의 코스를 만들고 있어요."
          kind="loading"
          title="코스를 추천하는 중이에요"
        />
      )}
    </CoursePage>
  );
};

export const CourseRecommendationResultPage = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const recommendation = courseId ? courseRepository.getRecommendation(courseId) : null;
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    recommendation?.options[0]?.id ?? null,
  );
  const selectedOption =
    recommendation?.options.find((option) => option.id === selectedOptionId) ??
    recommendation?.options[0] ??
    null;

  if (!recommendation || !courseId) {
    return (
      <CoursePage onBack={() => navigate("/course/recommendation/form")} title="코스 결과">
        <FeedbackState
          action={{
            label: "코스 추천받기",
            onClick: () => void navigate("/course/recommendation/form"),
          }}
          kind="error"
          title="추천 결과를 찾을 수 없어요"
        />
      </CoursePage>
    );
  }
  if (recommendation.status === "EMPTY") {
    return (
      <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 결과">
        <FeedbackState
          action={{
            label: "다시 추천받기",
            onClick: () => void navigate("/course/recommendation/form"),
          }}
          description="선택 장소를 늘리거나 약속 시간을 조정해 보세요."
          kind="empty"
          title="조건에 맞는 코스를 찾지 못했어요"
        />
      </CoursePage>
    );
  }
  if (recommendation.status === "FAILED") {
    return (
      <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 결과">
        <FeedbackState
          action={{
            label: "다시 추천받기",
            onClick: () => void navigate("/course/recommendation/form"),
          }}
          kind="error"
          title={recommendation.errorMessage ?? "추천 결과를 불러오지 못했어요"}
        />
      </CoursePage>
    );
  }
  if (recommendation.status !== "SUCCESS" || !selectedOption) {
    return (
      <CoursePage onBack={() => navigate("/course/recommendation/form")} title="코스 결과">
        <FeedbackState kind="error" title="추천 결과를 불러오지 못했어요" />
      </CoursePage>
    );
  }

  return (
    <CoursePage onBack={() => navigate("/course/recommendation/form")} title="코스 결과">
      <S.ResultMapSection>
        <S.MapSelectionLabel>선택 코스 · {selectedOption.type}</S.MapSelectionLabel>
        <CourseOptionMap option={selectedOption} />
      </S.ResultMapSection>
      <S.ResultSheet>
        <S.ResultHeading>추천 코스 {recommendation.options.length}개</S.ResultHeading>
        <S.OptionList>
          {recommendation.options.map((option, index) => (
            <S.OptionCard $selected={option.id === selectedOption.id} key={option.id}>
              <S.OptionSelect onClick={() => setSelectedOptionId(option.id)} type="button">
                <S.Rank>{index + 1}</S.Rank>
                <S.OptionSummary>
                  <strong>{option.type}</strong>
                  <span>{option.stops.map((stop) => stop.name).join(" → ")}</span>
                  <span>
                    {option.stops.length}곳 · 총 {formatMinutes(option.totalDurationMinutes)} · 이동{" "}
                    {option.totalTravelMinutes}분 · 1인 {formatCurrency(option.pricePerPersonWon)}
                  </span>
                </S.OptionSummary>
              </S.OptionSelect>
              <S.OptionAction
                onClick={() =>
                  void navigate(
                    `/course/recommendation/result/${encodeURIComponent(courseId)}/option/${encodeURIComponent(option.id)}`,
                  )
                }
                type="button"
              >
                상세 보기
              </S.OptionAction>
            </S.OptionCard>
          ))}
        </S.OptionList>
      </S.ResultSheet>
    </CoursePage>
  );
};

export const CourseRecommendationOptionDetailPage = () => {
  const navigate = useNavigate();
  const { courseId, optionId } = useParams();
  const option = courseId && optionId ? courseRepository.getOption(courseId, optionId) : null;
  const [version, setVersion] = useState(0);
  if (!courseId || !optionId || !option) {
    return (
      <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 상세">
        <FeedbackState kind="error" title="코스 상세를 찾을 수 없어요" />
      </CoursePage>
    );
  }
  const toggleFavorite = () => {
    courseRepository.toggleFavorite(courseId, optionId);
    setVersion((value) => value + 1);
  };
  void version;
  return (
    <CoursePage
      onBack={() => navigate(`/course/recommendation/result/${encodeURIComponent(courseId)}`)}
      right={
        <S.HeartButton aria-label="코스 찜하기" onClick={toggleFavorite} type="button">
          <Icon name={option.isFavorite ? "heart-filled" : "heart-outline"} />
        </S.HeartButton>
      }
      title="코스 상세"
    >
      <S.DetailScroll>
        <CourseOptionMap option={option} />
        <S.DetailCard>
          <S.DetailTitle>{option.title}</S.DetailTitle>
          <S.DetailMeta>
            {option.stops.length}곳 · 총 {formatMinutes(option.totalDurationMinutes)} · 이동{" "}
            {option.totalTravelMinutes}분 · 1인 {formatCurrency(option.pricePerPersonWon)}
          </S.DetailMeta>
          <S.RouteSummary>{option.stops.map((stop) => stop.name).join(" → ")}</S.RouteSummary>
        </S.DetailCard>
        <S.DetailCard>
          <S.Subheading>코스 구성 이유</S.Subheading>
          <S.BodyText>{option.reason}</S.BodyText>
        </S.DetailCard>
        <S.DetailCard>
          <S.Subheading>시간순 코스</S.Subheading>
          <S.Timeline>
            {option.stops.map((stop, index) => (
              <S.Stop key={stop.id}>
                <S.StopTime>{stop.visitTime}</S.StopTime>
                <S.StopDot>{index + 1}</S.StopDot>
                <S.StopContent>
                  <strong>{stop.name}</strong>
                  <span>
                    {stop.activityLabel} · {stop.stayMinutes}분 체류
                  </span>
                </S.StopContent>
              </S.Stop>
            ))}
          </S.Timeline>
        </S.DetailCard>
      </S.DetailScroll>
    </CoursePage>
  );
};

export const CourseRecommendationHistoryPage = () => {
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<CourseHistoryItem | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<CourseHistoryItem | null>(null);
  const histories = courseRepository.listHistory();
  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 250);
    return () => window.clearTimeout(timer);
  }, []);
  const refresh = () => setVersion((value) => value + 1);
  void version;
  const saveTitle = () => {
    if (editing && courseRepository.renameHistory(editing.id, title)) {
      setEditing(null);
      refresh();
    }
  };
  const confirmDeletion = () => {
    if (!deleting) return;
    if (deleting.status === "PENDING") courseRepository.cancelPendingHistory(deleting.id);
    else courseRepository.deleteHistory(deleting.id);
    setDeleting(null);
    refresh();
  };
  const openHistory = (history: CourseHistoryItem) => {
    if (!history.recommendationId) return;
    void navigate(`/course/recommendation/result/${encodeURIComponent(history.recommendationId)}`);
  };
  return (
    <CoursePage onBack={() => navigate(-1)} title="코스 추천 기록">
      {isLoading ? (
        <FeedbackState kind="loading" title="추천 기록을 불러오는 중이에요" />
      ) : histories.length === 0 ? (
        <FeedbackState
          action={{
            label: "코스 추천받기",
            onClick: () => void navigate("/course/recommendation/form"),
          }}
          kind="empty"
          title="아직 추천받은 기록이 없어요"
        />
      ) : (
        <S.HistoryList>
          {histories.map((history) => (
            <S.HistoryCard key={history.id}>
              <S.HistoryOpen
                disabled={
                  !history.recommendationId ||
                  history.status === "PENDING" ||
                  history.status === "CANCELLED"
                }
                onClick={() => openHistory(history)}
                type="button"
              >
                <S.StatusBadge $status={history.status}>
                  {history.status === "SUCCESS"
                    ? "완료"
                    : history.status === "PENDING"
                      ? "생성 중"
                      : history.status === "EMPTY"
                        ? "결과 없음"
                        : history.status === "FAILED"
                          ? "실패"
                          : "취소됨"}
                </S.StatusBadge>
                <strong>{history.title}</strong>
                <span>
                  {formatDate(history.requestedAt.slice(0, 10))} · {getHistoryResultSummary(history)}
                </span>
              </S.HistoryOpen>
              <S.HistoryActions>
                {history.status === "SUCCESS" ? (
                  <S.IconButton
                    aria-label={`${history.title} 이름 변경`}
                    onClick={() => {
                      setEditing(history);
                      setTitle(history.title);
                    }}
                    type="button"
                  >
                    <Icon name="edit" size={18} />
                  </S.IconButton>
                ) : null}
                <S.IconButton
                  aria-label={`${history.title} 삭제`}
                  onClick={() => setDeleting(history)}
                  type="button"
                >
                  <Icon name="close" size={18} />
                </S.IconButton>
              </S.HistoryActions>
            </S.HistoryCard>
          ))}
        </S.HistoryList>
      )}
      <Modal
        close={() => setEditing(null)}
        id="course-history-rename"
        isOpen={editing !== null}
        primaryAction={{
          disabled: title.trim().length === 0 || title.trim().length > 60,
          label: "변경",
          onClick: saveTitle,
        }}
        secondaryAction={{ label: "취소", onClick: () => setEditing(null) }}
        title="기록 이름 변경"
      >
        <S.ModalInput
          aria-label="코스 기록 이름"
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
        {title.trim().length === 0 || title.trim().length > 60 ? (
          <S.Validation role="alert">
            앞뒤 공백을 제외한 이름을 1~60자로 입력해 주세요.
          </S.Validation>
        ) : null}
      </Modal>
      <Modal
        close={() => setDeleting(null)}
        description={
          deleting?.status === "PENDING"
            ? "생성 중인 코스 추천을 취소합니다."
            : "삭제한 기록은 다시 복구할 수 없어요."
        }
        id="course-history-delete"
        isOpen={deleting !== null}
        primaryAction={{
          label: deleting?.status === "PENDING" ? "취소하기" : "삭제하기",
          onClick: confirmDeletion,
        }}
        secondaryAction={{ label: "돌아가기", onClick: () => setDeleting(null) }}
        title={
          deleting?.status === "PENDING" ? "추천 생성을 취소할까요?" : "추천 기록을 삭제할까요?"
        }
      />
    </CoursePage>
  );
};

export const CourseFavoritePage = () => {
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const favorites = courseRepository.listFavorites();
  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 250);
    return () => window.clearTimeout(timer);
  }, []);
  void version;
  const removeFavorite = (recommendationId: string, optionId: string) => {
    courseRepository.toggleFavorite(recommendationId, optionId);
    setVersion((value) => value + 1);
  };
  return (
    <CoursePage onBack={() => navigate(-1)} title="찜한 코스 보기">
      {isLoading ? (
        <FeedbackState kind="loading" title="찜한 코스를 불러오는 중이에요" />
      ) : favorites.length === 0 ? (
        <FeedbackState
          action={{
            label: "추천 기록 보기",
            onClick: () => void navigate("/course/recommendation/history"),
          }}
          description="저장한 코스를 다시 확인할 수 있어요."
          kind="empty"
          title="아직 찜한 코스가 없어요"
        />
      ) : (
        <S.FavoriteList>
          {favorites.map((favorite) => {
            const option = courseRepository.getOption(favorite.recommendationId, favorite.optionId);
            return option ? (
              <S.FavoriteCard key={`${favorite.recommendationId}:${favorite.optionId}`}>
                <S.FavoriteDate>{formatDate(favorite.savedAt.slice(0, 10))}</S.FavoriteDate>
                <S.FavoriteOpen
                  onClick={() =>
                    void navigate(
                      `/course/recommendation/result/${encodeURIComponent(favorite.recommendationId)}/option/${encodeURIComponent(favorite.optionId)}`,
                    )
                  }
                  type="button"
                >
                  <strong>{option.title}</strong>
                  <span>{option.stops.length}곳 · 코스 추천</span>
                  <S.TagRow>
                    <S.Tag>이동 {option.totalTravelMinutes}분</S.Tag>
                    <S.Tag>{formatMinutes(option.totalDurationMinutes)}</S.Tag>
                  </S.TagRow>
                </S.FavoriteOpen>
                <S.IconButton
                  aria-label={`${option.title} 찜 삭제`}
                  onClick={() => removeFavorite(favorite.recommendationId, favorite.optionId)}
                  type="button"
                >
                  <Icon name="heart-filled" />
                </S.IconButton>
              </S.FavoriteCard>
            ) : null;
          })}
        </S.FavoriteList>
      )}
    </CoursePage>
  );
};

const S = {
  Content: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
  `,
  Scroll: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 24px;
    padding: 24px 28px;
    overflow: auto;
  `,
  Section: styled.section`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  SectionHeading: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};
  `,
  PlacePickerButton: styled.button`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    padding: 16px;
    text-align: left;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background: ${tokens.color.neutral[0]};
    color: ${tokens.color.neutral[900]};
    cursor: pointer;
  `,
  PlacePickerTitle: styled.strong`
    ${tokens.typography.body.md};
  `,
  PlacePickerHint: styled.span`
    grid-column: 1;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
  `,
  SelectedPlaceList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  SelectedPlace: styled.li`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 10px;
    background: ${tokens.color.primary[100]};
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.body.sm};
  `,
  IconButton: styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: ${tokens.color.neutral[700]};
    cursor: pointer;
  `,
  FieldGrid: styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  `,
  Field: styled.label`
    display: flex;
    flex-direction: column;
    gap: 6px;
  `,
  Label: styled.span`
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.label.sm};
  `,
  Select: styled.select`
    width: 100%;
    height: 48px;
    padding: 0 14px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 8px;
    background: ${tokens.color.neutral[0]};
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.body.sm};
  `,
  BottomAction: styled.div`
    padding: 16px 28px 24px;
    border-top: 1px solid ${tokens.color.neutral[200]};
    background: ${tokens.color.neutral[50]};
  `,
  SheetContent: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 16px;
  `,
  SheetTitle: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};
  `,
  TabRow: styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid ${tokens.color.neutral[200]};
  `,
  TabButton: styled.button<{ $active: boolean }>`
    padding: 10px;
    border: 0;
    border-bottom: 2px solid
      ${({ $active }) => ($active ? tokens.color.primary[500] : "transparent")};
    background: transparent;
    color: ${({ $active }) => ($active ? tokens.color.primary[700] : tokens.color.neutral[700])};
    ${tokens.typography.label.md};
    cursor: pointer;
  `,
  PickerCount: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
  `,
  PickerList: styled.ul`
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
  PickerItem: styled.li`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 10px;
  `,
  PickerText: styled.div`
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.body.xs};
    strong {
      ${tokens.typography.label.md};
    }
    span {
      color: ${tokens.color.neutral[700]};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  SelectPlaceButton: styled.button`
    flex: none;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: ${tokens.color.primary[100]};
    color: ${tokens.color.primary[700]};
    ${tokens.typography.label.sm};
    cursor: pointer;
    &:disabled {
      background: ${tokens.color.neutral[200]};
      color: ${tokens.color.neutral[700]};
      cursor: not-allowed;
    }
  `,
  ResultMapSection: styled.section`
    position: relative;
    height: 310px;
    background: ${tokens.color.secondary[100]};
  `,
  MapArea: styled.div`
    height: 100%;
    min-height: 220px;
    overflow: hidden;
    border-radius: 0 0 18px 18px;
    background: ${tokens.color.secondary[100]};
  `,
  MapFallback: styled.div`
    display: grid;
    min-height: 220px;
    place-items: center;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.sm};
  `,
  MapSelectionLabel: styled.span`
    position: absolute;
    z-index: 2;
    top: 14px;
    left: 20px;
    padding: 8px 10px;
    border-radius: 20px;
    background: ${tokens.color.neutral[0]};
    color: ${tokens.color.neutral[900]};
    box-shadow: 0 2px 8px rgb(20 20 19 / 12%);
    ${tokens.typography.label.sm};
  `,
  MapMarker: styled.button`
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 2px solid ${tokens.color.neutral[0]};
    border-radius: 50%;
    background: ${tokens.color.primary[500]};
    color: ${tokens.color.neutral[0]};
    box-shadow: 0 2px 6px rgb(20 20 19 / 25%);
    ${tokens.typography.label.sm};
    cursor: pointer;
  `,
  ResultSheet: styled.section`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 14px;
    padding: 20px 24px;
    border-radius: 20px 20px 0 0;
    background: ${tokens.color.neutral[50]};
  `,
  ResultHeading: styled.h2`
    margin: 0;
    ${tokens.typography.title.xs};
    color: ${tokens.color.neutral[900]};
  `,
  OptionList: styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  OptionCard: styled.article<{ $selected: boolean }>`
    display: flex;
    gap: 10px;
    padding: 14px;
    border: 1px solid
      ${({ $selected }) => ($selected ? tokens.color.primary[500] : tokens.color.neutral[200])};
    border-radius: 12px;
    background: ${tokens.color.neutral[0]};
  `,
  OptionSelect: styled.button`
    display: flex;
    min-width: 0;
    flex: 1;
    gap: 10px;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  `,
  Rank: styled.span`
    display: grid;
    width: 24px;
    height: 24px;
    flex: none;
    place-items: center;
    border-radius: 50%;
    background: ${tokens.color.primary[100]};
    color: ${tokens.color.primary[700]};
    ${tokens.typography.label.sm};
  `,
  OptionSummary: styled.div`
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 3px;
    color: ${tokens.color.neutral[900]};
    strong {
      ${tokens.typography.label.md};
    }
    span {
      overflow: hidden;
      color: ${tokens.color.neutral[700]};
      text-overflow: ellipsis;
      white-space: nowrap;
      ${tokens.typography.body.xs};
    }
  `,
  OptionAction: styled.button`
    align-self: center;
    flex: none;
    padding: 8px;
    border: 0;
    background: transparent;
    color: ${tokens.color.primary[700]};
    ${tokens.typography.label.sm};
    cursor: pointer;
  `,
  HeartButton: styled.button`
    display: flex;
    border: 0;
    background: transparent;
    color: ${tokens.color.primary[500]};
    cursor: pointer;
  `,
  DetailScroll: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 14px;
    padding-bottom: 24px;
    overflow: auto;
  `,
  DetailCard: styled.section`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 24px;
    padding: 16px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background: ${tokens.color.neutral[0]};
  `,
  DetailTitle: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.sm};
  `,
  DetailMeta: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
  `,
  RouteSummary: styled.p`
    margin: 0;
    color: ${tokens.color.primary[700]};
    ${tokens.typography.body.sm};
  `,
  Subheading: styled.h3`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.label.lg};
  `,
  BodyText: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.sm};
  `,
  Timeline: styled.ol`
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  Stop: styled.li`
    display: grid;
    grid-template-columns: 42px 26px 1fr;
    align-items: start;
    gap: 8px;
  `,
  StopTime: styled.time`
    padding-top: 3px;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.utility.meta};
  `,
  StopDot: styled.span`
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 50%;
    background: ${tokens.color.primary[100]};
    color: ${tokens.color.primary[700]};
    ${tokens.typography.label.sm};
  `,
  StopContent: styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: ${tokens.color.neutral[900]};
    strong {
      ${tokens.typography.label.md};
    }
    span {
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.body.xs};
    }
  `,
  HistoryList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 20px 24px;
    list-style: none;
  `,
  HistoryCard: styled.li`
    display: flex;
    gap: 8px;
    padding: 14px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background: ${tokens.color.neutral[0]};
  `,
  HistoryOpen: styled.button`
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    border: 0;
    background: transparent;
    color: ${tokens.color.neutral[900]};
    text-align: left;
    cursor: pointer;
    strong {
      ${tokens.typography.label.md};
    }
    span {
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.body.xs};
    }
    &:disabled {
      cursor: default;
    }
  `,
  StatusBadge: styled.span<{ $status: string }>`
    padding: 3px 6px;
    border-radius: 6px;
    background: ${({ $status }) =>
      $status === "SUCCESS" ? tokens.color.tertiary[100] : tokens.color.secondary[100]};
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.label.xs};
  `,
  HistoryActions: styled.div`
    display: flex;
    align-items: flex-start;
    gap: 4px;
  `,
  ModalInput: styled.input`
    height: 44px;
    padding: 0 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 8px;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.body.sm};
  `,
  Validation: styled.p`
    margin: 0;
    color: ${tokens.color.warning[500]};
    ${tokens.typography.body.xs};
  `,
  FavoriteList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 20px 24px;
    list-style: none;
  `,
  FavoriteCard: styled.li`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 12px;
    padding: 14px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background: ${tokens.color.neutral[0]};
  `,
  FavoriteDate: styled.time`
    grid-column: 1/-1;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.utility.meta};
  `,
  FavoriteOpen: styled.button`
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    border: 0;
    background: transparent;
    color: ${tokens.color.neutral[900]};
    text-align: left;
    cursor: pointer;
    strong {
      ${tokens.typography.label.md};
    }
    span {
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.body.xs};
    }
  `,
  TagRow: styled.div`
    display: flex;
    gap: 6px;
    margin-top: 4px;
  `,
  Tag: styled.span`
    padding: 3px 6px;
    border-radius: 6px;
    background: ${tokens.color.primary[50]};
    color: ${tokens.color.primary[700]};
    ${tokens.typography.label.xs};
  `,
};
