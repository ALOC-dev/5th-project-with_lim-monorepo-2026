import { useEffect, useState } from "react";

import Header from "../../components/Header/Header";
import { Input } from "../../components/Input";
import { useAppBackNavigate, useAppNavigate } from "../../routes/useAppNavigate";
import { useForgotPasswordInput } from "./ForgotPassword.context";
import { S } from "./ForgotPassword.styled";

export default function ForgotPasswordForm() {
  const {
    email,
    setEmail,
    authCode,
    setAuthCode,
    isEmailCodeSent,
    isAuthCodeReady,
    handleSendAuthCode,
    handleVerifyAuthCode,
  } = useForgotPasswordInput();

  const navigate = useAppNavigate();
  const navigateBack = useAppBackNavigate("/login");

  // ⏱️ 타이머 상태 관리 추가
  const [timeLeft, setTimeLeft] = useState(300);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isEmailCodeSent && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isEmailCodeSent, timeLeft]);

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
    if (!isAuthCodeReady || timeLeft === 0) return;

    try {
      await handleVerifyAuthCode();
      void navigate("/login/forgotpassword/reset");
    } catch (error) {
      console.error("인증 실패", error);
    }
  };

  return (
    <S.Container>
      <Header onBack={navigateBack} title="비밀번호 재설정" />

      <S.Form onSubmit={handleSubmit}>
        <S.IntroSection>
          <S.Heading>
            가입한 이메일
            <br />
            인증 후 비밀번호를
            <br />
            <S.NoWrap>바꿀 수 있어요</S.NoWrap>
          </S.Heading>
          <S.Description>
            계정 보호를 위해 이메일 인증이 완료된 뒤 재설정 화면으로 이동합니다.
          </S.Description>
        </S.IntroSection>

        <S.InfoBox>
          <S.InfoTitle>보안을 위해 이메일 인증이 필요합니다</S.InfoTitle>
          <S.InfoText>
            가입 여부는 화면에서 구분하지 않고 인증 완료 후 재설정으로 이동합니다.
          </S.InfoText>
        </S.InfoBox>

        <S.InputGroup>
          <S.Label htmlFor="email">이메일</S.Label>
          <S.InputRow>
            <Input
              type="email"
              id="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={isEmailCodeSent}
            />
            <S.ActionButton
              type="button"
              onClick={handleSendCodeWithTimer}
              $variant={isEmailCodeSent ? "secondary" : "primary"}
            >
              {isEmailCodeSent ? "다시 받기" : "인증번호 받기"}
            </S.ActionButton>
          </S.InputRow>

          {isEmailCodeSent && (
            <S.HelperText $state="error">
              인증번호가 발송되었습니다. 이메일을 확인해주세요.
            </S.HelperText>
          )}
        </S.InputGroup>

        {isEmailCodeSent && (
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
              />
              <S.ActionButton
                type="submit"
                disabled={!isAuthCodeReady || timeLeft === 0}
                $variant="primary"
              >
                인증하기
              </S.ActionButton>
            </S.InputRow>

            {timeLeft > 0 ? (
              <S.HelperText>남은 시간 {formatTime(timeLeft)}</S.HelperText>
            ) : (
              <S.HelperText $state="error">
                인증 시간이 만료되었습니다. 다시 시도해 주세요.
              </S.HelperText>
            )}
          </S.InputGroup>
        )}

        <S.Footer isBottomFixed>
          <S.LoginLink to="/login">로그인 화면으로 돌아가기</S.LoginLink>
        </S.Footer>
      </S.Form>
    </S.Container>
  );
}
