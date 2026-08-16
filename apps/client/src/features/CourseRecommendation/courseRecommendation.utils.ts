import type { CourseHistoryItem, CourseOption } from "./course.types";

export type CourseHistoryDisplayStatus = "pending" | "success" | "failed" | "empty" | "cancelled";

export const formatCurrency = (value: number) =>
  `${new Intl.NumberFormat("ko-KR").format(value)}원`;

export const formatCourseCost = (cost: CourseOption["estimatedCostPerPerson"]) => {
  if (cost.quality === "UNKNOWN" || cost.min === null || cost.max === null) {
    return "비용 정보 미확인";
  }
  const prefix = cost.quality === "ESTIMATED" ? "1인 약 " : "1인 ";
  if (cost.min === cost.max) return `${prefix}${formatCurrency(cost.min)}`;
  return `${prefix}${formatCurrency(cost.min)}~${formatCurrency(cost.max)}`;
};

export const getCourseCandidateCounts = (option: CourseOption) => {
  const included = option.candidateDecisions.filter(({ code }) => code === "INCLUDED").length;
  return {
    included: included || option.stops.length,
    total: option.candidateDecisions.length || option.stops.length,
  } as const;
};

export const formatMinutes = (value: number) =>
  value % 60 === 0
    ? `${Math.floor(value / 60)}시간`
    : `${Math.floor(value / 60)}시간 ${value % 60}분`;

export const formatDate = (value: string) => value.slice(0, 10).replace(/-/g, ". ");

export const historySummary = (item: CourseHistoryItem) =>
  item.status === "PENDING" || item.status === "RUNNING"
    ? "추천 결과를 만드는 중이에요"
    : item.status === "FAILED"
      ? "추천을 만들지 못했어요"
      : item.status === "CANCELLED"
        ? "추천 생성을 취소했어요"
        : item.status === "EMPTY"
          ? "조건에 맞는 코스를 찾지 못했어요"
          : `추천 코스 ${item.optionCount ?? 0}개`;

export const historyDisplayStatus = (item: CourseHistoryItem): CourseHistoryDisplayStatus => {
  switch (item.status) {
    case "PENDING":
    case "RUNNING":
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

export const historyStatusLabel = (item: CourseHistoryItem) => {
  if (item.legacy) return "이전 추천 결과";
  if (item.status === "EMPTY") return "결과 없음";
  if (item.status === "CANCELLED") return "생성 취소됨";
  return null;
};

export const canOpenHistory = (item: CourseHistoryItem) => item.status !== "CANCELLED";
