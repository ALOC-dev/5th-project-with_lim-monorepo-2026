import axios from "axios";

export const client = axios.create({
  // 로컬 개발 서버 주소 (또는 vite 프록시 주소)
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
  // 💡 백엔드가 쿠키로 토큰을 구워주므로 이 옵션은 무조건 켜야 합니다!
  withCredentials: true,
});
