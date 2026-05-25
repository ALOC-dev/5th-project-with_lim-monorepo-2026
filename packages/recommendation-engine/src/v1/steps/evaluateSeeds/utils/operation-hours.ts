import type { UserInput } from "../../../interfaces/input.contracts.js";
import {
  OperationInfoSchema,
  dayOfWeekValues,
  type BreakTime,
  type DayOfWeek,
  type DailyOperationInfo,
  type OperationInfo,
} from "../../../interfaces/output.contracts.js";
import type {
  OperationVerification,
  OperationVerificationStatus,
} from "./enrichment-types.js";

const DAY_LABEL_TO_DAY: Record<string, DayOfWeek> = {
  월: "MONDAY",
  화: "TUESDAY",
  수: "WEDNESDAY",
  목: "THURSDAY",
  금: "FRIDAY",
  토: "SATURDAY",
  일: "SUNDAY",
};

type ParsedOperationSchedule =
  | ({
      daysOfWeek: DayOfWeek[];
    } & Extract<DailyOperationInfo, { status: "OPEN" }>)
  | ({
      daysOfWeek: DayOfWeek[];
    } & Extract<DailyOperationInfo, { status: "CLOSED" }>);

export const parseOperationInfo = (
  text: string,
  requestedDay: DayOfWeek,
): OperationInfo | undefined => {
  // 여러 source가 주는 raw text는 줄바꿈/오전오후/HTML markup이 제각각이다.
  // 먼저 24h 표기로 정규화한 뒤 요일별 schedule parser를 태운다.
  const normalizedText = normalizeOperationText(text);
  const schedules = [
    ...parseOperationSchedules(normalizedText),
    ...parseCurrentOperationStatus(normalizedText, requestedDay),
  ];
  if (schedules.length === 0) return undefined;

  return OperationInfoSchema.parse({
    timezone: "Asia/Seoul",
    schedules: toOperationSchedulesRecord(mergeCompatibleSchedules(schedules)),
  });
};

const parseCurrentOperationStatus = (
  text: string,
  requestedDay: DayOfWeek,
): ParsedOperationSchedule[] => {
  // "오늘 휴무", "현재 영업 종료"처럼 시간 범위가 없는 현재 상태 문구만 처리한다.
  // "영업 중 23:00 종료" 같은 문구는 전체 영업시간이 아니므로 OPEN schedule로 만들지 않는다.
  const normalized = text.replace(/\s+/gu, " ");
  if (isClosedScheduleLine(normalized) && /오늘|현재/u.test(normalized)) {
    return [{ daysOfWeek: [requestedDay], status: "CLOSED" }];
  }

  if (
    /영업\s*종료\s*(?<open>(?:[01]?\d|2[0-3]):[0-5]\d)에\s*영업\s*시작/u.test(
      normalized,
    )
  ) {
    return [{ daysOfWeek: [requestedDay], status: "CLOSED" }];
  }

  return [];
};

const DAY_SCOPE_PATTERN =
  /(?:매일|연중무휴|평일|주말|[월화수목금토일](?:요일)?(?:\s*(?:-|~|–|—)\s*[월화수목금토일](?:요일)?)?)/gu;

