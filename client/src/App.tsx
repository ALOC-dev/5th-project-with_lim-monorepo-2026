import { useEffect, useMemo, useState } from "react";

import styled from "@emotion/styled";
import type { DayOfWeek, OperationSchedule, PlaceRecommendationItem } from "@monorepo/common";

import { mockEngineOutput } from "./mockEngineOutput";

type RouteState = { page: "results" } | { page: "detail"; id: string };

const parseRoute = (pathname: string): RouteState => {
  if (pathname.startsWith("/places/")) {
    const id = decodeURIComponent(pathname.replace("/places/", "").trim());
    if (id.length > 0) {
      return { page: "detail", id };
    }
  }
  return { page: "results" };
};

const navigate = (next: RouteState) => {
  const nextPath =
    next.page === "results" ? "/results" : `/places/${encodeURIComponent(next.id)}`;
  window.history.pushState(null, "", nextPath);
};

const formatPriceRange = ([min, max]: [number, number]): string => {
  const formatter = new Intl.NumberFormat("ko-KR");
  if (min === max) {
    return `${formatter.format(min)}원`;
  }
  return `${formatter.format(min)}~${formatter.format(max)}원`;
};

const dayOfWeekOrder: DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const dayOfWeekLabels: Record<DayOfWeek, string> = {
  MONDAY: "월",
  TUESDAY: "화",
  WEDNESDAY: "수",
  THURSDAY: "목",
  FRIDAY: "금",
  SATURDAY: "토",
  SUNDAY: "일",
};

