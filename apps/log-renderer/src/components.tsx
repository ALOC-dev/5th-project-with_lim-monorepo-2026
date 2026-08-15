import { useEffect, useMemo, useState } from "react";

import type { CandidateView } from "./lib/model";
import {
  asNumber,
  asRecordArray,
  asString,
  buildCandidates,
  eventMatches,
  getCandidateIdsForEvent,
  getRunStats,
  getUserInput,
  isRecord,
} from "./lib/model";
import type { ArtifactIssue, JsonRecord, LogEvent, RunSnapshot, RunSummary } from "./types";

export type ViewTab = "engine" | "places" | "raw";

const formatDate = (value: string | undefined): string => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
};

const formatDuration = (milliseconds: number | undefined): string => {
  if (milliseconds === undefined) return "—";
  if (milliseconds < 1_000) return `${milliseconds}ms`;
  const seconds = milliseconds / 1_000;
  return seconds < 60
    ? `${seconds.toFixed(1)}초`
    : `${Math.floor(seconds / 60)}분 ${Math.round(seconds % 60)}초`;
};

export const StatusBadge = ({ status }: { status: string }) => (
  <span className={`status-badge status-${status.toLocaleLowerCase()}`}>{status}</span>
);

export const Sidebar = ({
  runs,
  selectedId,
  onSelect,
  onFiles,
  loading,
}: {
  runs: RunSummary[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onFiles: (files: File[]) => void;
  loading: boolean;
}) => {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [scenario, setScenario] = useState("all");
  const [dragging, setDragging] = useState(false);
  const scenarios = useMemo(
    () =>
      [
        ...new Set(
          runs.map((run) => run.scenario).filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [runs],
  );
  const filteredRuns = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return runs.filter((run) => {
      if (status !== "all" && run.status !== status) return false;
      if (scenario !== "all" && run.scenario !== scenario) return false;
      if (!normalizedQuery) return true;
      return [run.name, run.scenario, run.runId, run.relativeDirectory]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [query, runs, scenario, status]);

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-mark">AL</div>
        <div>
          <strong>Engine Logs</strong>
          <span>local renderer</span>
        </div>
      </div>
      <label
        className={`drop-zone ${dragging ? "is-dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onFiles([...event.dataTransfer.files]);
        }}
      >
        <input
          accept=".json,.jsonl"
          multiple
          type="file"
          onChange={(event) => onFiles(event.target.files ? [...event.target.files] : [])}
        />
        <span>JSON / JSONL 열기</span>
        <small>놓거나 눌러서 선택</small>
      </label>
      <div className="run-filters">
        <input
          aria-label="실행 검색"
          placeholder="실행·시나리오 검색"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="filter-row">
          <select
            aria-label="상태 필터"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">모든 상태</option>
            <option value="RUNNING">RUNNING</option>
            <option value="PASS">PASS</option>
            <option value="FAIL">FAIL</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>
          <select
            aria-label="시나리오 필터"
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
          >
            <option value="all">모든 시나리오</option>
            {scenarios.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="run-list-heading">
        <span>실행 {filteredRuns.length}</span>
        {loading ? <span className="pulse-dot" title="목록 갱신 중" /> : null}
      </div>
      <div className="run-list">
        {filteredRuns.map((run) => (
          <button
            className={`run-item ${selectedId === run.id ? "is-selected" : ""}`}
            key={run.id}
            type="button"
            onClick={() => onSelect(run.id)}
          >
            <div className="run-item-top">
              <StatusBadge status={run.status} />
              <time>{formatDate(run.generatedAt ?? run.modifiedAt)}</time>
            </div>
            <strong>{run.scenario ?? run.name}</strong>
            <span title={run.runId ?? run.name}>{run.runId ?? run.name}</span>
            <div className="artifact-dots" aria-label="발견한 artifact">
              <i className={run.hasLog ? "active" : ""}>L</i>
              <i className={run.hasResult ? "active" : ""}>R</i>
              <i className={run.hasEvents ? "active" : ""}>E</i>
            </div>
          </button>
        ))}
        {!loading && filteredRuns.length === 0 ? (
          <p className="empty-copy">조건에 맞는 실행이 없습니다.</p>
        ) : null}
      </div>
    </aside>
  );
};

const JsonValue = ({ value, compact = false }: { value: unknown; compact?: boolean }) => (
  <pre className={compact ? "json-value compact" : "json-value"}>
    {JSON.stringify(value, null, 2)}
  </pre>
);

const SummaryCard = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) => (
  <div className={`summary-card ${tone ?? ""}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

export const RunOverview = ({
  snapshot,
  events,
}: {
  snapshot: RunSnapshot;
  events: LogEvent[];
}) => {
  const candidates = useMemo(() => buildCandidates(snapshot, events), [events, snapshot]);
  const stats = useMemo(
    () => getRunStats(snapshot, events, candidates),
    [candidates, events, snapshot],
  );
  const input = getUserInput(snapshot);
  const schedule = input && isRecord(input.schedule) ? input.schedule : {};
  return (
    <>
      <header className="run-header">
        <div>
          <div className="eyebrow">
            <StatusBadge status={snapshot.summary.status} />
            <span>{snapshot.summary.engineStatus ?? "ENGINE —"}</span>
            <span>{formatDuration(snapshot.summary.durationMs)}</span>
          </div>
          <h1>{snapshot.summary.scenario ?? snapshot.summary.name}</h1>
          <p>{snapshot.summary.runId ?? snapshot.summary.name}</p>
        </div>
        <dl className="request-summary">
          <div>
            <dt>요청</dt>
            <dd>{asString(input?.userNaturalLanguageRequest) ?? "—"}</dd>
          </div>
          <div>
            <dt>일정</dt>
            <dd>
              {[
                asString(schedule.dateISO),
                asString(schedule.time24h),
                asNumber(schedule.stayDurationMinutes)
                  ? `${asNumber(schedule.stayDurationMinutes)}분`
                  : undefined,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </dd>
          </div>
          <div>
            <dt>인원 / 활동</dt>
            <dd>
              {[
                asNumber(input?.numberOfPeople)
                  ? `${asNumber(input?.numberOfPeople)}명`
                  : undefined,
                asString(input?.activityType),
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </dd>
          </div>
        </dl>
      </header>
      <section className="summary-grid" aria-label="실행 통계">
        <SummaryCard label="Attempts" value={stats.attempts} />
        <SummaryCard label="Candidates" value={stats.candidates} />
        <SummaryCard label="Selected" value={stats.recommendations} tone="positive" />
        <SummaryCard
          label="Signals"
          value={stats.failures}
          tone={stats.failures > 0 ? "warning" : undefined}
        />
        <SummaryCard label="Events" value={stats.events} />
      </section>
    </>
  );
};

export const IssueBanner = ({ issues }: { issues: ArtifactIssue[] }) => {
  if (issues.length === 0) return null;
  return (
    <details className="issue-banner">
      <summary>Artifact 문제 {issues.length}건</summary>
      <ul>
        {issues.map((issue, index) => (
          <li key={`${issue.code}:${issue.line ?? index}`}>
            <strong>{issue.artifact}</strong> · {issue.code}
            {issue.line ? ` · line ${issue.line}` : ""}: {issue.message}
          </li>
        ))}
      </ul>
    </details>
  );
};

const phaseFamily = (phase: string): string => phase.split(".")[0] ?? phase;

const EventRow = ({ event }: { event: LogEvent }) => {
  const candidateIds = getCandidateIdsForEvent(event);
  return (
    <details className={`event-row event-${event.level}`}>
      <summary>
        <time>
          {event.ts
            ? new Date(event.ts).toLocaleTimeString("ko-KR", { hour12: false })
            : "--:--:--"}
        </time>
        <span className={`level-dot level-${event.level}`} />
        <strong>{event.phase}</strong>
        {candidateIds.length > 0 ? <code>{candidateIds.join(", ")}</code> : null}
        {event.durationMs !== undefined ? <em>{formatDuration(event.durationMs)}</em> : null}
      </summary>
      <JsonValue value={event} />
    </details>
  );
};

export const EngineView = ({
  events,
  candidates,
}: {
  events: LogEvent[];
  candidates: CandidateView[];
}) => {
  const [level, setLevel] = useState("all");
  const [phase, setPhase] = useState("all");
  const [candidateId, setCandidateId] = useState("");
  const [query, setQuery] = useState("");
  const phaseFamilies = useMemo(
    () => [...new Set(events.map((event) => phaseFamily(event.phase)))].sort(),
    [events],
  );
  const filtered = useMemo(
    () => events.filter((event) => eventMatches(event, { level, phase, candidateId, query })),
    [candidateId, events, level, phase, query],
  );
  const groups = useMemo(() => {
    const grouped = new Map<string, LogEvent[]>();
    filtered.forEach((event) => {
      const attempt = event.attemptNo === undefined ? "setup" : `attempt-${event.attemptNo}`;
      const attemptGroup = grouped.get(attempt) ?? [];
      attemptGroup.push(event);
      grouped.set(attempt, attemptGroup);
    });
    return grouped;
  }, [filtered]);

  return (
    <section className="panel-view">
      <div className="toolbar sticky-toolbar">
        <select
          aria-label="이벤트 레벨"
          value={level}
          onChange={(event) => setLevel(event.target.value)}
        >
          <option value="all">All levels</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <select
          aria-label="이벤트 phase"
          value={phase}
          onChange={(event) => setPhase(event.target.value)}
        >
          <option value="all">All phases</option>
          {phaseFamilies.map((family) => (
            <option key={family} value={family}>
              {family}
            </option>
          ))}
        </select>
        <select
          aria-label="후보 필터"
          value={candidateId}
          onChange={(event) => setCandidateId(event.target.value)}
        >
          <option value="">All candidates</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name ? `${candidate.name} · ` : ""}
              {candidate.id}
            </option>
          ))}
        </select>
        <input
          aria-label="이벤트 본문 검색"
          placeholder="payload 검색"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="result-count">
          {filtered.length} / {events.length}
        </span>
      </div>
      <div className="timeline">
        {[...groups.entries()].map(([attempt, attemptEvents]) => (
          <section className="attempt-group" key={attempt}>
            <h2>{attempt === "setup" ? "Engine setup / terminal" : attempt.replace("-", " ")}</h2>
            <div className="batch-group">
              {attemptEvents.map((event, index) => {
                const batchNo = isRecord(event.data) ? asNumber(event.data.batchNo) : undefined;
                return (
                  <div key={`${event.ts ?? "event"}:${event.phase}:${index}`}>
                    {batchNo !== undefined && event.phase.endsWith("batch.start") ? (
                      <h3 className="batch-marker">batch {batchNo}</h3>
                    ) : null}
                    <EventRow event={event} />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {filtered.length === 0 ? (
          <p className="empty-copy">필터에 맞는 이벤트가 없습니다.</p>
        ) : null}
      </div>
    </section>
  );
};

const recordLinks = (record: JsonRecord | undefined): Array<{ label: string; url: string }> => {
  if (!record) return [];
  const referenceUrls = isRecord(record.referenceUrls) ? record.referenceUrls : {};
  return Object.entries(referenceUrls).flatMap(([label, value]) =>
    typeof value === "string" && /^https?:\/\//.test(value) ? [{ label, url: value }] : [],
  );
};

const CandidateDetail = ({
  candidate,
  events,
}: {
  candidate: CandidateView;
  events: LogEvent[];
}) => {
  const recommendation = candidate.recommendation;
  const relatedEvents = events.filter((event) =>
    getCandidateIdsForEvent(event).includes(candidate.id),
  );
  const reasons = recommendation ? asRecordArray(recommendation.reasons) : [];
  const stringReasons =
    recommendation && Array.isArray(recommendation.reasons)
      ? recommendation.reasons.filter((value): value is string => typeof value === "string")
      : [];
  return (
    <article className="candidate-detail">
      <header>
        <div>
          <StatusBadge status={candidate.status} />
          <h2>{candidate.name ?? "이름 없는 후보"}</h2>
          <code>{candidate.id}</code>
        </div>
        {recommendation && asNumber(recommendation.score) !== undefined ? (
          <div className="score-orb">
            <strong>{asNumber(recommendation.score)?.toFixed(1)}</strong>
            <span>score</span>
          </div>
        ) : null}
      </header>
      <dl className="candidate-facts">
        <div>
          <dt>분류</dt>
          <dd>{candidate.category ?? "—"}</dd>
        </div>
        <div>
          <dt>주소</dt>
          <dd>{candidate.address ?? "—"}</dd>
        </div>
        <div>
          <dt>가격</dt>
          <dd>
            {recommendation?.priceRangePerPerson
              ? JSON.stringify(recommendation.priceRangePerPerson)
              : "—"}
          </dd>
        </div>
        <div>
          <dt>요청 시각</dt>
          <dd>
            {isRecord(recommendation?.availabilityAtRequestedTime)
              ? (asString(recommendation.availabilityAtRequestedTime.status) ?? "—")
              : "—"}
          </dd>
        </div>
      </dl>
      {recommendation && asString(recommendation.contentSummary) ? (
        <p className="content-summary">{asString(recommendation.contentSummary)}</p>
      ) : null}
      {stringReasons.length > 0 ? (
        <section className="detail-section">
          <h3>선정 이유</h3>
          <ul>
            {stringReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
      ) : reasons.length > 0 ? (
        <JsonValue compact value={reasons} />
      ) : null}
      {recordLinks(recommendation).length > 0 ? (
        <section className="detail-section">
          <h3>지도·근거 링크</h3>
          <div className="link-grid">
            {recordLinks(recommendation).map((link) => (
              <a href={link.url} key={link.url} rel="noreferrer" target="_blank">
                {link.label} ↗
              </a>
            ))}
          </div>
        </section>
      ) : null}
      <div className="two-column-details">
        <details open={candidate.status === "REJECTED"}>
          <summary>탈락 근거 {candidate.rejected.length}</summary>
          <JsonValue compact value={candidate.rejected} />
        </details>
        <details>
          <summary>검증 근거 {candidate.verifications.length}</summary>
          <JsonValue compact value={candidate.verifications} />
        </details>
        <details>
          <summary>장소 원문</summary>
          <JsonValue compact value={recommendation ?? candidate.generated} />
        </details>
        <details>
          <summary>연결 이벤트 {relatedEvents.length}</summary>
          <div className="related-events">
            {relatedEvents.map((event, index) => (
              <EventRow event={event} key={`${event.ts}:${index}`} />
            ))}
          </div>
        </details>
      </div>
    </article>
  );
};

export const PlacesView = ({ snapshot, events }: { snapshot: RunSnapshot; events: LogEvent[] }) => {
  const candidates = useMemo(() => buildCandidates(snapshot, events), [events, snapshot]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  useEffect(() => {
    if (!selectedId || !candidates.some((candidate) => candidate.id === selectedId)) {
      setSelectedId(candidates[0]?.id);
    }
  }, [candidates, selectedId]);
  const filtered = candidates.filter((candidate) => {
    if (status !== "all" && candidate.status !== status) return false;
    const normalized = query.toLocaleLowerCase();
    return (
      !normalized ||
      [candidate.name, candidate.id, candidate.category, candidate.address]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalized))
    );
  });
  const selected = candidates.find((candidate) => candidate.id === selectedId);
  return (
    <section className="places-layout">
      <aside className="candidate-list-panel">
        <div className="toolbar candidate-toolbar">
          <input
            aria-label="장소 검색"
            placeholder="장소·ID·주소 검색"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label="장소 상태"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All</option>
            <option value="SELECTED">Selected</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANDIDATE">Candidate</option>
          </select>
        </div>
        <div className="candidate-list">
          {filtered.map((candidate) => (
            <button
              className={selectedId === candidate.id ? "is-selected" : ""}
              key={candidate.id}
              type="button"
              onClick={() => setSelectedId(candidate.id)}
            >
              <StatusBadge status={candidate.status} />
              <strong>{candidate.name ?? candidate.id}</strong>
              <span>{candidate.category ?? candidate.address ?? candidate.id}</span>
            </button>
          ))}
        </div>
      </aside>
      {selected ? (
        <CandidateDetail candidate={selected} events={events} />
      ) : (
        <p className="empty-copy">표시할 후보가 없습니다.</p>
      )}
    </section>
  );
};

export const RawView = ({
  snapshot,
  events,
  rawEventLines,
}: {
  snapshot: RunSnapshot;
  events: LogEvent[];
  rawEventLines: string[];
}) => {
  const [artifact, setArtifact] = useState<"log" | "result" | "events">("log");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const source =
    artifact === "log"
      ? JSON.stringify(snapshot.log, null, 2)
      : artifact === "result"
        ? JSON.stringify(snapshot.result, null, 2)
        : rawEventLines.length > 0
          ? rawEventLines.join("\n")
          : events.map((event) => JSON.stringify(event)).join("\n");
  const visible = query
    ? source
        .split("\n")
        .filter((line) => line.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .join("\n")
    : source;
  return (
    <section className="raw-view">
      <div className="toolbar sticky-toolbar">
        <div className="segmented small">
          {(["log", "result", "events"] as const).map((kind) => (
            <button
              className={artifact === kind ? "active" : ""}
              key={kind}
              type="button"
              onClick={() => setArtifact(kind)}
            >
              {kind} {snapshot.artifactNames[kind] ? "●" : "○"}
            </button>
          ))}
        </div>
        <input
          aria-label="원문 검색"
          placeholder="원문 줄 필터"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="copy-button"
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(visible).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1_200);
            });
          }}
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <div className="raw-file-label">
        {snapshot.artifactNames[artifact] ?? `${artifact} artifact 없음`}
      </div>
      <pre className="raw-code">{visible || "표시할 내용이 없습니다."}</pre>
    </section>
  );
};

export const EmptyState = () => (
  <main className="empty-state">
    <div className="empty-illustration">
      <span>JSONL</span>
    </div>
    <h1>엔진 실행을 선택하세요</h1>
    <p>왼쪽에서 로컬 실행을 고르거나 log/result/events 파일을 한 번에 놓아주세요.</p>
  </main>
);

export const LoadingState = () => (
  <main className="empty-state">
    <div className="spinner" />
    <p>artifact를 읽는 중입니다…</p>
  </main>
);

export const ErrorState = ({ message }: { message: string }) => (
  <main className="empty-state error-state">
    <h1>로그를 열지 못했습니다</h1>
    <p>{message}</p>
  </main>
);

export const TabNavigation = ({
  tab,
  onChange,
}: {
  tab: ViewTab;
  onChange: (tab: ViewTab) => void;
}) => (
  <nav className="tab-navigation" aria-label="로그 보기">
    {(["engine", "places", "raw"] as const).map((item) => (
      <button
        className={tab === item ? "active" : ""}
        key={item}
        type="button"
        onClick={() => onChange(item)}
      >
        {item === "engine" ? "Engine" : item === "places" ? "Places" : "Raw"}
      </button>
    ))}
  </nav>
);
