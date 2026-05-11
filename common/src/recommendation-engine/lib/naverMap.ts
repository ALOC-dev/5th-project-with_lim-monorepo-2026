import { ApifyClient } from 'apify-client';
import 'dotenv/config';

const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

export interface RestaurantStats {
    name: string;
    rating: number;
    reviews: number;
    address: string;
}

export async function getNaverRestaurantStats(placeName: string): Promise<RestaurantStats | null> {
    try {
        const run = await client.actor("huggable_quote/naver-map-scraper").call({
            "searchKeywords": [placeName],
            "maxPlacesPerSearch": 1,
            "proxyConfiguration": { "useApifyProxy": true },
            "language": "ko"
        });

        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        if (!items || items.length === 0) return null;

        const item: any = items[0];

        return {
            name: item.title || item.name,
            rating: item.visitorReviewsScore || 0,
            reviews: item.visitorReviewsTotal || 0,
            address: item.address || "주소 정보 없음"
        };
    } catch (error) {
        console.error(`[${placeName}] 네이버 데이터 수집 실패:`, error);
        return null;
    }
}