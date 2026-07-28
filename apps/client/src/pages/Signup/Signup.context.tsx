import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";

export type SignupFormInputContextType = {
  readonly nickname: string;
  readonly email: string;
  readonly authCode: string;
  readonly password: string;
  readonly passwordConfirm: string;

  readonly isNicknameChecked: boolean;
  readonly isEmailCodeSent: boolean;
  readonly isEmailVerified: boolean;
  readonly isAgreed: boolean;
  readonly isSignupReady: boolean;

  readonly isAuthCodeReady: boolean;

  readonly setNickname: Dispatch<SetStateAction<string>>;
  readonly setEmail: Dispatch<SetStateAction<string>>;
  readonly setAuthCode: Dispatch<SetStateAction<string>>;
  readonly setPassword: Dispatch<SetStateAction<string>>;
  readonly setPasswordConfirm: Dispatch<SetStateAction<string>>;
  readonly setIsAgreed: Dispatch<SetStateAction<boolean>>;

  readonly handleCheckNickname: () => Promise<void>;
  readonly handleSendAuthCode: () => Promise<void>;
  readonly handleVerifyAuthCode: () => Promise<void>;
  readonly handleResetEmail: () => void;
  readonly handleResetNickname: () => void;
  readonly resetForm: () => void;
};

export const SignupFormInputContext = createContext<SignupFormInputContextType | null>(null);

export const useSignupFormInput = () => {
  const context = useContext(SignupFormInputContext);

  if (!context) {
    throw new Error("useSignupFormInput must be used within SignupFlowProvider");
  }

  return context;
};
