import { type AxiosError } from "axios"; // 💡 axios 에러 타입을 위해 추가
import { useNavigate } from "react-router-dom";

import { requestSignup } from "../../apis/auth";
import { Icon } from "../../components/Icon/Icon";
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
  } = useSignupFormInput();

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignupReady) return;

    try {
      const response = await requestSignup({
        email,
        password,
        nickname,
      });
      // 백엔드 응답 구조에 따라 성공 여부를 확인합니다.
      if (response.success) {
        alert("회원가입에 성공했습니다!");
        void navigate("/login");
      }
    } catch (error) {
      // 💡 2. error를 AxiosError 타입으로 정의하여 안전하게 접근
      const err = error as AxiosError<{ error?: string }>;
      const errorMessage =
        err.response?.data?.error || "회원가입 중 오류가 발생했습니다. 다시 시도해 주세요.";
      alert(errorMessage);
    }
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
              disabled={isEmailVerified} // 인증 완료 시 수정 불가
            />
            <S.ActionButton type="button" onClick={handleSendAuthCode}>
              {isEmailCodeSent ? "다시 받기" : "인증번호 받기"}
            </S.ActionButton>
          </S.InputRow>
        </S.InputGroup>

        {isEmailCodeSent && !isEmailVerified && (
          <S.InputGroup>
            <S.Label htmlFor="authCode">인증번호</S.Label>

            <S.Input
              type="text"
              id="authCode"
              maxLength={6}
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
            />

            <S.HelperText>인증번호 6자리를 확인해 주세요.</S.HelperText>

            <S.SubmitButton
              type="button"
              disabled={!isAuthCodeReady}
              onClick={handleVerifyAuthCode}
            >
              인증하기
            </S.SubmitButton>
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
          <S.HelperText>비밀번호와 똑같이 입력해 주세요.</S.HelperText>
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
            />
            <S.ActionButton type="button" onClick={handleCheckNickname}>
              중복확인
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
    </S.Container>
  );
}
