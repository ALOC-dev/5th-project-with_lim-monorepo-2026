import assert from "node:assert/strict";
import test from "node:test";

import { defaultCourseTitle } from "./title.js";

test("formats the default course title from the Asia/Seoul schedule", () => {
  assert.equal(
    defaultCourseTitle({ date: "2026-08-14", startTime: "18:30" }),
    "8월 14일 18:30 코스",
  );
});

test("removes leading zeroes from month and day only", () => {
  assert.equal(
    defaultCourseTitle({ date: "2027-01-02", startTime: "09:00" }),
    "1월 2일 09:00 코스",
  );
});