const parseOperationSchedules = (text: string): ParsedOperationSchedule[] => {
  // 두 가지 형태를 모두 지원한다.
  // 1) "월-금 11:00-22:00 / 토 12:00-20:00"처럼 한 줄에 여러 day scope가 있는 경우
  // 2) "월요일" 다음 줄에 "11:00-22:00"이 나오는 경우
  const schedules: ParsedOperationSchedule[] = [];
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  let pendingDays: DayOfWeek[] = [];

  for (const line of lines) {
    const normalizedLine = normalizeOperationLine(line);
    const scopedSchedules = parseDayScopedSchedules(normalizedLine);
    if (scopedSchedules.length > 0) {
      schedules.push(...scopedSchedules);
      pendingDays = [];
      continue;
    }

    const daysOfWeek = parseDays(normalizedLine);
    const effectiveDays = daysOfWeek.length > 0 ? daysOfWeek : pendingDays;
    if (effectiveDays.length === 0) continue;

    const hours = parseOpenClose(normalizedLine);
    if (isClosedScheduleLine(normalizedLine) && !hours) {
      schedules.push({
        daysOfWeek: effectiveDays,
        status: "CLOSED",
      });
      pendingDays = [];
      continue;
    }

    if (!hours) {
      pendingDays = daysOfWeek;
      continue;
    }

    schedules.push({
      daysOfWeek: effectiveDays,
      status: "OPEN",
      open: hours.open,
      close: hours.close,
      breakTimes: parseBreakTimes(normalizedLine),
      lastOrderTime: parseLastOrderTime(normalizedLine),
    });
    pendingDays = [];
  }

  return mergeCompatibleSchedules(schedules);
};

const parseDayScopedSchedules = (
  line: string,
): ParsedOperationSchedule[] => {
  // 한 줄에 여러 요일 scope가 붙어 있을 때 scope 단위로 잘라 각 segment만 해석한다.
  // 이렇게 하지 않으면 "월-금 11:00 / 토 휴무" 같은 줄에서 휴무가 전체 요일에 번질 수 있다.
  const matches = [...line.matchAll(DAY_SCOPE_PATTERN)].filter(
    (match) => match.index !== undefined,
  );
  if (matches.length === 0) return [];

  const schedules: ParsedOperationSchedule[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index]?.index ?? 0;
    const end = matches[index + 1]?.index ?? line.length;
    const segment = line.slice(start, end).trim();
    const dayScope = matches[index]?.[0] ?? segment;
    const daysOfWeek = parseDays(dayScope);
    if (daysOfWeek.length === 0) continue;

    const hours = parseOpenClose(segment);
    if (hours) {
      schedules.push({
        daysOfWeek,
        status: "OPEN",
        open: hours.open,
        close: hours.close,
        breakTimes: parseBreakTimes(segment),
        lastOrderTime: parseLastOrderTime(segment),
      });
      continue;
    }

    if (isClosedScheduleLine(segment)) {
      schedules.push({
        daysOfWeek,
        status: "CLOSED",
      });
      continue;
    }
  }

  return schedules;
};

const parseDays = (line: string): DayOfWeek[] => {
  const normalized = line.replace(/요일/gu, "");
  if (/매일|연중무휴/u.test(normalized)) return [...dayOfWeekValues];

  const days = new Set<DayOfWeek>();
  if (/평일/u.test(normalized)) {
    ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].forEach((day) =>
      days.add(day as DayOfWeek),
    );
  }
  if (/주말/u.test(normalized)) {
    days.add("SATURDAY");
    days.add("SUNDAY");
  }

  for (const match of normalized.matchAll(
    /(?<start>[월화수목금토일])\s*(?:-|~|–|—)\s*(?<end>[월화수목금토일])/gu,
  )) {
    const start = match.groups?.start;
    const end = match.groups?.end;
    if (!start || !end) continue;
    expandDayRange(start, end).forEach((day) => days.add(day));
  }

  for (const [label, day] of Object.entries(DAY_LABEL_TO_DAY)) {
    if (normalized.includes(label)) days.add(day);
  }
  return [...days];
};

const expandDayRange = (startLabel: string, endLabel: string): DayOfWeek[] => {
  const start = DAY_LABEL_TO_DAY[startLabel];
  const end = DAY_LABEL_TO_DAY[endLabel];
  if (!start || !end) return [];

  const startIndex = dayOfWeekValues.indexOf(start);
  const endIndex = dayOfWeekValues.indexOf(end);
  const length =
    endIndex >= startIndex
      ? endIndex - startIndex + 1
      : dayOfWeekValues.length - startIndex + endIndex + 1;

  return Array.from(
    { length },
    (_, index) => dayOfWeekValues[(startIndex + index) % dayOfWeekValues.length],
  ).filter((day): day is DayOfWeek => day !== undefined);
};

