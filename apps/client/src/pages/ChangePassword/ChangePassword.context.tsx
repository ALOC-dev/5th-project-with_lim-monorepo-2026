import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";

export type ChangePasswordContextType = {
  readonly password: string;
  readonly passwordConfirm: string;

  readonly setPassword: Dispatch<SetStateAction<string>>;
  readonly setPasswordConfirm: Dispatch<SetStateAction<string>>;

  readonly handleChangePassword: () => Promise<void>;
  readonly resetForm: () => void;
};

export const ChangePasswordContext = createContext<ChangePasswordContextType | null>(null);

export const useChangePassword = () => {
  const context = useContext(ChangePasswordContext);

  if (!context) {
    throw new Error("useChangePassword 훅은 ChangePasswordProvider 내부에서만 사용할 수 있습니다.");
  }

  return context;
};
