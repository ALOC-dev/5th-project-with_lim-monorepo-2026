import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ScrapedUrlFrameText = {
  url: string;
  text: string;
};

export type ScrapedUrlSnapshot = {
  schemaVersion: 1;
  url: string;
  capturedAt: string;
  frameTexts: ScrapedUrlFrameText[];
};

export type UrlScrapeCacheEntry = {
  key: string;
  snapshot: ScrapedUrlSnapshot;
  path?: string;
};

export type UrlScrapeCache = {
  get(url: string): Promise<UrlScrapeCacheEntry | undefined>;
  set(snapshot: ScrapedUrlSnapshot): Promise<UrlScrapeCacheEntry>;
};

export type LocalFileUrlScrapeCacheOptions = {
  cacheDir?: string;
  namespace?: string;
  /** 이 시간이 지난 스냅샷은 없는 것으로 취급하고 다시 긁는다. */
  maxAgeMs?: number;
};

const DEFAULT_NAMESPACE = "naver-map-url-scrape-v1";

/**
 * 기본 7일.
 *
 * 예전에는 만료 개념이 아예 없어서 `capturedAt`을 저장만 하고 검사하지 않았고,
 * `set`도 기존 항목이 있으면 그대로 두어 갱신이 불가능했다. 그 결과 한 번 캐시된
 * 영업시간이 영원히 쓰였다. 영업시간은 바뀌는 값이라 반드시 늙어야 한다.
 */
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export const createLocalFileUrlScrapeCache = ({
  cacheDir = getDefaultCacheDir(),
  namespace = DEFAULT_NAMESPACE,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
}: LocalFileUrlScrapeCacheOptions = {}): UrlScrapeCache => {
  const namespaceDir = path.join(cacheDir, namespace);

  const isFresh = (snapshot: ScrapedUrlSnapshot): boolean => {
    const capturedAt = Date.parse(snapshot.capturedAt);
    if (Number.isNaN(capturedAt)) return false;
    return Date.now() - capturedAt < maxAgeMs;
  };

  const get = async (url: string): Promise<UrlScrapeCacheEntry | undefined> => {
    const canonicalUrl = canonicalizeUrl(url);
    const key = getCacheKey(namespace, canonicalUrl);
    const filePath = getCacheFilePath(namespaceDir, key);

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const snapshot = parseSnapshot(JSON.parse(raw));
      if (!snapshot || canonicalizeUrl(snapshot.url) !== canonicalUrl) {
        return undefined;
      }
      if (!isFresh(snapshot)) return undefined;
      return { key, snapshot, path: filePath };
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return undefined;
      throw error;
    }
  };

  const set = async (snapshot: ScrapedUrlSnapshot): Promise<UrlScrapeCacheEntry> => {
    const canonicalUrl = canonicalizeUrl(snapshot.url);
    const key = getCacheKey(namespace, canonicalUrl);
    const filePath = getCacheFilePath(namespaceDir, key);
    await fs.mkdir(namespaceDir, { recursive: true });

    const existing = await get(canonicalUrl);
    if (existing) return existing;

    const normalizedSnapshot: ScrapedUrlSnapshot = {
      ...snapshot,
      url: canonicalUrl,
    };
    const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(normalizedSnapshot, null, 2)}\n`, "utf8");

    try {
      // 만료된 항목을 새 스냅샷으로 갈아끼운다. `link`는 기존 파일이 있으면
      // EEXIST로 실패해서 영영 갱신되지 않았다.
      await fs.rename(tmpPath, filePath);
    } catch {
      await fs.unlink(tmpPath).catch(() => undefined);
    }

    return (
      (await get(canonicalUrl)) ?? {
        key,
        snapshot: normalizedSnapshot,
        path: filePath,
      }
    );
  };

  return { get, set };
};

const getDefaultCacheDir = (): string =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", ".cache", "scrapes");

const canonicalizeUrl = (url: string): string => new URL(url).toString();

const getCacheKey = (namespace: string, canonicalUrl: string): string =>
  createHash("sha256").update(`${namespace}\n${canonicalUrl}`).digest("hex");

const getCacheFilePath = (cacheDir: string, key: string): string =>
  path.join(cacheDir, `${key}.json`);

const parseSnapshot = (value: unknown): ScrapedUrlSnapshot | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const snapshot = value as Partial<ScrapedUrlSnapshot>;
  if (snapshot.schemaVersion !== 1) return undefined;
  if (typeof snapshot.url !== "string") return undefined;
  if (typeof snapshot.capturedAt !== "string") return undefined;
  if (!Array.isArray(snapshot.frameTexts)) return undefined;
  if (
    !snapshot.frameTexts.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.url === "string" &&
        typeof item.text === "string",
    )
  ) {
    return undefined;
  }
  return snapshot as ScrapedUrlSnapshot;
};

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error;
