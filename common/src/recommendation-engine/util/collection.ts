export const countBy = <T>(
  items: T[],
  getKey: (item: T) => string,
): Map<string, number> => {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
};
