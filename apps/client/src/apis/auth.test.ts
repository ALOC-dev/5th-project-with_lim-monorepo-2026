import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiMock = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("./base", () => ({
  serverApi: serverApiMock,
}));

import { requestLogout } from "./auth";

afterEach(() => {
  serverApiMock.post.mockReset();
});

describe("auth server API", () => {
  it("clears the server session through the logout endpoint", async () => {
    // Given
    serverApiMock.post.mockReturnValue({
      json: () => Promise.resolve({ success: true, data: { success: true } }),
    });

    // When
    const result = await requestLogout();

    // Then
    expect(result).toEqual({ success: true, data: { success: true } });
    expect(serverApiMock.post).toHaveBeenCalledWith("api/auth/logout");
  });

  it("converts a malformed logout response into an API error", async () => {
    // Given
    serverApiMock.post.mockReturnValue({
      json: () => Promise.resolve({ success: true, data: { success: false } }),
    });

    // When
    const result = await requestLogout();

    // Then
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected a malformed logout response to fail at the client boundary");
    }
    expect(result.error).not.toBe("");
  });
});
