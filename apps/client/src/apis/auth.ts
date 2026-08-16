import {
  type ApiResponse,
  type AuthenticatedUserResponseData,
  createApiError,
  createApiResponseSchema,
  type LoginRequest,
  type LogoutResponseData,
  LogoutResponseDataSchema,
  type NicknameCheckResponseData,
  type ResetPasswordRequest,
  type ResetPasswordResponseData,
  type SendSignupCodeRequest,
  type SendSignupCodeResponseData,
  type SignupRequest,
  type VerifySignupCodeRequest,
  type VerifySignupCodeResponseData,
} from "@monorepo/api-contracts";

import { serverApi } from "./base";
import { toApiClientErrorMessage } from "./errors";

const logoutResponseSchema = createApiResponseSchema(LogoutResponseDataSchema);

// 회원가입 API
export const requestSignup = async (payload: SignupRequest) => {
  const response = await serverApi
    .post("api/auth/signup", { json: payload })
    .json<ApiResponse<AuthenticatedUserResponseData>>();
  return response;
};

// 로그인 API
export const requestLogin = async (payload: LoginRequest) => {
  const response = await serverApi
    .post("api/auth/login", { json: payload })
    .json<ApiResponse<AuthenticatedUserResponseData>>();
  return response;
};

export const requestLogout = async (): Promise<ApiResponse<LogoutResponseData>> => {
  try {
    const response = await serverApi.post("api/auth/logout").json<unknown>();
    return logoutResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

// 닉네임 중복 확인 API
export const requestNicknameCheck = async (nickname: string) => {
  const response = await serverApi
    .get("api/auth/nickname-check", { searchParams: { nickname } })
    .json<ApiResponse<NicknameCheckResponseData>>();
  return response;
};

// 인증번호 발송 API
export const requestSendSignupCode = async (payload: SendSignupCodeRequest) => {
  const response = await serverApi
    .post("api/auth/signup/send-code", { json: payload })
    .json<ApiResponse<SendSignupCodeResponseData>>();
  return response;
};

// 인증번호 검증 API
export const requestVerifySignupCode = async (payload: VerifySignupCodeRequest) => {
  const response = await serverApi
    .post("api/auth/signup/verify-code", { json: payload })
    .json<ApiResponse<VerifySignupCodeResponseData>>();
  return response;
};

// 비밀번호 재설정 폼 인증번호 발송 API
export const requestSendPasswordCode = async (payload: { email: string }) => {
  const response = await serverApi.post("api/auth/forgot-password", { json: payload }).json();
  return response;
};

// 비밀번호 재설정 폼 인증번호 검증 API
export const requestVerifyPasswordCode = async (payload: { email: string; code: string }) => {
  const response = await serverApi
    .post("api/auth/forgot-password/verify-code", { json: payload })
    .json();
  return response;
};

// 새 비밀번호 설정 API
export const requestResetPassword = async (payload: ResetPasswordRequest) => {
  const response = await serverApi
    .post("api/auth/reset-password", { json: payload })
    .json<ApiResponse<ResetPasswordResponseData>>();
  return response;
};
