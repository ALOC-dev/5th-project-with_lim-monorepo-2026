const BLOCKED_SOURCE_HOST_PATTERNS = [
  /(?:^|\.)google\./iu,
  /(?:^|\.)googleusercontent\./iu,
  /(?:^|\.)kakaocdn\.net$/iu,
];

const BLOCKED_SOURCE_PATH_PATTERN =
  /\.(?:pdf|xls|xlsx|csv|zip|hwp|doc|docx|ppt|pptx)(?:$|[?#])/iu;
const BLOCKED_SOURCE_DOWNLOAD_PATTERN =
  /(?:download|filedownload|file_down|filedown|bbs_download|boardfiledown|attach|attachment)/iu;

export const isUsableEvidenceUrl = (url: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  if (
    BLOCKED_SOURCE_HOST_PATTERNS.some((pattern) =>
      pattern.test(parsed.hostname),
    )
  ) {
    return false;
  }
  const pathAndQuery = `${parsed.pathname}${parsed.search}`;
  if (
    parsed.searchParams.has("download") ||
    BLOCKED_SOURCE_DOWNLOAD_PATTERN.test(pathAndQuery)
  ) {
    return false;
  }
  return !BLOCKED_SOURCE_PATH_PATTERN.test(pathAndQuery);
};
