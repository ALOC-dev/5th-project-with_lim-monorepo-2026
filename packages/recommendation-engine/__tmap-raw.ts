import { searchKakaoLocalRaw } from "./src/v1/steps/discoverSeeds/vendors/kakao-local.js";
const key = process.env.KAKAO_REST_API_KEY;
for (const name of ["낙서파전", "1막2창 회기본점", "차칸곱창 동대문점", "황금소곱창", "곱창이야기 경희대점"]) {
  const res = await searchKakaoLocalRaw(
    { query: name, pagination: { page: 1, count: 5 },
      location: { longitude: 127.0579, latitude: 37.5897, radiusKm: 2 } },
    { restApiKey: key },
  );
  console.log(`\n${name} → ${res.documents.length}건`);
  for (const d of res.documents.slice(0, 3))
    console.log(`   "${d.place_name}" | ${d.road_address_name} | ${d.distance}m`);
}
