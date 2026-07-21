import { type AxiosError } from "axios";
import { useNavigate } from "react-router-dom";

import { requestLogin } from "../../apis/auth";
import { useAuth } from "../../contexts/Auth.context";
import { useLoginFormInput } from "./Login.context";
import { S } from "./Login.styled";

export default function LoginFormContent() {
  const { email, password, isLoginReady, setEmail, setPassword } = useLoginFormInput();

  const navigate = useNavigate();

  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoginReady) return;

    try {
      const response = await requestLogin({ email, password });

      if (response.success) {
        alert("로그인에 성공했습니다!");
        // AuthContext의 isAuthenticated가 true로 바꿈
        login();
        // replace: true를 넣으면, 로그인 성공 후 뒤로가기를 눌러도 다시 로그인 페이지로 오지 않게 막아줍니다.
        void navigate("/place/recommendation/form", { replace: true });
      }
    } catch (error) {
      const err = error as AxiosError<{ error?: string }>;
      const errorMessage =
        err.response?.data?.error || "로그인 중 오류가 발생했습니다. 다시 시도해 주세요.";
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
