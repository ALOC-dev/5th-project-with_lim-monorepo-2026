import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import { LoginFormInputContext } from "./Login.context";
import { type LoginFormInputContextType } from "./Login.context";
import LoginFormContent from "./LoginForm";

export const LoginFlowProvider = ({ children }: { readonly children: ReactNode }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const isLoginReady = useMemo(() => {
    return email.length > 0 && password.length > 0;
  }, [email, password]);

  const resetForm = useCallback(() => {
    setEmail("");
    setPassword("");
  }, []);

  const contextValue = useMemo<LoginFormInputContextType>(
    () => ({
      email,
      password,
      isLoginReady,
      setEmail,
      setPassword,
      resetForm,
    }),
    [email, password, isLoginReady, resetForm],
  );

  return (
    <LoginFormInputContext.Provider value={contextValue}>{children}</LoginFormInputContext.Provider>
  );
};

export default function LoginPage() {
  return (
    <PageRoot backgroundColor={tokens.color.neutral["50"]} layout="contained">
      <LoginFlowProvider>
        <LoginFormContent />
      </LoginFlowProvider>
    </PageRoot>
  );
}
