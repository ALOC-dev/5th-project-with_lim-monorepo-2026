import styled from "@emotion/styled";
import { useCallback, useEffect, useState } from "react";

import { tokens } from "../../design-system/tokens.generated";
import { typography } from "../../design-system/typography.generated";

type HealthData = {
  service: string;
  status: string;
  timestamp: string;
};

type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };

type HealthState =
  | { status: "idle" | "loading"; response: null; error: null }
  | { status: "success"; response: ApiResponse<HealthData>; error: null }
  | { status: "error"; response: null; error: string };

const HEALTH_ENDPOINT = "http://localhost:3000/health";

const HealthCheckPage = () => {
  const [health, setHealth] = useState<HealthState>({
    status: "idle",
    response: null,
    error: null,
  });

  const requestHealth = useCallback(async () => {
    setHealth({ status: "loading", response: null, error: null });

    try {
      const response = await fetch(HEALTH_ENDPOINT);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as ApiResponse<HealthData>;
      setHealth({ status: "success", response: data, error: null });
    } catch (error) {
      setHealth({
        status: "error",
        response: null,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, []);

  useEffect(() => {
    void requestHealth();
  }, [requestHealth]);

  const isHealthy =
    health.status === "success" &&
    health.response.success &&
    health.response.data.status === "ok";

  return (
    <S.Wrapper>
      <S.Panel>
        <S.Header>
          <S.Title>Server Health</S.Title>
          <S.StatusBadge $healthy={isHealthy}>
            {health.status === "loading"
              ? "checking"
              : isHealthy
                ? "ok"
                : "offline"}
          </S.StatusBadge>
        </S.Header>

        <S.Description>GET {HEALTH_ENDPOINT}</S.Description>

        <S.Body>
          {health.status === "success" && health.response.success ? (
            <>
              <S.Row>
                <span>Service</span>
                <strong>{health.response.data.service}</strong>
              </S.Row>
              <S.Row>
                <span>Status</span>
                <strong>{health.response.data.status}</strong>
              </S.Row>
              <S.Row>
                <span>Timestamp</span>
                <strong>{health.response.data.timestamp}</strong>
              </S.Row>
            </>
          ) : null}

          {health.status === "success" && !health.response.success ? (
            <S.ErrorText>{health.response.error}</S.ErrorText>
          ) : null}

          {health.status === "error" ? <S.ErrorText>{health.error}</S.ErrorText> : null}

          {health.status === "loading" ? <S.MutedText>Requesting server...</S.MutedText> : null}
        </S.Body>

        <S.Button type="button" onClick={requestHealth}>
          Retry
        </S.Button>
      </S.Panel>
    </S.Wrapper>
  );
};

export default HealthCheckPage;

const S = {
  Wrapper: styled.main`
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: ${tokens.color.neutral[50]};
    color: ${tokens.color.neutral[900]};
  `,
  Panel: styled.section`
    width: min(100%, 420px);
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 24px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 8px;
    background: ${tokens.color.neutral[0]};
  `,
  Header: styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  `,
  Title: styled.h1`
    margin: 0;
    ${typography.title.xs}
  `,
  StatusBadge: styled.span<{ $healthy: boolean }>`
    min-width: 76px;
    padding: 6px 10px;
    border-radius: 999px;
    text-align: center;
    color: ${tokens.color.neutral[0]};
    background: ${({ $healthy }) =>
      $healthy ? tokens.color.tertiary[700] : tokens.color.primary[700]};
    ${typography.label.sm}
  `,
  Description: styled.p`
    margin: 0;
    color: ${tokens.color.secondary[700]};
    ${typography.body.sm}
  `,
  Body: styled.div`
    min-height: 122px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  `,
  Row: styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    color: ${tokens.color.secondary[700]};
    ${typography.body.sm}

    strong {
      max-width: 240px;
      color: ${tokens.color.neutral[900]};
      text-align: right;
      overflow-wrap: anywhere;
      font-weight: 500;
    }
  `,
  MutedText: styled.p`
    margin: 0;
    color: ${tokens.color.secondary[700]};
    ${typography.body.sm}
  `,
  ErrorText: styled.p`
    margin: 0;
    color: ${tokens.color.primary[700]};
    ${typography.body.sm}
  `,
  Button: styled.button`
    min-height: 44px;
    border: 0;
    border-radius: 8px;
    color: ${tokens.color.neutral[0]};
    background: ${tokens.color.primary[500]};
    cursor: pointer;
    ${typography.label.md}

    &:hover {
      background: ${tokens.color.primary[700]};
    }
  `,
};
