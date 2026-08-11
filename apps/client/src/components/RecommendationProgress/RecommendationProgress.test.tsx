import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import RecommendationProgress from "./RecommendationProgress";

describe("RecommendationProgress", () => {
  it("renders the shared generation shell with progress steps", () => {
    render(
      <RecommendationProgress
        description="장소 후보를 확인하고 있어요."
        headerTitle="장소 추천 중"
        steps={[
          { id: "input", label: "입력 확인", status: "done" },
          { id: "generate", label: "추천 생성", meta: "2초", status: "active" },
        ]}
        title="추천 결과를 만들고 있어요"
      />,
    );

    expect(screen.getByRole("banner")).toHaveTextContent("장소 추천 중");
    expect(screen.getByRole("status")).toHaveTextContent("추천 결과를 만들고 있어요");
    const stepList = screen.getByRole("list", { name: "추천 생성 단계" });
    expect(stepList).toHaveTextContent("입력 확인");
    expect(stepList).toHaveTextContent("추천 생성");
    expect(stepList).toHaveTextContent("2초");
  });

  it("renders the shared recovery action for an error", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <RecommendationProgress
        error={{
          title: "추천 결과를 만들지 못했어요",
          description: "연결을 확인해 주세요.",
          action: { label: "추천 폼으로", onClick: onRetry },
        }}
        headerTitle="코스 추천 중"
        title="코스 추천을 만드는 중이에요"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("추천 결과를 만들지 못했어요");

    await user.click(screen.getByRole("button", { name: "추천 폼으로" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
