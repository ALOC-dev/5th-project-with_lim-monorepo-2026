import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ActivityHubPage } from "./ActivityHubPage";

const Location = () => <output>{useLocation().pathname}</output>;

describe("ActivityHubPage", () => {
  it.each([
    ["장소 추천", "/place/recommendation/form"],
    ["코스 추천", "/course/recommendation/form"],
    ["장소 추천 기록", "/place/recommendation/history"],
    ["찜한 장소", "/place/favorite"],
    ["코스 추천 기록", "/course/recommendation/history"],
    ["찜한 코스", "/course/favorite"],
  ])("navigates to %s", async (label, path) => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/activity"]}>
        <ActivityHubPage />
        <Routes>
          <Route path="*" element={<Location />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: label }));

    expect(screen.getByRole("status")).toHaveTextContent(path);
  });
});
