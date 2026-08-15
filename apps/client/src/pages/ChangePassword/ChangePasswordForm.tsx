import { toast } from "sonner";

import Header from "../../components/Header/Header";
import { Input } from "../../components/Input";
import { useAppNavigate } from "../../routes/useAppNavigate";
import { useChangePassword } from "./ChangePassword.context";
import { S } from "./ChangePassword.styled";

export default function ChangePasswordForm() {
  const { password, setPassword, passwordConfirm, setPasswordConfirm, handleChangePassword } =
    useChangePassword();

  const navigate = useAppNavigate();

  const isPasswordValid =
    /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+~`\-={}[\]:;"'<>,.?/]{8,20}$/.test(password);

  const isPasswordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;
  const isPasswordMatch = passwordConfirm.length > 0 && password === passwordConfirm;

  const isResetReady = isPasswordValid && isPasswordMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isPasswordValid) {
      toast.warning("비밀번호 형식을 확인해 주세요.");
      return;
    }

    if (!isResetReady) return;

    try {
      await handleChangePassword();
      toast.success("비밀번호가 성공적으로 변경되었습니다.");
      void navigate("/my");
    } catch (error) {
      console.error("비밀번호 변경 실패", error);
      toast.error("비밀번호 변경에 실패했습니다.");
    }
  };

  return (
    <S.Container>
      <Header onBack={() => navigate("/my")} title="비밀번호 변경" />

      <S.Form onSubmit={handleSubmit}>
        <S.IntroSection>
          <S.Heading>
            새로운 비밀번호를
            <br />
            입력해 주세요
          </S.Heading>
          <S.Description>
            주기적인 비밀번호 변경은 계정을 안전하게 <S.NoWrap>보호하는 데 도움이 됩니다.</S.NoWrap>
          </S.Description>
        </S.IntroSection>

        <S.InputGroup>
          <S.Label htmlFor="password">새 비밀번호</S.Label>
          <Input
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
          <Input
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
