import { type ReactNode, useCallback, useMemo, useState } from "react";

import {
  requestNicknameCheck,
  requestSendSignupCode,
  requestVerifySignupCode,
} from "../../apis/auth";
import { SignupFormInputContext, type SignupFormInputContextType } from "./Signup.context";
import SignupFormContent from "./SignupForm";

export const SignupFlowProvider = ({ children }: { readonly children: ReactNode }) => {
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [isNicknameChecked, setIsNicknameChecked] = useState(false);
  const [isEmailCodeSent, setIsEmailCodeSent] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);

  const isSignupReady = useMemo(() => {
    return (
      isNicknameChecked &&
      isEmailVerified &&
      password.length >= 8 &&
      password === passwordConfirm &&
      isAgreed
    );
  }, [isNicknameChecked, isEmailVerified, password, passwordConfirm, isAgreed]);

  const handleCheckNickname = useCallback(async () => {
    if (nickname.trim().length === 0) {
      return alert("닉네임을 입력해주세요.");
    }

    try {
      const response = await requestNicknameCheck(nickname);

      if (response.success && response.data?.available) {
        setIsNicknameChecked(true);
        alert("사용 가능한 닉네임입니다.");
      } else {
        setIsNicknameChecked(false);
        alert("이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.");
      }
    } catch (error) {
      console.error("닉네임 중복 확인 중 오류 발생:", error);
      alert("닉네임 중복 확인에 실패했습니다. 다시 시도해주세요.");
    }
  }, [nickname]);

  const handleSendAuthCode = useCallback(async () => {
    if (email.length === 0) return alert("이메일을 입력해주세요.");

    try {
      await requestSendSignupCode({ email });
      setIsEmailCodeSent(true);
      alert("인증번호가 발송되었습니다. 이메일을 확인해주세요.");
    } catch (error) {
      alert("인증번호 발송에 실패했습니다.");
      console.error(error);
    }
  }, [email]);

  const handleVerifyAuthCode = useCallback(async () => {
    if (authCode.length !== 6) return alert("인증번호 6자리를 정확히 입력해주세요.");

    try {
      await requestVerifySignupCode({ email, code: authCode });
      setIsEmailVerified(true);
      alert("이메일 인증이 완료되었습니다.");
    } catch (error) {
      alert("잘못된 인증번호이거나 만료되었습니다.");
      console.error(error);
    }
  }, [email, authCode]);

  const isAuthCodeReady = useMemo(() => {
    return authCode.length === 6;
  }, [authCode]);

  const handleResetEmail = useCallback(() => {
    setIsEmailCodeSent(false);
    setIsEmailVerified(false);
    setAuthCode("");
  }, []);

  const handleResetNickname = useCallback(() => {
    setIsNicknameChecked(false);
  }, []);

  const resetForm = useCallback(() => {
    setNickname("");
    setEmail("");
    setAuthCode("");
    setPassword("");
    setPasswordConfirm("");
    setIsNicknameChecked(false);
    setIsEmailCodeSent(false);
    setIsEmailVerified(false);
    setIsAgreed(false);
  }, []);

  const contextValue = useMemo<SignupFormInputContextType>(
    () => ({
      nickname,
      email,
      authCode,
      password,
      passwordConfirm,
      isNicknameChecked,
      isEmailCodeSent,
      isEmailVerified,
      isSignupReady,
      isAgreed,
      isAuthCodeReady,
      setNickname,
      setEmail,
      setAuthCode,
      setPassword,
      setPasswordConfirm,
      setIsAgreed,
      handleCheckNickname,
      handleSendAuthCode,
      handleVerifyAuthCode,
      handleResetEmail,
      handleResetNickname,
      resetForm,
    }),
    [
      nickname,
      email,
      authCode,
      password,
      passwordConfirm,
      isNicknameChecked,
      isEmailCodeSent,
      isEmailVerified,
      isSignupReady,
      isAgreed,
      isAuthCodeReady,
      handleCheckNickname,
      handleSendAuthCode,
      handleVerifyAuthCode,
      handleResetEmail,
      handleResetNickname,
      resetForm,
    ],
  );

  return (
    <SignupFormInputContext.Provider value={contextValue}>
      {children}
    </SignupFormInputContext.Provider>
  );
};

export default function SignupPage() {
  return (
    <SignupFlowProvider>
      <SignupFormContent />
    </SignupFlowProvider>
  );
}
