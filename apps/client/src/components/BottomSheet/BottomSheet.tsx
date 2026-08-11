import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";

import OverlayShell from "../OverlayShell/OverlayShell";
import { useOverlayPresence } from "../OverlayShell/useOverlayPresence";
import { S } from "./BottomSheet.styled";

export type BottomSheetProps = {
  readonly id: string;
  readonly isOpen: boolean;
  readonly close: () => void;
  readonly backdropTone?: "dimmed" | "none";
  readonly closeOnBackdropClick?: boolean;
  readonly children: ReactNode;
  readonly handleType?: "none" | "resizable";
  readonly height?: string;
  /** Enables focus management and hides the application behind a modal sheet. */
  readonly isModal?: boolean;
  readonly ariaLabel?: string;
};

const BOTTOM_SHEET_ANIMATION_DURATION_MS = 200;

let activeModalSheetCount = 0;
let previousAppAriaHidden: string | null = null;
let appWasInert = false;

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hidden && element.getClientRects().length > 0);

const BottomSheet = ({
  id,
  isOpen,
  children,
  close,
  backdropTone = "dimmed",
  closeOnBackdropClick = false,
  handleType = "resizable",
  height = "auto",
  isModal = false,
  ariaLabel,
}: BottomSheetProps) => {
  const presence = useOverlayPresence({
    isOpen,
    animationDurationMs: BOTTOM_SHEET_ANIMATION_DURATION_MS,
  });
  const elementRef = useRef<HTMLDivElement | null>(null);
  // baseY: 가만히 뒀을 때 고정되는 위치를 지정
  const baseYRef = useRef<number | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isModal || !isOpen) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appRoot = document.getElementById("root");
    if (appRoot) {
      if (activeModalSheetCount === 0) {
        previousAppAriaHidden = appRoot.getAttribute("aria-hidden");
        appWasInert = appRoot.hasAttribute("inert");
        appRoot.setAttribute("aria-hidden", "true");
        appRoot.setAttribute("inert", "");
      }
      activeModalSheetCount += 1;
    }
    const frame = window.requestAnimationFrame(() => elementRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      if (appRoot) {
        activeModalSheetCount = Math.max(0, activeModalSheetCount - 1);
        if (activeModalSheetCount === 0) {
          if (previousAppAriaHidden === null) appRoot.removeAttribute("aria-hidden");
          else appRoot.setAttribute("aria-hidden", previousAppAriaHidden);
          if (!appWasInert) appRoot.removeAttribute("inert");
        }
      }
      restoreFocusRef.current?.focus();
    };
  }, [isModal, isOpen]);

  const onHandlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (elementRef.current === null) return;
    baseYRef.current = elementRef.current.getBoundingClientRect().top;
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
    const nextTop = Math.max(baseYRef.current + delta, 0);

    baseYRef.current = nextTop;
    elementRef.current.style.top = `${nextTop}px`;

    dragStartYRef.current = null;
  };

  const cancelHandleDrag = () => {
    dragStartYRef.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isModal) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const focusableElements = getFocusableElements(event.currentTarget);
    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    if (!first || !last) return;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === event.currentTarget)
    ) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <OverlayShell
      id={id}
      presence={presence}
      backdropTone={backdropTone}
      backdropHandler={closeOnBackdropClick ? close : () => {}}
      animationDurationMs={BOTTOM_SHEET_ANIMATION_DURATION_MS}
    >
      <S.Wrapper
        ref={elementRef}
        aria-label={ariaLabel}
        aria-modal={isModal || undefined}
        data-state={presence}
        $height={height}
        onKeyDown={onKeyDown}
        role={isModal ? "dialog" : undefined}
        tabIndex={isModal ? -1 : undefined}
      >
        {handleType === "resizable" && (
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