const getDayOfWeekFromDateISO = (dateISO: string): DayOfWeek => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!match) {
    throw new Error(`Invalid ISO date: ${dateISO}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const dayIndex = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ][dayIndex] as DayOfWeek;
};

const formatDaysOfWeek = (daysOfWeek: DayOfWeek[]): string => {
  if (daysOfWeek.length === 0) {
    return "";
  }

  const sortedDays = [...daysOfWeek].sort(
    (a, b) => dayOfWeekOrder.indexOf(a) - dayOfWeekOrder.indexOf(b),
  );
  const ranges: string[] = [];

  let rangeStart = 0;
  for (let index = 1; index <= sortedDays.length; index += 1) {
    const previousDay = sortedDays[index - 1]!;
    const currentDay = sortedDays[index];
    const isConsecutive =
      currentDay &&
      dayOfWeekOrder.indexOf(currentDay) === dayOfWeekOrder.indexOf(previousDay) + 1;

    if (isConsecutive) {
      continue;
    }

    const startDay = sortedDays[rangeStart]!;
    const endDay = previousDay;
    ranges.push(
      startDay === endDay
        ? dayOfWeekLabels[startDay]
        : `${dayOfWeekLabels[startDay]}-${dayOfWeekLabels[endDay]}`,
    );
    rangeStart = index;
  }

  return ranges.join(", ");
};

const findScheduleForDay = (
  item: PlaceRecommendationItem,
  dayOfWeek: DayOfWeek,
): OperationSchedule | undefined =>
  item.operationInfo.schedules.find((schedule) => schedule.daysOfWeek.includes(dayOfWeek));

const formatBreakTimes = (breakTimes: { start: string; end: string }[]): string => {
  if (breakTimes.length === 0) {
    return "없음";
  }
  return breakTimes.map((slot) => `${slot.start}-${slot.end}`).join(", ");
};

const formatOperationSchedule = (schedule: OperationSchedule): string => {
  const days = formatDaysOfWeek(schedule.daysOfWeek);
  if (schedule.status === "CLOSED") {
    return `${days} 휴무`;
  }

  const details = [
    `${days} ${schedule.open}-${schedule.close}`,
    `브레이크 ${formatBreakTimes(schedule.breakTimes)}`,
    `라스트오더 ${schedule.lastOrderTime ?? "정보 없음"}`,
  ];
  return details.join(" · ");
};

const formatOperationSummary = (
  item: PlaceRecommendationItem,
  requestedDayOfWeek: DayOfWeek,
): string => {
  const schedule = findScheduleForDay(item, requestedDayOfWeek);
  const dayLabel = dayOfWeekLabels[requestedDayOfWeek];

  if (!schedule) {
    return `${dayLabel} 운영 정보 없음`;
  }
  if (schedule.status === "CLOSED") {
    return `${dayLabel} 휴무`;
  }
  return `${dayLabel} ${schedule.open}-${schedule.close}`;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const getMarkerPosition = (
  item: PlaceRecommendationItem,
  allItems: PlaceRecommendationItem[],
): { left: number; top: number } => {
  const lats = allItems.map((place) => place.location.lat);
  const lngs = allItems.map((place) => place.location.lng);

  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lngMin = Math.min(...lngs);
  const lngMax = Math.max(...lngs);

  const latRange = latMax - latMin;
  const lngRange = lngMax - lngMin;

  const latRatio = latRange === 0 ? 0.5 : (item.location.lat - latMin) / latRange;
  const lngRatio = lngRange === 0 ? 0.5 : (item.location.lng - lngMin) / lngRange;

  return {
    left: clamp(lngRatio * 100, 8, 92),
    top: clamp((1 - latRatio) * 100, 8, 92),
  };
};

const ds = {
  color: {
    primary: "var(--color-primary)",
    primaryActive: "var(--color-primary-active)",
    primaryDisabled: "var(--color-primary-disabled)",
    ink: "var(--color-ink)",
    body: "var(--color-body)",
    muted: "var(--color-muted)",
    hairline: "var(--color-hairline)",
    canvas: "var(--color-canvas)",
    surfaceSoft: "var(--color-surface-soft)",
    surfaceCard: "var(--color-surface-card)",
    surfaceDark: "var(--color-surface-dark)",
    onPrimary: "var(--color-on-primary)",
    onDark: "var(--color-on-dark)",
    accentTeal: "var(--color-accent-teal)",
    error: "var(--color-error)",
  },
  typo: {
    displaySmFamily: "var(--typography-display-sm-font-family)",
    displaySmSize: "var(--typography-display-sm-font-size)",
    titleMdSize: "var(--typography-title-md-font-size)",
    bodyMdSize: "var(--typography-body-md-font-size)",
    bodySmSize: "var(--typography-body-sm-font-size)",
    buttonSize: "var(--typography-button-font-size)",
    buttonFamily: "var(--typography-button-font-family)",
    buttonWeight: "var(--typography-button-font-weight)",
  },
};

const AppRoot = styled.main({
  minHeight: "100vh",
  fontFamily: `${ds.typo.buttonFamily}, 'Noto Sans KR', 'Pretendard', sans-serif`,
  background:
    "radial-gradient(circle at 15% 20%, rgba(204, 120, 92, 0.15), transparent 36%), radial-gradient(circle at 85% 10%, rgba(93, 184, 166, 0.12), transparent 40%), var(--color-canvas)",
  color: ds.color.ink,
  padding: "1.5rem",
  a: {
    color: ds.color.primary,
  },
});

const Header = styled.header({
  maxWidth: "1200px",
  margin: "0 auto 1rem auto",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1rem",
});

const HeadingWrap = styled.div({
  display: "grid",
  gap: "0.35rem",
});

const Heading = styled.h1({
  margin: 0,
  fontFamily: ds.typo.displaySmFamily,
  fontSize: ds.typo.displaySmSize,
  letterSpacing: "var(--typography-display-sm-letter-spacing)",
  lineHeight: "var(--typography-display-sm-line-height)",
  fontWeight: 400,
});

const SubHeading = styled.p({
  margin: 0,
  color: ds.color.body,
  fontSize: ds.typo.bodyMdSize,
});

const BodyLayout = styled.section({
  maxWidth: "1200px",
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "minmax(320px, 420px) 1fr",
  gap: "1rem",
  "@media (max-width: 920px)": {
    gridTemplateColumns: "1fr",
  },
});

const ListColumn = styled.section({
  display: "grid",
  gap: "0.85rem",
  alignContent: "start",
});

const CardButton = styled.button<{ selected: boolean }>(({ selected }) => ({
  textAlign: "left",
  border: selected ? `2px solid ${ds.color.primary}` : `1px solid ${ds.color.hairline}`,
  background: selected ? ds.color.surfaceCard : ds.color.canvas,
  borderRadius: "12px",
  padding: "1rem",
  boxShadow: selected
    ? "0 10px 20px rgba(204, 120, 92, 0.18)"
    : "0 6px 16px rgba(20, 20, 19, 0.08)",
  cursor: "pointer",
  transition: "all 180ms ease",
  display: "grid",
  gap: "0.6rem",
}));

const CardTopRow = styled.div({
  display: "flex",
  justifyContent: "space-between",
  gap: "0.75rem",
  alignItems: "center",
});

const PlaceName = styled.h2({
  margin: 0,
  fontSize: ds.typo.titleMdSize,
  lineHeight: 1.2,
  color: ds.color.ink,
});

const ScoreBadge = styled.span({
  background: ds.color.surfaceDark,
  color: ds.color.onDark,
  borderRadius: "999px",
  padding: "0.2rem 0.6rem",
  fontSize: "0.75rem",
  fontWeight: 700,
  whiteSpace: "nowrap",
});

const TagList = styled.ul({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem",
});

const Tag = styled.li({
  borderRadius: "999px",
  background: ds.color.surfaceCard,
  color: ds.color.ink,
  fontSize: "0.75rem",
  padding: "0.2rem 0.55rem",
  fontWeight: 600,
});

const CardMeta = styled.p({
  margin: 0,
  fontSize: ds.typo.bodySmSize,
  color: ds.color.body,
});

const MapPanel = styled.section({
  position: "relative",
  minHeight: "540px",
  borderRadius: "18px",
  overflow: "hidden",
  background:
    "linear-gradient(135deg, rgba(245, 240, 232, 1) 0%, rgba(250, 249, 245, 1) 65%, rgba(239, 233, 222, 1) 100%)",
  border: `1px solid ${ds.color.hairline}`,
  boxShadow: "0 8px 20px rgba(20, 20, 19, 0.08)",
});

const MapGrid = styled.div({
  position: "absolute",
  inset: 0,
  backgroundImage:
    "linear-gradient(rgba(20, 20, 19, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(20, 20, 19, 0.08) 1px, transparent 1px)",
  backgroundSize: "28px 28px",
});

const MarkerButton = styled.button<{ active: boolean; left: number; top: number }>(
  ({ active, left, top }) => ({
    position: "absolute",
    left: `${left}%`,
    top: `${top}%`,
    transform: "translate(-50%, -50%)",
    width: active ? "26px" : "18px",
    height: active ? "26px" : "18px",
    borderRadius: "999px",
    border: active ? `3px solid ${ds.color.primary}` : `2px solid ${ds.color.ink}`,
    background: active ? ds.color.accentTeal : ds.color.canvas,
    cursor: "pointer",
    boxShadow: active
      ? "0 0 0 10px rgba(204, 120, 92, 0.22)"
      : "0 2px 10px rgba(20, 20, 19, 0.18)",
    transition: "all 180ms ease",
    padding: 0,
  }),
);

const MapLegend = styled.div({
  position: "absolute",
  right: "1rem",
  bottom: "1rem",
  background: "rgba(250, 249, 245, 0.94)",
  border: `1px solid ${ds.color.hairline}`,
  borderRadius: "12px",
  padding: "0.7rem 0.85rem",
  fontSize: "0.82rem",
  color: ds.color.body,
  display: "grid",
  gap: "0.3rem",
});

const DetailWrap = styled.section({
  maxWidth: "960px",
  margin: "0 auto",
  background: ds.color.canvas,
  border: `1px solid ${ds.color.hairline}`,
  borderRadius: "20px",
  boxShadow: "0 12px 24px rgba(20, 20, 19, 0.08)",
  padding: "1.2rem",
  display: "grid",
  gap: "1rem",
});

const BackButton = styled.button({
  justifySelf: "start",
  border: `1px solid ${ds.color.hairline}`,
  background: ds.color.canvas,
  color: ds.color.ink,
  borderRadius: "8px",
  padding: "0.55rem 0.95rem",
  fontSize: ds.typo.buttonSize,
  fontWeight: ds.typo.buttonWeight,
  cursor: "pointer",
});

const SectionTitle = styled.h3({
  margin: 0,
  fontSize: "1rem",
});

const InfoGrid = styled.div({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem",
  "@media (max-width: 700px)": {
    gridTemplateColumns: "1fr",
  },
});

const InfoCard = styled.article({
  border: `1px solid ${ds.color.hairline}`,
  background: ds.color.surfaceCard,
  borderRadius: "14px",
  padding: "0.8rem",
  display: "grid",
  gap: "0.45rem",
});

const InfoLabel = styled.span({
  fontSize: "0.76rem",
  color: ds.color.muted,
  fontWeight: 700,
  letterSpacing: "0.02em",
});

const InfoValue = styled.p({
  margin: 0,
  fontSize: "0.94rem",
  lineHeight: 1.45,
});

const LinkList = styled.ul({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "0.3rem",
});

const ReasonList = styled.ol({
  margin: 0,
  paddingLeft: "1.2rem",
  display: "grid",
  gap: "0.35rem",
});

const JsonBlock = styled.pre({
  margin: 0,
  padding: "0.75rem",
  background: ds.color.surfaceDark,
  color: ds.color.onDark,
  borderRadius: "12px",
  fontSize: "0.78rem",
  overflowX: "auto",
});

const App = () => {
  const [route, setRoute] = useState<RouteState>(() => parseRoute(window.location.pathname));
  const [selectedId, setSelectedId] = useState<string>(() => {
    if (mockEngineOutput.status !== "SUCCESS") {
      return "";
    }
    return mockEngineOutput.userOutput.recommendations[0]?.id ?? "";
  });

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRoute(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (mockEngineOutput.status !== "SUCCESS") {
    return <AppRoot>응답을 불러오지 못했습니다.</AppRoot>;
  }

  const recommendations = mockEngineOutput.userOutput.recommendations;
  const requestedDayOfWeek = getDayOfWeekFromDateISO(
    mockEngineOutput.userInput.schedule.dateISO,
  );
  const selectedItem =
    recommendations.find((item) => item.id === selectedId) ?? recommendations[0];

  const goToResults = () => {
    setRoute({ page: "results" });
    navigate({ page: "results" });
  };

  const goToDetail = (id: string) => {
    setRoute({ page: "detail", id });
    navigate({ page: "detail", id });
  };

  const routeItem =
    route.page === "detail"
      ? recommendations.find((item) => item.id === route.id) ?? null
      : null;

  const metaJson = useMemo(
    () =>
      JSON.stringify(
        {
          userInput: mockEngineOutput.userInput,
          meta: mockEngineOutput.meta,
        },
        null,
        2,
      ),
    [],
  );

  if (route.page === "detail") {
    if (!routeItem) {
      return (
        <AppRoot>
          <DetailWrap>
            <BackButton onClick={goToResults}>목록으로 돌아가기</BackButton>
            <Heading>존재하지 않는 장소입니다.</Heading>
          </DetailWrap>
        </AppRoot>
      );
    }

    return (
      <AppRoot>
        <DetailWrap>
          <BackButton onClick={goToResults}>목록으로 돌아가기</BackButton>
          <HeadingWrap>
            <Heading>{routeItem.name}</Heading>
            <SubHeading>
              {routeItem.mainCategory} · {routeItem.subCategory}
            </SubHeading>
          </HeadingWrap>
          <TagList>
            {routeItem.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </TagList>

          <InfoGrid>
            <InfoCard>
              <InfoLabel>주력 컨텐츠</InfoLabel>
              <InfoValue>{routeItem.contentSummary}</InfoValue>
            </InfoCard>
            <InfoCard>
              <InfoLabel>예상 비용</InfoLabel>
              <InfoValue>{formatPriceRange(routeItem.priceRangePerPerson)}</InfoValue>
            </InfoCard>
            <InfoCard>
              <InfoLabel>운영 시간</InfoLabel>
              {routeItem.operationInfo.schedules.map((schedule) => (
                <InfoValue key={`${schedule.status}-${schedule.daysOfWeek.join("-")}`}>
                  {formatOperationSchedule(schedule)}
                </InfoValue>
              ))}
            </InfoCard>
            <InfoCard>
              <InfoLabel>위치</InfoLabel>
              <InfoValue>{routeItem.location.placeName}</InfoValue>
              <InfoValue>{routeItem.location.roadAddressKo}</InfoValue>
              <InfoValue>
                좌표: {routeItem.location.lat}, {routeItem.location.lng}
              </InfoValue>
            </InfoCard>
            <InfoCard>
              <InfoLabel>추천 점수</InfoLabel>
              <InfoValue>{routeItem.score} / 100</InfoValue>
            </InfoCard>
            <InfoCard>
              <InfoLabel>내부 ID</InfoLabel>
              <InfoValue>{routeItem.id}</InfoValue>
            </InfoCard>
          </InfoGrid>

          <section>
            <SectionTitle>추천 근거</SectionTitle>
            <ReasonList>
              {routeItem.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ReasonList>
          </section>

          <section>
            <SectionTitle>참고 링크</SectionTitle>
            <LinkList>
              <li>
                <a href={routeItem.referenceUrls.kakaoMap} target="_blank" rel="noreferrer">
                  카카오맵
                </a>
              </li>
              <li>
                <a href={routeItem.referenceUrls.naverMap} target="_blank" rel="noreferrer">
                  네이버맵
                </a>
              </li>
              {routeItem.referenceUrls.instagram ? (
                <li>
                  <a
                    href={routeItem.referenceUrls.instagram}
                    target="_blank"
                    rel="noreferrer"
                  >
                    인스타그램
                  </a>
                </li>
              ) : null}
              {routeItem.referenceUrls.others?.map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noreferrer">
                    기타 링크
                  </a>
                </li>
              ))}
            </LinkList>
          </section>

          <section>
            <SectionTitle>출력/입력 메타 확인</SectionTitle>
            <JsonBlock>{metaJson}</JsonBlock>
          </section>
        </DetailWrap>
      </AppRoot>
    );
  }

  return (
    <AppRoot>
      <Header>
        <HeadingWrap>
          <Heading>추천 결과 화면</Heading>
          <SubHeading>장소 카드와 지도에서 후보를 확인하고 상세로 이동합니다.</SubHeading>
        </HeadingWrap>
      </Header>

      <BodyLayout>
        <ListColumn>
          {recommendations.map((item) => (
            <CardButton
              key={item.id}
              selected={selectedItem?.id === item.id}
              onClick={() => goToDetail(item.id)}
            >
              <CardTopRow>
                <PlaceName>{item.name}</PlaceName>
                <ScoreBadge>{item.score}점</ScoreBadge>
              </CardTopRow>
              <TagList>
                {item.tags.map((tag) => (
                  <Tag key={`${item.id}-${tag}`}>{tag}</Tag>
                ))}
              </TagList>
              <CardMeta>{item.contentSummary}</CardMeta>
              <CardMeta>운영: {formatOperationSummary(item, requestedDayOfWeek)}</CardMeta>
              <CardMeta>예상 비용: {formatPriceRange(item.priceRangePerPerson)}</CardMeta>
              <CardMeta>
                <strong>클릭:</strong> 장소 상세 페이지 이동
              </CardMeta>
            </CardButton>
          ))}
        </ListColumn>

        <MapPanel>
          <MapGrid />
          {recommendations.map((item) => {
            const position = getMarkerPosition(item, recommendations);
            const isActive = selectedItem?.id === item.id;
            return (
              <MarkerButton
                key={item.id}
                active={isActive}
                left={position.left}
                top={position.top}
                onClick={() => {
                  setSelectedId(item.id);
                  goToDetail(item.id);
                }}
                title={item.name}
              />
            );
          })}

          <MapLegend>
            <span>지도 패널(목업)</span>
            <span>선택: {selectedItem?.name ?? "-"}</span>
            <span>주소: {selectedItem?.location.roadAddressKo ?? "-"}</span>
          </MapLegend>
        </MapPanel>
      </BodyLayout>
    </AppRoot>
  );
};

export default App;
