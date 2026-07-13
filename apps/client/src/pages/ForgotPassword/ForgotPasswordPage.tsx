import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";

import { ForgotPasswordContext, type ForgotPasswordContextType } from "./ForgotPassword.context";

const ForgotPasswordFlowProvider = ({ children }: { readonly children: ReactNode }) => {
  const [email, setEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [isEmailCodeSent, setIsEmailCodeSent] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  const isResetReady = useMemo(() => {
    return password.length >= 8 && password === passwordConfirm;
  }, [password, passwordConfirm]);

  const handleSendAuthCode = useCallback(() => {
    if (email.length > 0) setIsEmailCodeSent(true);
  }, [email]);

  const handleVerifyAuthCode = useCallback(() => {
    if (authCode.length > 0) setIsEmailVerified(true);
  }, [authCode]);

  const resetForm = useCallback(() => {
    setEmail("");
    setAuthCode("");
    setPassword("");
    setPasswordConfirm("");
    setIsEmailCodeSent(false);
    setIsEmailVerified(false);
  }, []);

  const contextValue = useMemo<ForgotPasswordContextType>(
    () => ({
      email,
      authCode,
      isEmailCodeSent,
      isEmailVerified,
      setEmail,
      setAuthCode,
      handleSendAuthCode,
      handleVerifyAuthCode,
      password,
      passwordConfirm,
      isResetReady,
      setPassword,
      setPasswordConfirm,
      resetForm,
    }),
    [
      email,
      authCode,
      isEmailCodeSent,
      isEmailVerified,
      handleSendAuthCode,
      handleVerifyAuthCode,
      password,
      passwordConfirm,
      isResetReady,
      resetForm,
    ],
  );

  return (
    <ForgotPasswordContext.Provider value={contextValue}>{children}</ForgotPasswordContext.Provider>
  );
};

export default function ForgotPasswordPage() {
  return (
    <ForgotPasswordFlowProvider>
      <Outlet />
    </ForgotPasswordFlowProvider>
  );
}
