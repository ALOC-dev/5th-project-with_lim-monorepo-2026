import assert from "node:assert/strict";
import test from "node:test";

import { extractPageTitle } from "./static-fetch.js";

void test("extractPageTitle prefers Open Graph title metadata over the document title", () => {
  assert.equal(
    extractPageTitle(
      '<html><head><title>기본 제목</title><meta property="og:title" content="공식 장소 소개" /></head></html>',
    ),
    "공식 장소 소개",
  );
});

void test("extractPageTitle falls back to the document title and decodes entities", () => {
  assert.equal(extractPageTitle("<title>카페 &amp; 다이닝</title>"), "카페 & 다이닝");
});

void test("extractPageTitle returns undefined when a page has no usable title", () => {
  assert.equal(extractPageTitle("<html><body>본문</body></html>"), undefined);
});
