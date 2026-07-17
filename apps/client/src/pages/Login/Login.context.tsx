import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";

export type LoginFormInputContextType = {
  readonly email: string;
  readonly password: string;
  readonly isLoginReady: boolean;

  readonly setEmail: Dispatch<SetStateAction<string>>;
  readonly setPassword: Dispatch<SetStateAction<string>>;
  readonly resetForm: () => void;
};

export const LoginFormInputContext = createContext<LoginFormInputContextType | null>(null);

export const useLoginFormInput = () => {
  const context = useContext(LoginFormInputContext);

  if (!context) {
    throw new Error("useLoginFormInput must be used within LoginFlowProvider");
  }

  return context;
};
