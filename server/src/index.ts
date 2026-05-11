// index.ts
import { getRestaurantData } from './lib/KakaoCrawler.js';

async function run() {
  const results = await getRestaurantData('회기역 맛집');

  if (results.length === 0) {
    console.log('❌ 결과 없음');
  } else {
    results.forEach((r, i) => {
      console.log(`[${i + 1}] ${r.name}`);
      console.log(`   ⭐ ${r.rating} | 💬 ${r.reviews}건`);
      console.log(`---`);
    });
  }
}

run();