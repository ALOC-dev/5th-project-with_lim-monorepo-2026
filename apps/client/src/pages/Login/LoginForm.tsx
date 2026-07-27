import { useLoginFormInput } from "./Login.context";
import { S } from "./Login.styled";

export default function LoginFormContent() {
  const { email, password, isLoginReady, setEmail, setPassword, resetForm } = useLoginFormInput();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoginReady) return;
    // console.log("Login attempt:", { email, password });
  };
  return (
    <S.Container>
      <S.Header>
        <S.StatusBarMock>
          <span>9:41</span>
          <span>•••</span>
        </S.StatusBarMock>
        <S.Title>로그인</S.Title>
      </S.Header>

      <S.Form onSubmit={handleSubmit}>
        <S.InputGroup>
          <S.Label htmlFor="email">이메일</S.Label>
          <S.Input
            type="email"
            id="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </S.InputGroup>

        <S.InputGroup>
          <S.Label htmlFor="password">비밀번호</S.Label>
          <S.Input
            type="password"
            id="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </S.InputGroup>

        <S.SubmitButton type="submit" disabled={!isLoginReady}>
          로그인
        </S.SubmitButton>

        <S.AssistSection>
          <S.StyledLink to="/login/forgotpassword">비밀번호를 잊으셨나요?</S.StyledLink>
        </S.AssistSection>
      </S.Form>

      <S.Footer>
        <S.FooterText>아직 계정이 없나요?</S.FooterText>
        <S.SignupLink to="/signup">회원가입</S.SignupLink>
      </S.Footer>
    </S.Container>
  );
}
