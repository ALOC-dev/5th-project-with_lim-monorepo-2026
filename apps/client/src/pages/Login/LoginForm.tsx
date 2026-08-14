import { toast } from "sonner";

import { requestLogin } from "../../apis/auth";
import { toApiClientErrorMessage } from "../../apis/errors";
import Header from "../../components/Header/Header";
import { Input } from "../../components/Input";
import { useAuth } from "../../contexts/Auth.context";
import { useAppNavigate } from "../../routes/useAppNavigate";
import { useLoginFormInput } from "./Login.context";
import { S } from "./Login.styled";

export default function LoginFormContent() {
  const { email, password, isLoginReady, setEmail, setPassword } = useLoginFormInput();

  const navigate = useAppNavigate();

  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoginReady) return;

    try {
      const response = await requestLogin({ email, password });

      if (response.success) {
        toast.success("로그인에 성공했습니다!");
        login();
        void navigate("/", { replace: true });
      }
    } catch (error) {
      toast.error(toApiClientErrorMessage(error));
    }
  };

  return (
    <S.Container>
      <Header title="로그인" />

      <S.Form onSubmit={handleSubmit}>
        <S.InputGroup>
          <S.Label htmlFor="email">이메일</S.Label>
          <Input
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
          <Input
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
          <S.StyledLink to="/login/forgotpassword">
            비밀번호를 잊으셨나요?
          </S.StyledLink>
        </S.AssistSection>
      </S.Form>

      <S.Footer>
        <S.FooterText>아직 계정이 없나요?</S.FooterText>
        <S.SignupLink to="/signup">
          회원가입
        </S.SignupLink>
      </S.Footer>
    </S.Container>
  );
}
