// src/apis/users.ts
import { serverApi } from "./base";

export const requestGetMe = async () => {
  const response = await serverApi.get("api/users/me").json();
  return response;
};
