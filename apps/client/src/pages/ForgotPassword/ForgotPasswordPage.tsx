import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { toast } from "sonner";

import {
  requestResetPassword,
  requestSendPasswordCode,
  requestVerifyPasswordCode,
} from "../../apis/auth";
import { toApiClientErrorMessage } from "../../apis/errors";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
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
    if (email.length === 0) {
      toast.warning("이메일을 입력해주세요.");
      return;
    }

    try {
      await requestSendPasswordCode({ email });
      setIsEmailCodeSent(true);
      toast.success("가입된 계정이라면 인증번호가 발송됩니다. 이메일함을 확인해 주세요.");
    } catch (error) {
      const errorMessage = toApiClientErrorMessage(error);
      toast.error(`인증번호 발송에 실패했습니다. (${errorMessage})`);
      console.error(error);
    }
  }, [email]);

  const handleVerifyAuthCode = useCallback(async () => {
    if (authCode.length !== 6) {
      toast.warning("인증번호 6자리를 정확히 입력해주세요.");
      throw new Error("Invalid Code Length");
    }

    try {
      await requestVerifyPasswordCode({ email, code: authCode });

      toast.success("이메일 인증이 완료되었습니다.");
      setIsEmailVerified(true);
    } catch (error) {
      const errorMessage = toApiClientErrorMessage(error);
      toast.error(`잘못된 인증번호이거나 만료되었습니다. (${errorMessage})`);
      console.error(error);
      throw error;
    }
  }, [email, authCode]);

  const handleResetPassword = useCallback(async () => {
    if (!isResetReady) {
      toast.warning("비밀번호 형식을 확인해 주세요.");
      throw new Error("Password is not ready");
    }

    try {
      await requestResetPassword({ email, newPassword: password });
      toast.success("비밀번호가 성공적으로 변경되었습니다. 다시 로그인해 주세요.");
    } catch (error) {
      const errorMessage = toApiClientErrorMessage(error);
      toast.error(`비밀번호 변경에 실패했습니다. (${errorMessage})`);
      console.error(error);
      throw error;
    }
  }, [email, password, isResetReady]);

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
      handleResetPassword,
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
      handleResetPassword,
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
      <PageRoot backgroundColor={tokens.color.neutral["50"]} layout="contained">
        <Outlet />
      </PageRoot>
    </ForgotPasswordFlowProvider>
  );
}
