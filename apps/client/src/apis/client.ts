import axios from "axios";

export const client = axios.create({
  baseURL: "http://localhost:3000/api/auth",
  headers: {
    "Content-Type": "application/json",
  },
  // 서버가 쿠키(HttpOnly Token)를 브라우저에 안전하게 내려주고 가져가도록 설정합니다.
  withCredentials: true,
});
