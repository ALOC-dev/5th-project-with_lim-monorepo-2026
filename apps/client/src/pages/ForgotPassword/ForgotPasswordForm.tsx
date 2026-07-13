import { useNavigate } from "react-router-dom";

import { Icon } from "../../components/Icon/Icon";
import { tokens } from "../../design-system/tokens.generated";
import { useForgotPasswordInput } from "./ForgotPassword.context";
import { S } from "./ForgotPassword.styled";

export default function ForgotPasswordPage() {
  const { email, setEmail } = useForgotPasswordInput();

  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
          <S.Title>비밀번호 찾기</S.Title>
        </S.NavBar>
      </S.Header>

      <S.Form onSubmit={handleSubmit}>
        <S.IntroSection>
          <S.Badge>계정 복구</S.Badge>
          <S.Heading>
            가입한 이메일로
            <br />
            재설정 링크를 보내드려요
          </S.Heading>
          <S.Description>가입 여부를 확인한 뒤 비밀번호 재설정 안내를 보내드립니다.</S.Description>
        </S.IntroSection>

        <S.InfoBox>
          <S.InfoTitle>보안을 위해 이메일로만 안내합니다</S.InfoTitle>
          <S.InfoText>가입한 주소와 일치할 때만 재설정 링크가 발송됩니다.</S.InfoText>
        </S.InfoBox>

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
          <S.HelperText>가입한 이메일 주소를 입력해 주세요</S.HelperText>
        </S.InputGroup>

        <S.SubmitButton type="submit">재설정 링크 받기</S.SubmitButton>

        <S.Footer>
          <S.FooterText>비밀번호가 기억났나요?</S.FooterText>
          <S.LoginLink to="/login">로그인</S.LoginLink>
        </S.Footer>
      </S.Form>
    </S.Container>
  );
}
