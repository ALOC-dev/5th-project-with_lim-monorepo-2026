import { promises as dns } from "node:dns";
import net from "node:net";

import ky from "ky";

import { stripSearchMarkup } from "../utils/operation-hours.js";
import type { ScrapedUrlSnapshot, UrlScrapeCache } from "../utils/scrape-cache.js";
import { DEFAULT_EXTERNAL_API_TIMEOUT_MS, DESKTOP_BROWSER_USER_AGENT } from "./shared/constants.js";
import { stripHtml } from "./shared/text.js";
import type { UrlScrapeResult } from "./types.js";

const isPrivateIPv4 = (ip: string): boolean => {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local, includes cloud instance-metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
};

const isPrivateIPv6 = (ip: string): boolean => {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local fc00::/7
  if (normalized.startsWith("::ffff:")) return isPrivateIPv4(normalized.replace("::ffff:", ""));
  return false;
};

const isPrivateIpAddress = (ip: string): boolean => {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // unrecognizable address shape: treat as unsafe rather than allow it through
};

/**
 * fetchUrl은 LLM이 스스로 고른 URL을 그대로 요청한다. 프로토콜만 검사하면 공격자가
 * 유도한 프롬프트로 169.254.169.254(클라우드 인스턴스 메타데이터)나 내부망 주소를
 * 그대로 요청시킬 수 있어(SSRF), 요청 전에 호스트가 가리키는 IP가 사설/루프백/링크로컬이
 * 아닌지 DNS 조회로 먼저 확인한다.
 */
const assertPublicHttpUrl = async (parsedUrl: URL): Promise<void> => {
  const hostname = parsedUrl.hostname;

  const directIpVersion = net.isIP(hostname);
  if (directIpVersion !== 0) {
    if (isPrivateIpAddress(hostname)) {
      throw new Error(`Fetch URL host is a private/internal address: ${hostname}`);
    }
    return;
  }

  if (hostname === "localhost") {
    throw new Error("Fetch URL host is a private/internal address: localhost");
  }

  const records = await dns.lookup(hostname, { all: true });
  const unsafeRecord = records.find((record) => isPrivateIpAddress(record.address));
  if (unsafeRecord) {
    throw new Error(
      `Fetch URL host resolves to a private/internal address: ${hostname} -> ${unsafeRecord.address}`,
    );
  }
};

export const getOrFetchStaticUrl = async (
  url: string,
  options: { fetchCache?: UrlScrapeCache; abortSignal?: AbortSignal },
): Promise<UrlScrapeResult> => {
  const parsedUrl = new URL(url);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported fetch URL protocol: ${parsedUrl.protocol}`);
  }
  await assertPublicHttpUrl(parsedUrl);

  const cached = await options.fetchCache?.get(parsedUrl.toString());
  if (cached) {
    return {
      snapshot: cached.snapshot,
      cache: {
        status: "HIT",
        key: cached.key,
        path: cached.path,
        capturedAt: cached.snapshot.capturedAt,
      },
    };
  }

  const raw = await ky
    .get(parsedUrl.toString(), {
      timeout: DEFAULT_EXTERNAL_API_TIMEOUT_MS,
      signal: options.abortSignal,
      headers: {
        "User-Agent": DESKTOP_BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    })
    .text();
  const snapshot: ScrapedUrlSnapshot = {
    schemaVersion: 1,
    url: parsedUrl.toString(),
    capturedAt: new Date().toISOString(),
    frameTexts: [
      {
        url: parsedUrl.toString(),
        text: stripHtml(stripSearchMarkup(raw)).replace(/\s+/gu, " ").trim(),
      },
    ],
  };

  if (!options.fetchCache) {
    return {
      snapshot,
      cache: { status: "DISABLED", capturedAt: snapshot.capturedAt },
    };
  }

  const entry = await options.fetchCache.set(snapshot);
  return {
    snapshot: entry.snapshot,
    cache: {
      status: "MISS",
      key: entry.key,
      path: entry.path,
      capturedAt: entry.snapshot.capturedAt,
    },
  };
};
