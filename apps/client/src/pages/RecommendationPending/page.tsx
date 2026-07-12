import { keyframes } from '@emotion/react';
import styled from '@emotion/styled';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { tokens } from '../../design-system/tokens.generated';
import { typography } from '../../design-system/typography.generated';

type StepStatus = 'pending' | 'active' | 'done';

const STEP_LABELS: Record<string, string> = {
  input_validated: '입력 검증 완료',
  discovering: '장소 후보 탐색 중',
  enriching: '장소 정보 수집 중',
  scoring: 'AI 점수 계산 중',
};

const STEP_KEYS = ['input_validated', 'discovering', 'enriching', 'scoring'] as const;

const RecommendationPendingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');

  const [steps, setSteps] = useState<Record<string, StepStatus>>({
    input_validated: 'pending',
    discovering: 'pending',
    enriching: 'pending',
    scoring: 'pending',
  });
  const [elapsed, setElapsed] = useState(0); // 현재 단계 경과 시간(초)

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`http://localhost:3000/api/recommend/stream/${jobId}`);

    const queue: string[] = [];
    let processing = false;
    let stepStartTime = Date.now();
    let elapsedTimer: ReturnType<typeof setInterval> | null = null;

    const startElapsedTimer = () => {
      stepStartTime = Date.now();
      setElapsed(0);
      if (elapsedTimer) clearInterval(elapsedTimer);
      elapsedTimer = setInterval(() => {
        setElapsed(Math.floor((Date.now() - stepStartTime) / 1000));
      }, 1000);
    };

    const processQueue = () => {
      if (processing || queue.length === 0) return;
      processing = true;

      const step = queue.shift()!;
      const stepIndex = STEP_KEYS.indexOf(step as (typeof STEP_KEYS)[number]);

      setSteps((prev) => {
        const next = { ...prev };
        STEP_KEYS.forEach((key, i) => {
          if (i < stepIndex) next[key] = 'done';
        });
        next[step] = 'active';
        return next;
      });
      if (stepIndex >= 0) startElapsedTimer();

      setTimeout(() => {
        processing = false;
        processQueue();
      }, 600);
    };

    es.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data) as { step: string };
      queue.push(data.step);
      processQueue();
    });

    es.addEventListener('heartbeat', () => {
      // 연결 유지 확인용 — 별도 처리 불필요
    });

    es.addEventListener('result', (e) => {
      const eventData = JSON.parse(e.data) as { data: unknown };
      if (elapsedTimer) clearInterval(elapsedTimer);
      es.close();
      navigate('/place/recommendation/result', { state: { result: eventData.data } });
    });

    es.addEventListener('error', () => {
      if (elapsedTimer) clearInterval(elapsedTimer);
      es.close();
    });

    return () => {
      if (elapsedTimer) clearInterval(elapsedTimer);
      es.close();
    };
  }, [jobId]);

  return (
    <S.Page>
      <S.Body>
        <S.Spinner />
        <S.Title>추천 결과를 만들고 있어요</S.Title>
        <S.Subtitle>
          장소 후보를 수집하고 점수를 계산하는 중입니다.{'\n'}잠시만 기다려 주세요.
        </S.Subtitle>
        <S.StepList>
          {STEP_KEYS.map((key) => (
            <S.StepItem key={key} $status={steps[key] ?? 'pending'}>
              {steps[key] === 'done' ? '✓' : steps[key] === 'active' ? '▶' : '○'}{' '}
              {STEP_LABELS[key]}
              {steps[key] === 'active' && elapsed > 0 && (
                <S.Elapsed>{elapsed}초</S.Elapsed>
              )}
            </S.StepItem>
          ))}
        </S.StepList>
      </S.Body>
    </S.Page>
  );
};

export default RecommendationPendingPage;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

const S = {
  Page: styled.main`
    min-height: 100vh;
    background: ${tokens.color.neutral[50]};
    display: flex;
    align-items: flex-start;
    padding: 80px 24px 40px;
  `,
  Body: styled.div`
    width: 100%;
    max-width: 390px;
    display: flex;
    flex-direction: column;
    gap: 0;
  `,
  Spinner: styled.div`
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 4px solid ${tokens.color.primary[500]};
    border-top-color: transparent;
    animation: ${spin} 1s linear infinite;
    margin-bottom: 24px;
  `,
  Title: styled.h1`
    margin: 0 0 12px;
    color: ${tokens.color.neutral[900]};
    ${typography.title.lg}
  `,
  Subtitle: styled.p`
    margin: 0 0 24px;
    color: ${tokens.color.secondary[500]};
    white-space: pre-line;
    ${typography.body.sm}
  `,
  StepList: styled.ul`
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  StepItem: styled.li<{ $status: StepStatus }>`
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${({ $status }) =>
      $status === 'pending' ? tokens.color.secondary[500] : tokens.color.primary[500]};
    opacity: ${({ $status }) => ($status === 'done' ? 0.5 : 1)};
    font-weight: ${({ $status }) => ($status === 'active' ? 700 : 400)};
    transition: color 0.3s ease, opacity 0.3s ease, font-weight 0.1s ease;
    ${typography.body.md}
  `,
  Elapsed: styled.span`
    margin-left: auto;
    color: ${tokens.color.secondary[500]};
    ${typography.body.xs}
  `,
};
