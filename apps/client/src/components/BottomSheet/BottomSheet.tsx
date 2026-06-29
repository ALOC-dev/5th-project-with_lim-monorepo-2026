import type { PointerEvent, ReactNode } from "react";
import { useRef } from "react";

import OverlayShell from "../OverlayShell/OverlayShell";
import { useOverlayPresence } from "../OverlayShell/useOverlayPresence";
import { S } from "./BottomSheet.styled";

export type BottomSheetProps = {
  readonly id: string;
  readonly isOpen: boolean;
  readonly close: () => void;
  readonly children: ReactNode;
};

const BOTTOM_SHEET_ANIMATION_DURATION_MS = 200;
const THRESHOLD_TO_CLOSE = 20; // 드래그 후 닫히는 기준점 (px)

const BottomSheet = ({ id, isOpen, children, close }: BottomSheetProps) => {
  const presence = useOverlayPresence({
    isOpen,
    animationDurationMs: BOTTOM_SHEET_ANIMATION_DURATION_MS,
  });
  const elementRef = useRef<HTMLDivElement | null>(null);
  // baseY: 가만히 뒀을 때 고정되는 위치를 지정
  const baseYRef = useRef<number | null>(null);
  const dragStartYRef = useRef<number | null>(null);

  const onHandlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (elementRef.current === null) return;
    baseYRef.current = window.innerHeight - elementRef.current.offsetHeight;
    elementRef.current.style.top = `${baseYRef.current}px`;

    dragStartYRef.current = e.clientY;
  };

  const onHandlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return;
    if (elementRef.current === null) return;
    if (baseYRef.current === null) return;

    const delta = e.clientY - dragStartYRef.current;
    const newTop = Math.max(baseYRef.current + delta, 0);

    elementRef.current.style.top = `${newTop}px`;
  };

  const finishHandleDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (baseYRef.current === null) return;
    if (dragStartYRef.current === null) return;
    if (elementRef.current === null) return;

    const delta = e.clientY - dragStartYRef.current;

    if (delta > THRESHOLD_TO_CLOSE) {
      dragStartYRef.current = null;
      close();
      return;
    }

    elementRef.current.style.top = `${baseYRef.current}px`;

    dragStartYRef.current = null;
  };

  const cancelHandleDrag = () => {
    dragStartYRef.current = null;
  };

  return (
    <OverlayShell
      id={id}
      presence={presence}
      close={close}
      animationDurationMs={BOTTOM_SHEET_ANIMATION_DURATION_MS}
    >
      <S.Wrapper ref={elementRef} data-state={presence}>
        <S.HandleWrapper
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={finishHandleDrag}
          onPointerCancel={cancelHandleDrag}
        >
          <S.Handle />
        </S.HandleWrapper>
        <S.InnerPadding>{children}</S.InnerPadding>
      </S.Wrapper>
    </OverlayShell>
  );
};

export default BottomSheet;
