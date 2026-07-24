import { z } from "zod";

export const RecommendationHistoryTitleSchema = z.string().trim().min(1).max(60);
export const RequestedAtSchema = z.iso.datetime();
