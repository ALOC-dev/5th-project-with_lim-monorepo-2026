import { useEffect, useState } from "react";

import { requestSignup } from "../../apis/auth";
import { toApiClientErrorMessage } from "../../apis/errors";
import Header from "../../components/Header/Header";
import { Input } from "../../components/Input";
import Modal from "../../components/Modal/Modal";
import { useAppNavigate } from "../../routes/useAppNavigate";
import { useSignupFormInput } from "./Signup.context";
import { S } from "./Signup.styled";

export default function SignupFormContent() {
  const {
    nickname,
    email,
    authCode,
    password,
    passwordConfirm,
    isNicknameChecked,
    isAuthCodeReady,
    isEmailCodeSent,
    isEmailVerified,
    isSignupReady,
    isAgreed,
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
  } = useSignupFormInput();

  const navigate = useAppNavigate();

  const isPasswordValid =
    /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+~`\-={}[\]:;"'<>,.?/]{8,20}$/.test(password);

  const isPasswordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;
  const isPasswordMatch = passwordConfirm.length > 0 && password === passwordConfirm;

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);

  const [timeLeft, setTimeLeft] = useState(300);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isEmailCodeSent && !isEmailVerified && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isEmailCodeSent, isEmailVerified, timeLeft]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
  };

  const handleSendCodeWithTimer = async () => {
    setTimeLeft(300);
    await handleSendAuthCode();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isPasswordValid) {
      alert("비밀번호 형식을 확인해 주세요.");
      return;
    }

    if (!isSignupReady) return;

    try {
      const data = await requestSignup({
        email,
        password,
        nickname,
      });

      if (data.success) {
        alert("회원가입에 성공했습니다!");
        void navigate("/login");
      }
    } catch (error) {
      const errorMessage = toApiClientErrorMessage(error);
      alert(`회원가입 중 오류가 발생해습니다: ${errorMessage}`);
    }
  };

  const handleEmailInputClick = () => {
    if (isEmailVerified) {
      setIsEmailModalOpen(true);
    }
  };

  const handleConfirmEmailChange = () => {
    handleResetEmail();
    setIsEmailModalOpen(false);
  };

  const handleNicknameInputClick = () => {
    if (isNicknameChecked) {
      setIsNicknameModalOpen(true);
    }
  };

  const handleConfirmNicknameChange = () => {
    handleResetNickname();
    setIsNicknameModalOpen(false);
  };

  return (
    <S.Container>
      <Header onBack={() => navigate(-1)} title="회원가입" />

      <S.Form onSubmit={handleSubmit}>
        <S.InputGroup>
          <S.Label htmlFor="email">이메일</S.Label>
          <S.InputRow>
            <Input
              type="email"
              id="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={isEmailVerified}
              onClick={handleEmailInputClick}
            />
            <S.ActionButton
              type="button"
              onClick={isEmailVerified ? handleEmailInputClick : handleSendCodeWithTimer}
              $variant={isEmailVerified ? "disabled" : isEmailCodeSent ? "secondary" : "primary"}
            >
              {isEmailVerified ? "이메일 변경" : isEmailCodeSent ? "다시 받기" : "인증번호 받기"}
            </S.ActionButton>
          </S.InputRow>

          {isEmailCodeSent && !isEmailVerified && (
            <S.HelperText $state="error">
              인증번호가 발송되었습니다. 이메일을 확인해주세요.
            </S.HelperText>
          )}
        </S.InputGroup>

        <S.InputGroup>
          <S.Label htmlFor="authCode">인증번호</S.Label>
          <S.InputRow>
            <Input
              type="text"
              id="authCode"
              placeholder="6자리 숫자"
              maxLength={6}
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              disabled={!isEmailCodeSent || isEmailVerified}
            />
            <S.ActionButton
              type="button"
              disabled={!isEmailCodeSent || !isAuthCodeReady || timeLeft === 0 || isEmailVerified}
              onClick={handleVerifyAuthCode}
              $variant={isEmailVerified ? "disabled" : "primary"}
            >
              {isEmailVerified ? "인증 완료" : "인증하기"}
            </S.ActionButton>
          </S.InputRow>

          {!isEmailCodeSent && !isEmailVerified ? (
            <S.HelperText>이메일 인증번호를 발송해 주세요.</S.HelperText>
          ) : isEmailVerified ? (
            <S.HelperText $state="error">이메일 인증이 완료되었습니다.</S.HelperText>
          ) : timeLeft > 0 ? (
            <S.HelperText>남은 시간 {formatTime(timeLeft)}</S.HelperText>
          ) : (
            <S.HelperText $state="error">
              인증 시간이 만료되었습니다. 다시 시도해 주세요.
            </S.HelperText>
          )}
        </S.InputGroup>

        <S.InputGroup>
          <S.Label htmlFor="password">비밀번호</S.Label>
          <Input
            type="password"
            id="password"
            placeholder="8~20자"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {password.length > 0 && !isPasswordValid ? (
            <S.HelperText $state="error">
              영문과 숫자를 모두 포함하여 8~20자로 입력해 주세요.
            </S.HelperText>
          ) : (
            <S.HelperText>영문과 숫자를 반드시 포함해 주세요.</S.HelperText>
          )}
        </S.InputGroup>

        <S.InputGroup>
          <S.Label htmlFor="passwordConfirm">비밀번호 확인</S.Label>
          <Input
            type="password"
            id="passwordConfirm"
            placeholder="비밀번호 재입력"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
          {isPasswordMismatch ? (
            <S.HelperText $state="error">비밀번호가 일치하지 않습니다.</S.HelperText>
          ) : isPasswordMatch ? (
            <S.HelperText $state="success">비밀번호가 일치합니다.</S.HelperText>
          ) : (
            <S.HelperText>비밀번호와 똑같이 입력해 주세요.</S.HelperText>
          )}
        </S.InputGroup>

        <S.InputGroup>
          <S.Label htmlFor="nickname">닉네임</S.Label>
          <S.InputRow>
            <Input
              type="text"
              id="nickname"
              placeholder="예: limeojin"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              readOnly={isNicknameChecked}
              onClick={handleNicknameInputClick}
            />
            <S.ActionButton
              type="button"
              onClick={handleCheckNickname}
              $variant={isNicknameChecked ? "disabled" : "primary"}
              disabled={isNicknameChecked}
            >
              {isNicknameChecked ? "중복확인 완료" : "중복확인"}
            </S.ActionButton>
          </S.InputRow>
        </S.InputGroup>

        <S.AgreementGroup>
          <S.Checkbox
            type="checkbox"
            id="agreement"
            checked={isAgreed}
            onChange={(e) => setIsAgreed(e.target.checked)}
          />
          <S.AgreementText htmlFor="agreement">
            서비스 이용약관과 개인정보 처리방침에 동의합니다.
          </S.AgreementText>
        </S.AgreementGroup>
        <S.SubmitButton type="submit" disabled={!isSignupReady || !isPasswordValid}>
          가입하기
        </S.SubmitButton>
      </S.Form>

      <Modal
        id="email-reset-modal"
        isOpen={isEmailModalOpen}
        close={() => setIsEmailModalOpen(false)}
        title="이메일을 변경하시겠어요?"
        description="인증은 다시 진행해야 합니다. 계속하시겠어요?"
        secondaryAction={{
          label: "취소",
          onClick: () => setIsEmailModalOpen(false),
        }}
        primaryAction={{
          label: "변경하기",
          onClick: handleConfirmEmailChange,
        }}
      />

      <Modal
        id="nickname-reset-modal"
        isOpen={isNicknameModalOpen}
        close={() => setIsNicknameModalOpen(false)}
        title="닉네임을 변경하시겠어요?"
        description="중복 확인을 다시 진행해야 합니다. 계속하시겠어요?"
        secondaryAction={{
          label: "취소",
          onClick: () => setIsNicknameModalOpen(false),
        }}
        primaryAction={{
          label: "변경하기",
          onClick: handleConfirmNicknameChange,
        }}
      />
    </S.Container>
  );
}
