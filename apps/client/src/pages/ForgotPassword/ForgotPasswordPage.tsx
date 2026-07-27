import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";

import { client } from "../../apis/client";
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

  const isAuthCodeReady = useMemo(() => {
    return authCode.length === 6;
  }, [authCode]);

  const handleSendAuthCode = useCallback(async () => {
    if (email.length === 0) return alert("이메일을 입력해주세요.");

    try {
      // 실제 메일 발송 API 호출
      await client.post("/password/send-code", { email });
      setIsEmailCodeSent(true);
      alert("인증번호가 발송되었습니다. 이메일을 확인해주세요.");
    } catch (error) {
      alert("인증번호 발송에 실패했습니다. 가입된 이메일인지 확인해 주세요.");
      console.error(error);
    }
  }, [email]);

  const handleVerifyAuthCode = useCallback(async () => {
    if (authCode.length !== 6) {
      alert("인증번호 6자리를 정확히 입력해주세요.");
      throw new Error("Invalid Code Length"); // 에러를 던져서 폼의 다음 단계(navigate)를 막음
    }

    try {
      // 실제 코드 검증 API 호출
      await client.post("/password/verify-code", { email, code: authCode });
      alert("이메일 인증이 완료되었습니다.");
    } catch (error) {
      alert("잘못된 인증번호이거나 만료되었습니다.");
      console.error(error);
      throw error; // 에러를 던져서 폼의 다음 단계(navigate)를 막음
    }
  }, [email, authCode]);

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
      isAuthCodeReady,
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
      isAuthCodeReady,
      setPassword,
      setPasswordConfirm,
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
