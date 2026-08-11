import { useNavigate } from "react-router-dom";

import Header from "../../components/Header/Header";
import { useForgotPasswordInput } from "./ForgotPassword.context";
import { S } from "./ForgotPassword.styled";

export default function ResetPasswordForm() {
  const { password, setPassword, passwordConfirm, setPasswordConfirm, handleResetPassword } =
    useForgotPasswordInput();

  const navigate = useNavigate();

  const isPasswordValid =
    /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+~`\-={}[\]:;"'<>,.?/]{8,20}$/.test(password);

  const isPasswordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;
  const isPasswordMatch = passwordConfirm.length > 0 && password === passwordConfirm;

  const isResetReady = isPasswordValid && isPasswordMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isPasswordValid) {
      alert("비밀번호 형식을 확인해 주세요.");
      return;
    }

    if (!isResetReady) return;

    try {
      await handleResetPassword();
      void navigate("/login");
    } catch (error) {
      console.error("비밀번호 변경 실패", error);
    }
  };

  return (
    <S.Container>
      <Header onBack={() => navigate(-1)} title="새 비밀번호 설정" />

      <S.Form onSubmit={handleSubmit}>
        <S.IntroSection>
          <S.Badge>인증 완료</S.Badge>
          <S.Heading>
            새로운 비밀번호를
            <br />
            입력해 주세요
          </S.Heading>
          <S.Description>
            이전과 다른 비밀번호를 사용하면 계정을 더 안전하게{" "}
            <S.NoWrap>보호할 수 있습니다.</S.NoWrap>
          </S.Description>
        </S.IntroSection>

        <S.InputGroup>
          <S.Label htmlFor="password">새 비밀번호</S.Label>
          <S.Input
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
          <S.Label htmlFor="passwordConfirm">새 비밀번호 확인</S.Label>
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

        <S.SubmitButton type="submit" disabled={!isResetReady}>
          비밀번호 변경하기
        </S.SubmitButton>
      </S.Form>
    </S.Container>
  );
}
