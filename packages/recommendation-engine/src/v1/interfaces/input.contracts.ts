import { z } from "zod";

import { BudgetRangeSchema, LocationInputSchema, PartyTypeSchema } from "./common.contracts.js";

const dateIsoRegex = /^\d{4}-\d{2}-\d{2}$/;
const time24hRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const ScheduleInputSchema = z
  .object({
    dateISO: z.string().regex(dateIsoRegex), // 날짜 (ISO 형식, 예: "2026-04-10")
    time24h: z.string().regex(time24hRegex), // 시각 (24시간 형식, 예: "19:00")
    stayDurationMinutes: z.number().int().positive(), // 체류 시간(분), 예: 120
  })
  .strict();

export type ScheduleInput = z.infer<typeof ScheduleInputSchema>;

export const UserInputSchema = z
  .object({
    schedule: ScheduleInputSchema,
    location: LocationInputSchema,

    numberOfPeople: z.number().int().positive(), // 인원 수
    partyType: PartyTypeSchema, // 인원 유형 Dropdown
    budgetPerPerson: BudgetRangeSchema, // 인당 예산 범위 [최소, 최대]

    userNaturalLanguageRequest: z.string().trim().min(1), // 사용자 자연어 요청
  })
  .strict();

export type UserInput = z.infer<typeof UserInputSchema>;

export const EngineInputSchema = z
  .object({
    userInput: UserInputSchema,
    meta: z.unknown().optional(),
  })
  .strict();
export type EngineInput = z.infer<typeof EngineInputSchema>;
