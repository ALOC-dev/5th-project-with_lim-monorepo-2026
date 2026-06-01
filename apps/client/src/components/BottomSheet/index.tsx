import styled from "@emotion/styled";

import Overlay from "../Overlay";

type BottomSheetProps = {
  children: React.ReactNode;
  withOverlayBg?: boolean;
};

const BottomSheet = ({ children, withOverlayBg }: BottomSheetProps) => {
  return (
    <S.Root>
      {withOverlayBg && <Overlay />}
      <S.BottomSheetShell>
        <S.BottomSheetContent>{children}</S.BottomSheetContent>
      </S.BottomSheetShell>
    </S.Root>
  );
};

export default BottomSheet;

const S = {
  Root: styled.div``,
  BottomSheetShell: styled.div`
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
  `,
  BottomSheetContent: styled.div`
    background-color: white;
    border-radius: 16px 16px 0 0;
    padding: 16px 28px;
  `,
};