const parseOpenClose = (
  line: string,
): { open: string; close: string } | undefined => {
  const match = line.match(
    /(?<open>(?:[01]?\d|2[0-3]):[0-5]\d)\s*(?:-|~|부터|–|—)\s*(?<close>(?:(?:[01]?\d|2[0-3]):[0-5]\d|24:00))/u,
  );
  const open = match?.groups?.open;
  const close = match?.groups?.close;
  if (!open || !close) return undefined;
  // 일부 scraper/source는 영업시간을 못 찾았을 때 00:00-23:59 같은 placeholder를 만든다.
  // 이 값을 실제 24시간 영업으로 오인하면 추천 품질이 크게 깨지므로 버린다.
  if (isAllDayPlaceholder(open, close)) return undefined;

  return {
    open: toTime24h(open),
    close: toCloseTime24h(close),
  };
};

const isAllDayPlaceholder = (open: string, close: string): boolean =>
  toTime24h(open) === "00:00" &&
  (close === "24:00" || ["23:59", "23:50"].includes(toTime24h(close)));

const isClosedScheduleLine = (line: string): boolean => {
  if (/휴무\s*없음|정기\s*휴무\s*없음|정기휴무\s*없음|연중무휴/u.test(line)) {
    return false;
  }
  return /(휴무|정기휴무|쉬는\s*날)/u.test(line);
};

const parseBreakTimes = (line: string): BreakTime[] => {
  if (!/(브레이크|휴게|break)/iu.test(line)) return [];
  const scoped = line
    .split(/브레이크\s*타임|브레이크|휴게|break\s*time|break/iu)
    .slice(1)
    .join(" ");
  const hours = parseOpenClose(scoped || line);
  return hours ? [{ start: hours.open, end: hours.close }] : [];
};

const parseLastOrderTime = (line: string): string | undefined => {
  const match = line.match(
    /(?:라스트\s*오더|주문\s*마감)[^\d]*(?<time>(?:[01]?\d|2[0-3]):[0-5]\d)/u,
  );
  return match?.groups?.time ? toTime24h(match.groups.time) : undefined;
};

export const mergeCompatibleSchedules = (
  schedules: ParsedOperationSchedule[],
): ParsedOperationSchedule[] => {
  // 우선 day 단위로 펼친 뒤 다시 같은 schedule끼리 묶는다.
  // 더 좁은 day scope가 더 구체적인 정보이므로 "매일"보다 "토요일" schedule을 우선한다.
  const byDay = new Map<DayOfWeek, ParsedOperationSchedule>();
  const scopeSizeByDay = new Map<DayOfWeek, number>();
  for (const schedule of schedules) {
    for (const day of schedule.daysOfWeek) {
      const next = { ...schedule, daysOfWeek: [day] };
      const existing = byDay.get(day);
      const existingScopeSize = scopeSizeByDay.get(day);
      if (
        !existing ||
        shouldReplaceSchedule(
          existing,
          next,
          existingScopeSize,
          schedule.daysOfWeek.length,
        )
      ) {
        byDay.set(day, next);
        scopeSizeByDay.set(day, schedule.daysOfWeek.length);
      }
    }
  }

  const grouped = new Map<string, ParsedOperationSchedule>();
  for (const schedule of byDay.values()) {
    const key = JSON.stringify({ ...schedule, daysOfWeek: undefined });
    const existing = grouped.get(key);
    if (existing) existing.daysOfWeek.push(...schedule.daysOfWeek);
    else grouped.set(key, schedule);
  }

  return [...grouped.values()];
};

const shouldReplaceSchedule = (
  existing: ParsedOperationSchedule,
  next: ParsedOperationSchedule,
  existingScopeSize = existing.daysOfWeek.length,
  nextScopeSize = next.daysOfWeek.length,
): boolean => {
  if (nextScopeSize < existingScopeSize) return true;
  if (nextScopeSize > existingScopeSize) return false;
  return existing.status === "OPEN" && next.status === "CLOSED";
};

