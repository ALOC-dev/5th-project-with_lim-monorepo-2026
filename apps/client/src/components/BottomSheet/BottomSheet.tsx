import type { PointerEvent } from "react";
import { useRef } from "react";

import OverlayShell, { type OverlayProps } from "../OverlayShell/OverlayShell";
import { S } from "./BottomSheet.styled";

type BottomSheetProps = {
  children: React.ReactNode;
  handleType?: "none" | "drag-and-pin" | "drag-and-back";
} & OverlayProps;

const THRESHOLD_TO_CLOSE = 20; // 드래그 후 닫히는 기준점 (px)

const BottomSheet = ({
  id,
  children,
  zIndex,
  backdropTone = "dim",
  handleType = "drag-and-back",
  presence,
  backdropHandler,
  presenceAnimationDurationMs,
}: BottomSheetProps) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  // baseY: 가만히 뒀을 때 고정되는 위치를 지정
  const baseYRef = useRef<number | null>(null);
  const dragStartYRef = useRef<number | null>(null);

  const onHandlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (elementRef.current === null) return;
    baseYRef.current = window.innerHeight - elementRef.current.offsetHeight;
    elementRef.current.style.top = `${baseYRef.current}px`;

    dragStartYRef.current = e.clientY;
    console.log(e.clientY);
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
    const newTop = Math.max(baseYRef.current + delta, 0);

    if (delta > THRESHOLD_TO_CLOSE) {
      backdropHandler?.();
      return;
    }

    const isPin = handleType === "drag-and-pin";
    if (isPin) {
      elementRef.current.style.top = `${(baseYRef.current = newTop)}px`;
      return;
    } else {
      elementRef.current.style.top = `${baseYRef.current}px`;
    }

    dragStartYRef.current = null;
  };

  const cancelHandleDrag = () => {
    dragStartYRef.current = null;
  };

  if (presence === "closed") return null;

  return (
    <OverlayShell
      id={id}
      zIndex={zIndex}
      backdropTone={backdropTone}
      backdropHandler={backdropHandler}
      presence={presence}
      presenceAnimationDurationMs={presenceAnimationDurationMs}
    >
      <S.Wrapper
        ref={elementRef}
        data-state={presence}
        $presenceAnimationDurationMs={presenceAnimationDurationMs}
      >
        {handleType !== "none" && (
          <S.HandleWrapper
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={finishHandleDrag}
            onPointerCancel={cancelHandleDrag}
          >
            <S.Handle />
          </S.HandleWrapper>
        )}
        <S.InnerPadding>{children}</S.InnerPadding>
      </S.Wrapper>
    </OverlayShell>
  );
};

export default BottomSheet;
