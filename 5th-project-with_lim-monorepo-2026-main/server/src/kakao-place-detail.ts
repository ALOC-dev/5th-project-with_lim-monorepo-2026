/**
 * 카카오 Place Detail API 클라이언트 (비공개 엔드포인트)
 * URL: https://place.map.kakao.com/main/v/{placeId}
 *
 * 목적: 카카오 기본 검색 API가 미제공하는 영업시간 실제 데이터 수집
 * 주의: 비공개 API라 응답 구조가 변경될 수 있음 → 실패 시 기본값 fallback
 */

import type { OperationInfo, OperationSchedule, DayOfWeek } from "@monorepo/common";

// ── 카카오 응답 타입 ──────────────────────────────────────────────────────────
type KakaoTimeEntry = {
  timeName: string;  // "영업시간" | "브레이크타임" | "라스트오더"
  timeSE: string;    // "11:00 ~ 22:00"
  dayOfWeek: string; // "매일" | "월~금" | "토,일" | ...
};

type KakaoPlaceDetailResponse = {
  basicInfo?: {
    openHour?: {
      periodList?: Array<{
        periodName: string;
        timeList: KakaoTimeEntry[];
      }>;
      offdayList?: Array<{ holidayName: string }>;
    };
  };
};

// ── 요일 변환 ────────────────────────────────────────────────────────────────
const ALL_DAYS: DayOfWeek[] = [
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
];
const WEEKDAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const WEEKENDS: DayOfWeek[] = ["SATURDAY", "SUNDAY"];
const KO_ORDER = ["월", "화", "수", "목", "금", "토", "일"];
const KO_TO_DAY: Record<string, DayOfWeek> = {
  "월": "MONDAY", "화": "TUESDAY", "수": "WEDNESDAY",
  "목": "THURSDAY", "금": "FRIDAY", "토": "SATURDAY", "일": "SUNDAY",
};

// "매일" | "월~금" | "토,일" | "화~토" → DayOfWeek[]
const parseDayOfWeek = (dayStr: string): DayOfWeek[] => {
  const s = dayStr.trim();
  if (s === "매일") return ALL_DAYS;
  if (s === "평일" || s === "월~금") return WEEKDAYS;
  if (s === "주말" || s === "토~일" || s === "토,일") return WEEKENDS;

  // 범위 형태: "화~토"
  const range = s.match(/^([월화수목금토일])~([월화수목금토일])$/);
  if (range) {
    const from = KO_ORDER.indexOf(range[1]!);
    const to = KO_ORDER.indexOf(range[2]!);
    if (from !== -1 && to !== -1) {
      return KO_ORDER.slice(from, to + 1)
        .map((d) => KO_TO_DAY[d]!)
        .filter(Boolean);
    }
  }

  // 열거 형태: "월,화,수"
  return s.split(",")
    .map((d) => KO_TO_DAY[d.trim()]!)
    .filter(Boolean);
};

// ── 시간 파싱 ────────────────────────────────────────────────────────────────
// "11:00 ~ 22:00" → { open: "11:00", close: "22:00" }
const parseTimeSE = (timeSE: string): { open: string; close: string } | null => {
  const m = timeSE.match(/(\d{2}:\d{2})\s*~\s*(\d{2}:\d{2})/);
  if (!m) return null;
  return { open: m[1]!, close: m[2]! };
};

// ── 누락 요일 CLOSED로 채우기 ─────────────────────────────────────────────────
// OperationInfoSchema: 7일 전체를 반드시 커버해야 함
const fillMissingDays = (schedules: OperationSchedule[]): OperationSchedule[] => {
  const covered = new Set(schedules.flatMap((s) => s.daysOfWeek));
  const missing = ALL_DAYS.filter((d) => !covered.has(d));
  if (missing.length === 0) return schedules;
  return [...schedules, { daysOfWeek: missing, status: "CLOSED" as const }];
};

// ── 메인 함수 ────────────────────────────────────────────────────────────────
/**
 * 카카오 Place Detail API로 영업시간 조회
 * 실패 or 데이터 없으면 null 반환 → collect-candidates에서 기본값으로 fallback
 */
export const fetchKakaoOperationInfo = async (
  placeId: string,
): Promise<OperationInfo | null> => {
  try {
    const res = await fetch(
      `https://place.map.kakao.com/main/v/${placeId}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://map.kakao.com/",
          "Accept": "application/json",
        },
      },
    );
    if (!res.ok) {
      console.warn(`[카카오 상세 API] ${placeId} → ${res.status}`);
      return null;
    }

    const data = (await res.json()) as KakaoPlaceDetailResponse;
    if (!data.basicInfo) {
      console.warn(`[카카오 상세 API] ${placeId} → basicInfo 없음`);
      return null;
    }
    const periodList = data.basicInfo?.openHour?.periodList;
    if (!periodList?.length) return null;

    const schedules: OperationSchedule[] = [];

    for (const period of periodList) {
      // 영업시간 entry
      const mainEntry = period.timeList.find((t) => t.timeName === "영업시간");
      if (!mainEntry) continue;

      const times = parseTimeSE(mainEntry.timeSE);
      if (!times) continue;

      const daysOfWeek = parseDayOfWeek(mainEntry.dayOfWeek);
      if (!daysOfWeek.length) continue;

      // 브레이크타임
      const breakEntry = period.timeList.find((t) => t.timeName === "브레이크타임");
      const breakTimes: { start: string; end: string }[] = [];
      if (breakEntry) {
        const bt = parseTimeSE(breakEntry.timeSE);
        if (bt) breakTimes.push({ start: bt.open, end: bt.close });
      }

      // 라스트오더
      const loEntry = period.timeList.find((t) => t.timeName === "라스트오더");
      const lastOrderTime = loEntry ? parseTimeSE(loEntry.timeSE)?.open : undefined;

      const schedule: OperationSchedule = {
        daysOfWeek,
        status: "OPEN",
        open: times.open,
        close: times.close,
        breakTimes,
        ...(lastOrderTime && { lastOrderTime }),
      };
      schedules.push(schedule);
    }

    if (schedules.length === 0) return null;

    // 누락 요일 CLOSED로 채워서 7일 전체 커버
    const filled = fillMissingDays(schedules);
    return { timezone: "Asia/Seoul", schedules: filled };
  } catch {
    return null;
  }
};