export const toOperationSchedulesRecord = (
  schedules: ParsedOperationSchedule[],
): OperationInfo["schedules"] => {
  const byDay = Object.fromEntries(
    dayOfWeekValues.map((day) => [day, { status: "UNKNOWN" }]),
  ) as OperationInfo["schedules"];

  for (const schedule of schedules) {
    for (const day of schedule.daysOfWeek) {
      if (schedule.status === "CLOSED") {
        byDay[day] = { status: "CLOSED" };
        continue;
      }

      byDay[day] = {
        status: "OPEN",
        open: schedule.open,
        close: schedule.close,
        breakTimes: schedule.breakTimes,
        ...(schedule.lastOrderTime
          ? { lastOrderTime: schedule.lastOrderTime }
          : {}),
      };
    }
  }

  return byDay;
};

export class OperationVerifier {
  private readonly requestedDay: DayOfWeek;
  private readonly requestedStart: number;
  private readonly requestedEnd: number;

  constructor(private readonly schedule: UserInput["schedule"]) {
    this.requestedDay = toDayOfWeek(schedule.dateISO);
    this.requestedStart = toMinutes(schedule.time24h);
    this.requestedEnd = this.requestedStart + schedule.stayDurationMinutes;
  }

  get requestedDayOfWeek(): DayOfWeek {
    return this.requestedDay;
  }

  verify(
    operationInfo: OperationInfo,
    sourceUrls: string[],
  ): OperationVerification {
    // 요청 일자/도착 시간/체류 시간을 모두 만족해야 OPEN이다.
    // 단순히 "현재 영업 중"이 아니라 사용자가 머무는 전체 window를 검증한다.
    const schedule = operationInfo.schedules[this.requestedDay];

    if (schedule.status === "UNKNOWN") {
      return this.unknown({
        reason: `No operation schedule for ${this.requestedDay}`,
        sourceUrls,
      });
    }

    if (schedule.status === "CLOSED") {
      return this.closed({
        reason: `Closed on ${this.requestedDay}`,
        sourceUrls,
        confidence: 0.95,
      });
    }

    const open = toMinutes(schedule.open);
    const close = normalizeCloseMinutes(open, toMinutes(schedule.close));
    const overlapsBreak = schedule.breakTimes.some((breakTime) => {
      const breakStart = normalizeTimeForWindow(
        open,
        toMinutes(breakTime.start),
      );
      const breakEnd = normalizeTimeForWindow(
        breakStart,
        toMinutes(breakTime.end),
      );
      return this.requestedStart < breakEnd && this.requestedEnd > breakStart;
    });
    const lastOrder = schedule.lastOrderTime
      ? normalizeTimeForWindow(open, toMinutes(schedule.lastOrderTime))
      : undefined;

    if (this.requestedStart < open || this.requestedEnd > close) {
      return this.closed({
        reason: `Requested stay ${this.schedule.time24h}+${this.schedule.stayDurationMinutes}m is outside ${schedule.open}-${schedule.close}`,
        sourceUrls,
        confidence: 0.95,
      });
    }

    if (overlapsBreak) {
      return this.closed({
        reason: "Requested stay overlaps break time",
        sourceUrls,
        confidence: 0.9,
      });
    }

    if (lastOrder !== undefined && this.requestedStart > lastOrder) {
      return this.closed({
        reason: `Requested arrival is after last order ${schedule.lastOrderTime}`,
        sourceUrls,
        confidence: 0.9,
      });
    }

    return this.build("OPEN", {
      reason: `Verified open for ${this.requestedDay} ${this.schedule.time24h}`,
      sourceUrls,
      confidence: 0.9,
    });
  }

