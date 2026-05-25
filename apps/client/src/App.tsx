import { useState } from "react";

import styled from "@emotion/styled";

type HealthStatus = "idle" | "loading" | "success" | "error";

const App = () => {
  const [status, setStatus] = useState<HealthStatus>("idle");
  const [message, setMessage] = useState("버튼을 눌러 /health 응답을 확인하세요.");

  const checkHealth = async () => {
    setStatus("loading");
    setMessage("요청 중...");

    const serverBaseUrl =
      (import.meta as any).env?.VITE_SERVER_BASE_URL ??
      (import.meta as any).env?.VITE_SERVER_URL ??
      "http://localhost:3000";

    try {
      const response = await fetch(`${serverBaseUrl}/health`);
      const text = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
      }

      setStatus("success");
      setMessage(text || "OK");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "요청 실패");
    }
  };

  return (
    <S.Wrapper>
      <S.Title>/health 응답 확인</S.Title>
      <S.Button onClick={checkHealth} disabled={status === "loading"}>
        {status === "loading" ? "확인 중..." : "/health 호출"}
      </S.Button>
      <S.Message $status={status}>{message}</S.Message>
    </S.Wrapper>
  );
};

const S = {
  Wrapper: styled.main`
    width: 100%;
    min-height: 100vh;
    display: grid;
    place-items: center;
    gap: 16px;
    background: #f7f7fb;
    color: #1f2937;
  `,
  Title: styled.h1`
    margin: 0;
    font-size: 24px;
  `,
  Button: styled.button`
    padding: 12px 20px;
    border: none;
    border-radius: 10px;
    background: #2563eb;
    color: #fff;
    cursor: pointer;
    font-size: 16px;

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `,
  Message: styled.p<{ $status: HealthStatus }>`
    margin: 0;
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 15px;
    background: ${({ $status }) => {
      if ($status === "success") {
        return "#ecfdf5";
      }
      if ($status === "error") {
        return "#fef2f2";
      }
      return "#f3f4f6";
    }};
    color: ${({ $status }) => {
      if ($status === "success") {
        return "#065f46";
      }
      if ($status === "error") {
        return "#991b1b";
      }
      return "#374151";
    }};
  `,
} as const;

export default App;
