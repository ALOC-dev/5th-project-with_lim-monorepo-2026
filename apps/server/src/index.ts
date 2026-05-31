import { createApiResponse, formatServiceName } from "@monorepo/api-contracts";
import cors from "cors";
import express from "express";
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { RecommendationSseEvent } from '@monorepo/api-contracts';
import { DEFAULT_ENGINE_CONFIG, RecommendationEngine } from '@monorepo/recommendation-engine';
import type { UserInput } from '@monorepo/recommendation-engine/v1/contracts';
import { UserInputSchema } from '@monorepo/recommendation-engine/v1/contracts';

const app = express();
app.use(cors());
app.use(express.json());

type JobState = {
  userInput: UserInput;
  emitter: EventEmitter | null; // null = 엔진 아직 미시작
  bufferedEvents: RecommendationSseEvent[];
};
const jobStore = new Map<string, JobState>();

const port = 3000;

app.get("/health", (_req, res) => {
  res.json(
    createApiResponse({
      service: formatServiceName("server"),
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
  );
});

app.post('/api/recommend', (req, res) => {
  const parsed = UserInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid input' });
    return;
  }

  const jobId = randomUUID();
  jobStore.set(jobId, { userInput: parsed.data, emitter: null, bufferedEvents: [] });
  res.json({ jobId });
});

app.get('/api/recommend/stream/:jobId', (req, res) => {
  const { jobId } = req.params;
  const jobState = jobStore.get(jobId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!jobState) {
    res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', message: 'job not found' })}\n\n`);
    res.end();
    return;
  }

  // 이미 수신된 이벤트 재전송 (StrictMode 재연결 대응)
  for (const event of [...jobState.bufferedEvents]) {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'result' || event.type === 'error') {
      res.end();
      return;
    }
  }

  // emitter 생성 (없으면)
  if (!jobState.emitter) {
    jobState.emitter = new EventEmitter();
  }

  // 핸들러를 먼저 등록해야 동기 이벤트(input_validated)를 놓치지 않는다
  const sseHandler = (event: RecommendationSseEvent) => {
    if (res.writableEnded) return;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'result' || event.type === 'error') {
      res.end();
    }
  };
  jobState.emitter.on('sse', sseHandler);

  // heartbeat: 10초마다 "나 살아있어" 신호 전송
  const heartbeatInterval = setInterval(() => {
    if (res.writableEnded) { clearInterval(heartbeatInterval); return; }
    res.write(`event: heartbeat\ndata: {}\n\n`);
  }, 10_000);

  // 엔진은 emitter가 방금 생성된 경우(= 첫 연결)에만 시작
  const isFirstConnection = jobState.bufferedEvents.length === 0;
  if (isFirstConnection) {
    const emitter = jobState.emitter;
    const emitEvent = (event: RecommendationSseEvent) => {
      jobState.bufferedEvents.push(event);
      emitter.emit('sse', event);
    };

    const engine = new RecommendationEngine(jobState.userInput, DEFAULT_ENGINE_CONFIG, {
      loggingActivated: true,
      onProgress: (step) => emitEvent({ type: 'progress', step }),
      secrets: {
        openAiApiKey: process.env.OPENAI_API_KEY,
        kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,
        tmapAppKey: process.env.TMAP_APP_KEY,
        naverSearchClientId: process.env.NAVER_SEARCH_CLIENT_ID ?? process.env.NAVER_CLIENT_ID,
        naverSearchClientSecret: process.env.NAVER_SEARCH_CLIENT_SECRET ?? process.env.NAVER_CLIENT_SECRET,
      },
    });

    engine.process().then((result) => {
      if (result.status === 'SUCCESS') {
        emitEvent({ type: 'result', data: result.userOutput });
      } else {
        emitEvent({ type: 'error', message: result.error.message });
      }
      setTimeout(() => jobStore.delete(jobId), 5000);
    });
  }

  req.on('close', () => {
    clearInterval(heartbeatInterval);
    jobState.emitter?.removeListener('sse', sseHandler);
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