  unknown({
    reason,
    sourceUrls = [],
    confidence = 0,
  }: {
    reason: string;
    sourceUrls?: string[];
    confidence?: number;
  }): OperationVerification {
    return this.build("UNKNOWN", { reason, sourceUrls, confidence });
  }

  private closed({
    reason,
    sourceUrls,
    confidence,
  }: {
    reason: string;
    sourceUrls: string[];
    confidence: number;
  }): OperationVerification {
    return this.build("CLOSED", { reason, sourceUrls, confidence });
  }

  private build(
    status: OperationVerificationStatus,
    {
      reason,
      sourceUrls,
      confidence,
    }: { reason: string; sourceUrls: string[]; confidence: number },
  ): OperationVerification {
    return {
      status,
      requestedDateISO: this.schedule.dateISO,
      requestedTime24h: this.schedule.time24h,
      stayDurationMinutes: this.schedule.stayDurationMinutes,
      reason,
      sourceUrls,
      confidence,
    };
  }
}

const toDayOfWeek = (dateISO: string): DayOfWeek => {
  const day = new Date(`${dateISO}T00:00:00+09:00`).getDay();
  const dayOfWeek = dayOfWeekValues[(day + 6) % 7];
  if (!dayOfWeek) throw new Error(`Invalid dateISO: ${dateISO}`);
  return dayOfWeek;
};

const toMinutes = (time24h: string): number => {
  const [hour = "0", minute = "0"] = time24h.split(":");
  return Number(hour) * 60 + Number(minute);
};

const normalizeCloseMinutes = (open: number, close: number): number =>
  close <= open ? close + 24 * 60 : close;

const normalizeTimeForWindow = (windowStart: number, value: number): number =>
  value < windowStart ? value + 24 * 60 : value;

export const toTime24h = (value: string): string => {
  const [hour = "0", minute = "0"] = value.split(":");
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  if (hourNumber >= 24) return "23:59";
  return `${String(hourNumber).padStart(2, "0")}:${String(minuteNumber).padStart(2, "0")}`;
};

const toCloseTime24h = (value: string): string =>
  value === "24:00" ? "00:00" : toTime24h(value);

const normalizeOperationText = (value: string): string =>
  normalizeKoreanHourExpressions(
    normalizeEnglishMeridiemExpressions(stripSearchMarkup(value)),
  );

const normalizeOperationLine = (line: string): string =>
  line
    .replace(/[–—]/gu, "-")
    .replace(/(\d{1,2})\s*시\s*(\d{1,2})?\s*분?/gu, (_, hour, minute) =>
      `${String(hour).padStart(2, "0")}:${String(minute ?? "00").padStart(2, "0")}`,
    );

const normalizeKoreanHourExpressions = (value: string): string =>
  value.replace(
    /(오전|오후)\s*(\d{1,2})(?:시|:)?\s*(\d{1,2})?\s*분?/gu,
    (_, period: string, hour: string, minute: string | undefined) => {
      let hourNumber = Number(hour);
      if (period === "오전" && hourNumber === 12) hourNumber = 0;
      if (period === "오후" && hourNumber < 12) hourNumber += 12;
      return `${String(hourNumber).padStart(2, "0")}:${String(minute ?? "00").padStart(2, "0")}`;
    },
  );

const normalizeEnglishMeridiemExpressions = (value: string): string =>
  value.replace(
    /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/giu,
    (_, hour: string, minute: string | undefined, period: string) => {
      let hourNumber = Number(hour);
      const upperPeriod = period.toUpperCase();
      if (upperPeriod === "AM" && hourNumber === 12) hourNumber = 0;
      if (upperPeriod === "PM" && hourNumber < 12) hourNumber += 12;
      return `${String(hourNumber).padStart(2, "0")}:${String(minute ?? "00").padStart(2, "0")}`;
    },
  );

export const stripSearchMarkup = (value: string): string =>
  value
    .replace(/<\/?b>/giu, "")
    .replace(/&quot;/giu, '"')
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#39;/giu, "'");
