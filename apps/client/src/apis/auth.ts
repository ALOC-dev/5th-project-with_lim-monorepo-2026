// src/apis/auth.ts
import type { ApiResponse } from "@monorepo/api-contracts"; // 백엔드가 만든 타입 가져오기

import { client } from "./client";

// 1. 회원가입 API (이메일, 비밀번호, 닉네임 전송)
export const requestSignup = async (payload: {
  email: string;
  password: string;
  nickname: string;
}) => {
  const response = await client.post<ApiResponse<any>>("/signup", payload);
  return response.data;
};

// 2. 로그인 API (이메일, 비밀번호 전송)
export const requestLogin = async (payload: { email: string; password: string }) => {
  const response = await client.post<ApiResponse<any>>("/login", payload);
  return response.data;
};
