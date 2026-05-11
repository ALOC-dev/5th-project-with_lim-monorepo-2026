// lib/KakaoCrawler.ts
import { chromium } from 'playwright';
import axios from 'axios';

const KAKAO_API_KEY = '1a5ce61b059e6ffd72a7a17117a78e49';

// 카카오 API로 장소 목록 가져오기
async function searchPlaces(keyword: string) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json`;
  const response = await axios.get(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
    params: { query: keyword, size: 5 },
  });
  return response.data.documents;
}

// Playwright로 평점/리뷰 크롤링
async function scrapeKakaoData(page: any, url: string) {
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    const result = await page.evaluate(() => {
      const ratingEl = document.querySelector('.num_star') as HTMLElement;
      const ratingText = ratingEl ? ratingEl.innerText.trim() : '0.0';

      let reviewText = '0';
      const unitInfos = document.querySelectorAll('.unit_info');
      unitInfos.forEach((el: any) => {
        if (el.innerText.includes('리뷰') || el.innerText.includes('후기')) {
          reviewText = el.innerText;
        }
      });
      if (reviewText === '0' && unitInfos.length > 0) {
        reviewText = (unitInfos[0] as HTMLElement).innerText;
      }

      return {
        rating: ratingText,
        reviews: reviewText.replace(/[^0-9]/g, ''),
      };
    });

    return result;
  } catch {
    return { rating: '에러', reviews: '에러' };
  }
}

// 메인 함수
export async function getRestaurantData(keyword: string) {
  const results: any[] = [];

  console.log(`🔍 [${keyword}] 검색 시작...\n`);

  try {
    const places = await searchPlaces(keyword);

    if (!places || places.length === 0) {
      console.log('❌ 검색 결과가 없습니다.');
      return [];
    }

    console.log(`✅ ${places.length}개 장소 발견. 상위 5개만 크롤링합니다.\n`);

    const browser = await chromium.launch({ headless: false }); // 디버깅 시 false
    const page = await browser.newPage();

    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      console.log(`▶ [${i + 1}/${places.length}] ${place.place_name} 탐색 중...`);

      const scraped = await scrapeKakaoData(page, place.place_url);

      results.push({
        name: place.place_name,
        address: place.road_address_name || place.address_name,
        rating: scraped.rating,
        reviews: scraped.reviews,
        url: place.place_url,
      });

      console.log(`  📍 ${place.road_address_name}`);
      console.log(`  ⭐ 평점: ${scraped.rating}`);
      console.log(`  💬 리뷰: ${scraped.reviews}건\n`);

      await page.waitForTimeout(2000); // 차단 방지 딜레이
    }

    await browser.close();
  } catch (error: any) {
    console.error('오류 발생:', error.message);
  }

  return results;
}
