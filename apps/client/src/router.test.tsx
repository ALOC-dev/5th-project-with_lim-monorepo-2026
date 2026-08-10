import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./contexts/Auth.context", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "./contexts/Auth.context";
import { ProtectedRoute, PublicRoute } from "./routes/AuthRouteGuards";

const mockedUseAuth = vi.mocked(useAuth);

describe("auth route loading states", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
      user: null,
    });
  });

  it.each([
    ["protected", ProtectedRoute],
    ["public", PublicRoute],
  ])("renders a PageRoot feedback state while the %s route initializes", (_name, Route) => {
    render(<Route />);

    expect(screen.getByRole("main")).toHaveAttribute("data-layout", "contained");
    expect(screen.getByRole("status")).toHaveTextContent("로그인 정보를 확인하고 있어요");
  });
});
