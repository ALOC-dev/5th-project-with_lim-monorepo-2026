import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";

export type ForgotPasswordContextType = {
  readonly email: string;
  readonly authCode: string;
  readonly isEmailCodeSent: boolean;

  readonly setEmail: Dispatch<SetStateAction<string>>;
  readonly setAuthCode: Dispatch<SetStateAction<string>>;
  readonly handleSendAuthCode: () => Promise<void>;
  readonly handleVerifyAuthCode: () => Promise<void>;

  readonly password: string;
  readonly passwordConfirm: string;

  readonly isAuthCodeReady: boolean;

  readonly setPassword: Dispatch<SetStateAction<string>>;
  readonly setPasswordConfirm: Dispatch<SetStateAction<string>>;

  readonly handleResetPassword: () => Promise<void>;
  readonly resetForm: () => void;
};

export const ForgotPasswordContext = createContext<ForgotPasswordContextType | null>(null);

export const useForgotPasswordInput = () => {
  const context = useContext(ForgotPasswordContext);

  if (!context) {
    throw new Error("useForgotPasswordInput must be used within ForgotPasswordFlowProvider");
  }

  return context;
};
