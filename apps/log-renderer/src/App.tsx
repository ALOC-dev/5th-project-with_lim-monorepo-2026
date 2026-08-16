import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchEvents, fetchRun, fetchRuns } from "./api";
import {
  EmptyState,
  EngineView,
  ErrorState,
  IssueBanner,
  LoadingState,
  PlacesView,
  RawView,
  RunOverview,
  Sidebar,
  TabNavigation,
  type ViewTab,
} from "./components";
import { importArtifactFiles } from "./lib/import-artifacts";
import { buildCandidates } from "./lib/model";
import type { ArtifactIssue, LogEvent, RunSnapshot, RunSummary } from "./types";

const POLL_INTERVAL_MS = 2_000;

const App = () => {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRemoteId, setSelectedRemoteId] = useState<string>();
  const [snapshot, setSnapshot] = useState<RunSnapshot>();
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [rawEventLines, setRawEventLines] = useState<string[]>([]);
  const [eventIssues, setEventIssues] = useState<ArtifactIssue[]>([]);
  const [tab, setTab] = useState<ViewTab>("engine");
  const [listLoading, setListLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [error, setError] = useState<string>();
  const eventCursor = useRef<{ offset: number; line: number; fileToken?: string }>({
    offset: 0,
    line: 1,
  });

  const refreshRuns = useCallback(async () => {
    try {
      setRuns(await fetchRuns());
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRuns();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshRuns();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refreshRuns]);

  const openRemoteRun = useCallback(async (id: string) => {
    setSelectedRemoteId(id);
    setRunLoading(true);
    setError(undefined);
    try {
      const [nextSnapshot, chunk] = await Promise.all([fetchRun(id), fetchEvents(id, 0, 1)]);
      setSnapshot(nextSnapshot);
      setEvents(chunk?.events ?? []);
      setRawEventLines(chunk?.rawLines ?? []);
      setEventIssues(chunk?.issues ?? []);
      eventCursor.current = {
        offset: chunk?.nextOffset ?? 0,
        line: chunk?.nextLine ?? 1,
        fileToken: chunk?.fileToken,
      };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSnapshot(undefined);
    } finally {
      setRunLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedRemoteId || snapshot?.summary.status !== "RUNNING") return;
    const refreshRunning = async (): Promise<void> => {
      if (document.visibilityState !== "visible") return;
      try {
        const [nextSnapshot, chunk] = await Promise.all([
          fetchRun(selectedRemoteId),
          fetchEvents(
            selectedRemoteId,
            eventCursor.current.offset,
            eventCursor.current.line,
            eventCursor.current.fileToken,
          ),
        ]);
        setSnapshot(nextSnapshot);
        if (chunk) {
          setEvents((current) => (chunk.reset ? chunk.events : [...current, ...chunk.events]));
          setRawEventLines((current) =>
            chunk.reset ? chunk.rawLines : [...current, ...chunk.rawLines],
          );
          setEventIssues((current) => (chunk.reset ? chunk.issues : [...current, ...chunk.issues]));
          eventCursor.current = {
            offset: chunk.nextOffset,
            line: chunk.nextLine,
            fileToken: chunk.fileToken,
          };
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    };
    const interval = window.setInterval(() => void refreshRunning(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [selectedRemoteId, snapshot?.summary.status]);

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setRunLoading(true);
    setError(undefined);
    try {
      const imported = await importArtifactFiles(files);
      setSelectedRemoteId(undefined);
      setSnapshot(imported.snapshot);
      setEvents(imported.events);
      setRawEventLines(imported.rawEventLines);
      setEventIssues([]);
      eventCursor.current = { offset: 0, line: 1 };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunLoading(false);
    }
  }, []);

  const candidates = useMemo(
    () => (snapshot ? buildCandidates(snapshot, events) : []),
    [events, snapshot],
  );
  const issues = useMemo(
    () => [...(snapshot?.issues ?? []), ...eventIssues],
    [eventIssues, snapshot?.issues],
  );

  return (
    <div className="app-shell">
      <Sidebar
        loading={listLoading}
        onFiles={(files) => void handleFiles(files)}
        onSelect={(id) => void openRemoteRun(id)}
        runs={runs}
        selectedId={selectedRemoteId}
      />
      {runLoading ? (
        <LoadingState />
      ) : error && !snapshot ? (
        <ErrorState message={error} />
      ) : !snapshot ? (
        <EmptyState />
      ) : (
        <main className="workspace">
          <div className="workspace-scroll">
            <RunOverview events={events} snapshot={snapshot} />
            <IssueBanner issues={issues} />
            {error ? <div className="inline-error">자동 갱신 오류: {error}</div> : null}
            <TabNavigation onChange={setTab} tab={tab} />
            {tab === "engine" ? <EngineView candidates={candidates} events={events} /> : null}
            {tab === "places" ? <PlacesView events={events} snapshot={snapshot} /> : null}
            {tab === "raw" ? (
              <RawView events={events} rawEventLines={rawEventLines} snapshot={snapshot} />
            ) : null}
          </div>
        </main>
      )}
    </div>
  );
};

export default App;
