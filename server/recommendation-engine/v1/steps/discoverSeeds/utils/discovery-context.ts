import type { EngineConfig } from "../../../configs/types.js";
import {
  DiscoveryContextSchema,
  type DiscoveryContext,
  type EvaluateSeedsRetryReason,
  type SearchApproach,
} from "../types.js";

export type DiscoveryContextParams = {
  attemptNo?: number;
  targetSeedCount?: number;
  excludedSeedKeys?: string[];
  visitedSearchKeys?: string[];
  previousFailureReason?: EvaluateSeedsRetryReason;
  presetApproaches?: SearchApproach[];
};

// Orchestrator(engine.ts)가 넘긴 context params를 discoverSeeds 내부에서 쓰는 표준 형태로 확정한다.
// - 첫 attempt에서는 일부 필드가 비어 있을 수 있으므로 기본값으로 보강한다.
// - targetSeedCount는 config의 targetCount × candidatePoolMultiplier로 계산된 값이 기본이다.
// - 최종적으로 zod로 한 번 검증해 이후 함수에서는 안전하게 non-optional로 사용한다.
export const buildDiscoveryContext = (
  config: EngineConfig,
  context: DiscoveryContextParams = {},
): DiscoveryContext =>
  DiscoveryContextSchema.parse({
    attemptNo: context.attemptNo ?? 1,
    targetSeedCount:
      context.targetSeedCount ??
      config.targetCount * config.candidatePoolMultiplier,
    excludedSeedKeys: context.excludedSeedKeys ?? [],
    visitedSearchKeys: context.visitedSearchKeys ?? [],
    previousFailureReason: context.previousFailureReason,
    presetApproaches: context.presetApproaches,
  });
