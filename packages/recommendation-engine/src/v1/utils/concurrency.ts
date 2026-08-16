/**
 * 정해진 개수의 워커로 나눠 처리하고, 입력 순서 그대로 결과를 돌려준다.
 *
 * 예전에는 같은 구현이 세 파일에 각각 복사돼 있었고, 그중 둘만 `concurrency`가
 * 소수이거나 유한하지 않은 경우를 막고 있었다. 그런 값이 들어오면 워커 수가
 * 이상해져 전량 직렬 처리로 떨어지거나 배열 생성에서 터진다. 하나로 합쳐
 * 가장 방어적인 쪽으로 맞춘다.
 */
export const mapWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> => {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workerCount = normalizeConcurrency(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];
        if (item === undefined) continue;
        results[index] = await mapper(item, index);
      }
    }),
  );

  return results;
};

const normalizeConcurrency = (requestedConcurrency: number, itemCount: number): number => {
  if (itemCount <= 0) return 1;
  if (!Number.isFinite(requestedConcurrency)) return 1;
  return Math.max(1, Math.min(itemCount, Math.floor(requestedConcurrency)));
};
