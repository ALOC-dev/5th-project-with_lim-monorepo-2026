// src/apis/auth.ts
import type { ApiResponse } from "@monorepo/api-contracts";

import { client } from "./client";

export type AuthUserResponse = {
  user: {
    id: string;
    email: string;
    nickname: string;
  };
};

// 1. 회원가입 API (이메일, 비밀번호, 닉네임 전송)
export const requestSignup = async (payload: {
  email: string;
  password: string;
  nickname: string;
}) => {
  const response = await client.post<ApiResponse<AuthUserResponse>>("/signup", payload);
  return response.data;
};

// 2. 로그인 API (이메일, 비밀번호 전송)
export const requestLogin = async (payload: { email: string; password: string }) => {
  const response = await client.post<ApiResponse<AuthUserResponse>>("/login", payload);
  return response.data;
};
