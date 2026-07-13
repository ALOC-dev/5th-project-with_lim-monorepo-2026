import { useNavigate } from "react-router-dom";

import { Icon } from "../../components/Icon/Icon";
import { tokens } from "../../design-system/tokens.generated";
import { useForgotPasswordInput } from "./ForgotPassword.context";
import { S } from "./ForgotPassword.styled";

export default function ResetPasswordFormContent() {
  const { password, passwordConfirm, setPassword, setPasswordConfirm } = useForgotPasswordInput();

  const navigate = useNavigate();

  const isResetReady = password.length >= 8 && password === passwordConfirm;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isResetReady) return;

    // console.log("비밀번호 변경 완료:", { password });
    alert("비밀번호가 성공적으로 변경되었습니다.");
    void navigate("/login");
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
          <S.Title>새 비밀번호</S.Title>
        </S.NavBar>
      </S.Header>

      <S.Form onSubmit={handleSubmit}>
        <S.TitleSection>
          <S.Badge>인증 완료</S.Badge>
          <S.Heading>
            새 비밀번호를
            <br />
            설정해 주세요
          </S.Heading>
          <S.HelperText>
            이전과 다른 비밀번호를 사용하면 계정을 더 안전하게 보호할 수 있습니다.
          </S.HelperText>
        </S.TitleSection>

        <S.InputGroup>
          <S.Label htmlFor="password">새 비밀번호</S.Label>
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
          <S.Label htmlFor="passwordConfirm">새 비밀번호 확인</S.Label>
          <S.Input
            type="password"
            id="passwordConfirm"
            placeholder="비밀번호 재입력"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
          <S.HelperText>비밀번호와 똑같이 입력해 주세요.</S.HelperText>
        </S.InputGroup>

        <S.SubmitButton type="submit" disabled={!isResetReady}>
          비밀번호 재설정
        </S.SubmitButton>
      </S.Form>

      <S.Footer>
        <S.FooterText>로그인 화면으로 돌아가기</S.FooterText>
        <S.LoginLink to="/login">로그인</S.LoginLink>
      </S.Footer>
    </S.Container>
  );
}
