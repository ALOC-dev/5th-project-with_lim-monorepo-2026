import type { EventsChunk, RunSnapshot, RunSummary } from "./types";

const API_PREFIX = "/__log-renderer/api";

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
};

export const fetchRuns = async (): Promise<RunSummary[]> => {
  const response = await fetchJson<{ runs: RunSummary[] }>(`${API_PREFIX}/runs`);
  return response.runs;
};

export const fetchRun = (id: string): Promise<RunSnapshot> =>
  fetchJson(`${API_PREFIX}/runs/${encodeURIComponent(id)}`);

export const fetchEvents = async (
  id: string,
  offset: number,
  line: number,
  fileToken?: string,
): Promise<EventsChunk | null> => {
  const params = new URLSearchParams({ offset: String(offset), line: String(line) });
  if (fileToken) params.set("fileToken", fileToken);
  const url = `${API_PREFIX}/runs/${encodeURIComponent(id)}/events?${params.toString()}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as EventsChunk;
};
