import { useNavigate } from "react-router-dom";

import { Icon } from "../../components/Icon/Icon";
import { tokens } from "../../design-system/tokens.generated";
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

  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthCodeReady) return;

    handleVerifyAuthCode();
    void navigate("/login/forgotpassword/reset");
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
          <S.Title>비밀번호 재설정</S.Title>
        </S.NavBar>
      </S.Header>

      <S.Form onSubmit={handleSubmit}>
        <S.IntroSection>
          <S.Heading>
            가입한 이메일 인증 후
            <br />
            비밀번호를 바꿀 수 있어요
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
            <S.Input
              type="email"
              id="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isEmailCodeSent}
            />
            <S.ActionButton type="button" onClick={handleSendAuthCode}>
              {isEmailCodeSent ? "다시 받기" : "인증번호 받기"}
            </S.ActionButton>
          </S.InputRow>

          {isEmailCodeSent && (
            <S.HelperText>발송되었습니다. 인증번호를 입력해 주세요.</S.HelperText>
          )}
        </S.InputGroup>
        {isEmailCodeSent && (
          <>
            <S.InputGroup>
              <S.Label htmlFor="authCode">인증번호</S.Label>
              <S.Input
                type="text"
                id="authCode"
                maxLength={6}
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
              />
              <S.HelperText>6자리 숫자를 입력해 주세요.</S.HelperText>
            </S.InputGroup>

            <S.SubmitButton type="submit" disabled={!isAuthCodeReady}>
              재설정으로 이동
            </S.SubmitButton>
          </>
        )}
        <S.Footer isBottomFixed>
          <S.FooterText>비밀번호가 기억났나요?</S.FooterText>
          <S.LoginLink to="/login">로그인</S.LoginLink>
        </S.Footer>
      </S.Form>
    </S.Container>
  );
}
