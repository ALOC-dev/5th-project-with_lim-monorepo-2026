import { searchTmapLocal } from "./src/v1/steps/discoverSeeds/vendors/tmap-local.js";
import { searchKakaoLocal } from "./src/v1/steps/discoverSeeds/vendors/kakao-local.js";
import { dedupeAndExclude } from "./src/v1/steps/discoverSeeds/utils/dedupe.js";

const loc = { longitude: 127.0579, latitude: 37.5897, radiusKm: 2 };
const fetchAll = async (queries: string[]) => {
  const all = [];
  for (const q of queries) {
    const [t, k] = await Promise.all([
      searchTmapLocal({ query: q, pagination: { page: 1, count: 25 }, location: loc },
        { appKey: process.env.TMAP_APP_KEY }).catch(() => ({ seeds: [] })),
      searchKakaoLocal({ query: q, pagination: { page: 1, count: 15 }, location: loc },
        { restApiKey: process.env.KAKAO_REST_API_KEY }).catch(() => ({ seeds: [] })),
    ]);
    all.push(...k.seeds, ...t.seeds);
  }
  return dedupeAndExclude(all, []).seeds;
};

const isGopchang = (n: string, c: string) => /곱창|막창|대창|양/u.test(`${n} ${c}`);

for (const [label, queries] of [
  ["현재(동의어형)", ["회기 곱창", "곱창", "소 곱창", "곱창 맛집"]],
  ["지역명 제거", ["곱창", "소곱창", "곱창 맛집", "맛집"]],
  ["하위유형 분산", ["곱창", "막창", "곱창전골", "양대창"]],
] as const) {
  const seeds = await fetchAll([...queries]);
  const hit = seeds.filter((s) => isGopchang(s.name, s.category));
  console.log(
    `${label.padEnd(14)} 고유후보 ${String(seeds.length).padStart(3)} | 곱창류 ${String(hit.length).padStart(3)} (${Math.round((hit.length / seeds.length) * 100)}%)`,
  );
}
