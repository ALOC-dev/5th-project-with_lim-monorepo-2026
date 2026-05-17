import { stripSearchMarkup } from "../../utils/operation-hours.js";

export const normalizeText = (value: string): string =>
  value.toLowerCase().replace(/\s+/gu, "");

export const normalizeComparableText = (value: string): string =>
  stripSearchMarkup(value)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");

export const tokenizeComparableText = (value: string): string[] =>
  stripSearchMarkup(value)
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

export const clamp01 = (value: number): number =>
  Math.min(Math.max(value, 0), 1);

export const stripHtml = (value: string): string =>
  value.replace(/<script[\s\S]*?<\/script>/giu, " ").replace(/<[^>]+>/gu, " ");
