import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { requestSignup } from "../../apis/auth";
import { toApiClientErrorMessage } from "../../apis/errors";
import { Icon } from "../../components/Icon/Icon";
import Modal from "../../components/Modal/Modal";
import { tokens } from "../../design-system/tokens.generated";
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

  const navigate = useNavigate();

  const isPasswordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;
  const isPasswordMatch = passwordConfirm.length > 0 && password === passwordConfirm;

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);

  // 타이머 상태 추가
  const [timeLeft, setTimeLeft] = useState(300);

  // 이메일이 발송되었고 아직 인증되지 않았을 때 타이머 시작
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isEmailCodeSent && !isEmailVerified && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isEmailCodeSent, isEmailVerified, timeLeft]);

  // 시간을 00:00 포맷으로 변환하는 함수
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
  };

  // 인증번호 받기 버튼 클릭 시 타이머 초기화 래핑 함수
  const handleSendCodeWithTimer = async () => {
    setTimeLeft(300); // 클릭할 때마다 5분으로 리셋
    await handleSendAuthCode();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignupReady) return;

    try {
      const data = await requestSignup({
        email,
        password,
        nickname,
      });
      // 백엔드 응답 구조에 따라 성공 여부를 확인합니다.
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
      <S.Header>
        <S.StatusBarMock>
          <span>9:41</span>
          <span>•••</span>
        </S.StatusBarMock>

        <S.NavBar>
          <S.BackButton type="button" onClick={() => navigate(-1)}>
            <Icon name="back-arrow" size={24} color={tokens.color.neutral["900"]} />
          </S.BackButton>
          <S.Title>회원가입</S.Title>
        </S.NavBar>
      </S.Header>

      <S.Form onSubmit={handleSubmit}>
        <S.InputGroup>
          <S.Label htmlFor="email">이메일</S.Label>
          <S.InputRow>
            <S.Input
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
              $variant={
                isEmailVerified
                  ? "disabled"
                  : isEmailCodeSent
                    ? "secondary" // 다시 받기 시
                    : "primary" // 기본 상태
              }
            >
              {isEmailVerified ? "인증 완료" : isEmailCodeSent ? "다시 받기" : "인증번호 받기"}
            </S.ActionButton>
          </S.InputRow>

          {isEmailCodeSent && !isEmailVerified && (
            <S.HelperText $state="error">
              인증번호가 발송되었습니다. 이메일을 확인해주세요.
            </S.HelperText>
          )}
        </S.InputGroup>

        {isEmailCodeSent && !isEmailVerified && (
          <S.InputGroup>
            <S.Label htmlFor="authCode">인증번호</S.Label>

            <S.InputRow>
              <S.Input
                type="text"
                id="authCode"
                placeholder="6자리 숫자"
                maxLength={6}
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
              />
              <S.ActionButton
                type="button"
                disabled={!isAuthCodeReady || timeLeft === 0}
                onClick={handleVerifyAuthCode}
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
        <S.InputGroup>
          <S.Label htmlFor="password">비밀번호</S.Label>
          <S.Input
            type="password"
            id="password"
            placeholder="8~20자"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <S.HelperText>영문과 숫자를 반드시 포함해 주세요.</S.HelperText>
        </S.InputGroup>

        <S.InputGroup>
          <S.Label htmlFor="passwordConfirm">비밀번호 확인</S.Label>
          <S.Input
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
            <S.Input
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

        <S.SubmitButton type="submit" disabled={!isSignupReady}>
          가입하기
        </S.SubmitButton>
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
