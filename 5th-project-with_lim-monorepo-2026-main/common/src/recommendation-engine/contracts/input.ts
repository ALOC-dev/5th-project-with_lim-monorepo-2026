import { z } from "zod";

import {
  BudgetRangeSchema, //예산 범위
  LocationInputSchema, //위치 입력
  PartyTypeSchema, //인원 유형
} from "./common.js";

const dateIsoRegex = /^\d{4}-\d{2}-\d{2}$/; 
const time24hRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const ScheduleInputSchema = z
  .object({
    dateISO: z.string().regex(dateIsoRegex), // 날짜 (ISO 형식, 예: "2026-05-07")
    time24h: z.string().regex(time24hRegex), // 시각 (24시간 형식, 예: "19:00")
    stayDurationMinutes: z.number().int().positive(), // 체류 시간(분), 예: 120
  })
  .strict();
export type ScheduleInput = z.infer<typeof ScheduleInputSchema>;  // 약속 일정 입력 타입

export const UserInputSchema = z
  .object({
    schedule: ScheduleInputSchema,  // 약속 일정 입력
    location: LocationInputSchema,  // 위치 입력

    numberOfPeople: z.number().int().positive(), // 인원 수
    partyType: PartyTypeSchema, // 인원 유형 Dropdown
    budgetPerPerson: BudgetRangeSchema, // 인당 예산 범위 [최소, 최대]

    userNaturalLanguageRequest: z.string().trim().min(1), // 사용자 자연어 요청
  })
  .strict();
export type UserInput = z.infer<typeof UserInputSchema>;   // 사용자 입력 타입

export const EngineInputSchema = z
  .object({
    userInput: UserInputSchema,  // 사용자 입력
    meta: z.unknown().optional(), // 메타 정보 (선택 사항, 추천 엔진에서 필요에 따라 사용)
  })
  .strict();
export type EngineInput = z.infer<typeof EngineInputSchema>; // 추천 엔진 입력 타입

// type EngineInput = {
//     userInput: {
//         schedule: {
//             dateISO: string;
//             time24h: string;
//             stayDurationMinutes: number;
//         };
//         location: {
//             lat: number;
//             lng: number;
//         }[];
//         numberOfPeople: number;
//         partyType: "FAMILY" | "FRIENDS" | "LOVERS" | "COLLEAGUES";
//         budgetPerPerson: [number, number];
//         userNaturalLanguageRequest: string;
//     };
//     meta?: unknown;
// }
