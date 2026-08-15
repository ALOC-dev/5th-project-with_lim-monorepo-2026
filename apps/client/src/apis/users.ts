// src/apis/users.ts
import {
  type ChangePasswordRequest,
  ChangePasswordResponseDataSchema,
  createApiResponseSchema,
  DeleteCurrentUserResponseDataSchema,
} from "@monorepo/api-contracts";

import { serverApi } from "./base";

const withdrawResponseSchema = createApiResponseSchema(DeleteCurrentUserResponseDataSchema);
const changePasswordResponseSchema = createApiResponseSchema(ChangePasswordResponseDataSchema);

export const requestGetMe = async () => {
  const response = await serverApi.get("api/users/me").json();
  return response;
};

// 회원 탈퇴
export const requestWithdraw = async () => {
  const response = await serverApi.delete("api/users/me").json();

  return withdrawResponseSchema.parse(response);
};

// 비밀번호 재설정
export const requestChangePassword = async (data: ChangePasswordRequest) => {
  const response = await serverApi.patch("api/users/me/password", { json: data }).json();

  return changePasswordResponseSchema.parse(response);
};
