import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";

import PageRoot from "../components/PageRoot/PageRoot";
import { tokens } from "../design-system/tokens.generated";

type PwaStatusScreenProps = {
  readonly action?: {
    readonly label: string;
    readonly onClick: () => void;
  };
  readonly description: string;
  readonly title: string;
  readonly tone: "boot" | "offline";
};

const PwaStatusScreen = ({ action, description, title, tone }: PwaStatusScreenProps) => {
  return (
    <PageRoot backgroundColor={tokens.color.primary[50]} layout="contained">
      <S.Content>
        <S.Icon alt="" src="/pwa-192x192.png" />
        <S.Brand>ALOC</S.Brand>
        <S.Copy>
          <S.Title>{title}</S.Title>
          <S.Description>{description}</S.Description>
        </S.Copy>
        {tone === "boot" ? <S.LoadingIndicator aria-label="앱을 준비하는 중" role="status" /> : null}
        {action ? (
          <S.RetryButton onClick={action.onClick} type="button">
            {action.label}
          </S.RetryButton>
        ) : null}
      </S.Content>
    </PageRoot>
  );
};

export const PwaBootScreen = () => {
  return (
    <PwaStatusScreen
      description="맞춤 장소와 코스를 준비하고 있어요."
      title="ALOC를 시작하는 중이에요"
      tone="boot"
    />
  );
};

export const PwaOfflineScreen = ({ onRetry }: { readonly onRetry: () => void }) => {
  return (
    <PwaStatusScreen
      action={{ label: "다시 시도", onClick: onRetry }}
      description="인터넷에 연결한 뒤 다시 시도해 주세요."
      title="인터넷 연결이 필요해요"
      tone="offline"
    />
  );
};

const loading = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

const S = {
  Content: styled.section`
    display: flex;
    width: 100%;
    min-height: 100%;
    padding: 32px 24px;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    text-align: center;
  `,
  Icon: styled.img`
    width: 72px;
    height: 72px;
    border-radius: 18px;
    box-shadow: 0 10px 24px rgba(168, 94, 69, 0.2);
  `,
  Brand: styled.p`
    color: ${tokens.color.primary[700]};
    ${tokens.typography.title.xs}
  `,
  Copy: styled.div`
    display: flex;
    max-width: 280px;
    flex-direction: column;
    gap: 6px;
  `,
  Title: styled.h1`
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs}
  `,
  Description: styled.p`
    color: ${tokens.color.secondary[700]};
    ${tokens.typography.body.xs}
    word-break: keep-all;
  `,
  LoadingIndicator: styled.span`
    width: 24px;
    height: 24px;
    margin-top: 4px;
    border: 3px solid ${tokens.color.primary[100]};
    border-top-color: ${tokens.color.primary[500]};
    border-radius: 50%;
    animation: ${loading} 0.8s linear infinite;
  `,
  RetryButton: styled.button`
    min-height: 44px;
    margin-top: 8px;
    padding: 10px 16px;
    border-radius: 12px;
    background-color: ${tokens.color.primary[500]};
    color: ${tokens.color.neutral[0]};
    ${tokens.typography.utility.cta}

    &:active {
      transform: scale(0.98);
    }
  `,
};
