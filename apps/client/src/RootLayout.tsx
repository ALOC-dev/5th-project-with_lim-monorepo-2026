import styled from "@emotion/styled";

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return <S.Wrapper>{children}</S.Wrapper>;
};

export default RootLayout;

const S = {
  Wrapper: styled.div``,
};
