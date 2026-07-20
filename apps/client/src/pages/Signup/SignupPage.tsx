// import { SignupFlowProvider } from "./Signup.context";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

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

  const handleCheckNickname = useCallback(() => {
    if (nickname.length > 0) setIsNicknameChecked(true);
  }, [nickname]);

  const handleSendAuthCode = useCallback(() => {
    if (email.length > 0) setIsEmailCodeSent(true);
  }, [email]);

  const handleVerifyAuthCode = useCallback(() => {
    if (authCode.length > 0) setIsEmailVerified(true);
  }, [authCode]);

  const isAuthCodeReady = useMemo(() => {
    return authCode.length === 6;
  }, [authCode]);

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
