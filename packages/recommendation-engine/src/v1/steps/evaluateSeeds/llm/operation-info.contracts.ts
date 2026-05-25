import { z } from "zod";

import { dayOfWeekValues } from "../../../interfaces/output.contracts.js";

const time24hRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const LlmBreakTimeSchema = z
  .object({
    start: z.string().regex(time24hRegex),
    end: z.string().regex(time24hRegex),
  })
  .strict();

const LlmOperationScheduleSchema = z
  .object({
    daysOfWeek: z.array(z.enum(dayOfWeekValues)).min(1),
    status: z.enum(["OPEN", "CLOSED"]),
    open: z.string().regex(time24hRegex).nullable(),
    close: z.string().regex(time24hRegex).nullable(),
    breakTimes: z.array(LlmBreakTimeSchema).nullable(),
    lastOrderTime: z.string().regex(time24hRegex).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "OPEN") {
      if (!value.open) {
        context.addIssue({
          code: "custom",
          message: "open is required when status is OPEN",
          path: ["open"],
        });
      }
      if (!value.close) {
        context.addIssue({
          code: "custom",
          message: "close is required when status is OPEN",
          path: ["close"],
        });
      }
      return;
    }

    if (value.open !== null) {
      context.addIssue({
        code: "custom",
        message: "open must be null when status is CLOSED",
        path: ["open"],
      });
    }
    if (value.close !== null) {
      context.addIssue({
        code: "custom",
        message: "close must be null when status is CLOSED",
        path: ["close"],
      });
    }
  });

export const LlmOperationInfoSchema = z
  .object({
    timezone: z.literal("Asia/Seoul"),
    schedules: z.array(LlmOperationScheduleSchema).min(1),
  })
  .strict();

export type LlmOperationInfo = z.infer<typeof LlmOperationInfoSchema>;

export const LlmOperationInfoResponseSchema = z
  .object({
    status: z.enum(["PARSED", "UNPARSEABLE"]),
    operationInfo: LlmOperationInfoSchema.nullable(),
    reason: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "PARSED" && !value.operationInfo) {
      context.addIssue({
        code: "custom",
        message: "operationInfo is required when status is PARSED",
        path: ["operationInfo"],
      });
    }
    if (value.status === "UNPARSEABLE" && value.operationInfo !== null) {
      context.addIssue({
        code: "custom",
        message: "operationInfo must be null when status is UNPARSEABLE",
        path: ["operationInfo"],
      });
    }
  });

export type LlmOperationInfoResponse = z.infer<typeof LlmOperationInfoResponseSchema>;
