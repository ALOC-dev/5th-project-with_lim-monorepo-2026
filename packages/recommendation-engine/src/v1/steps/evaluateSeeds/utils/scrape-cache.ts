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
};

const DEFAULT_NAMESPACE = "naver-map-url-scrape-v1";

export const createLocalFileUrlScrapeCache = ({
  cacheDir = getDefaultCacheDir(),
  namespace = DEFAULT_NAMESPACE,
}: LocalFileUrlScrapeCacheOptions = {}): UrlScrapeCache => {
  const namespaceDir = path.join(cacheDir, namespace);

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
      await fs.link(tmpPath, filePath);
    } catch (error) {
      if (!(isNodeError(error) && error.code === "EEXIST")) throw error;
    } finally {
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
