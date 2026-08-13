import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";

import OverlayShell from "../OverlayShell/OverlayShell";
import { useOverlayPresence } from "../OverlayShell/useOverlayPresence";
import { getResizedSheetTop } from "./BottomSheet.data";
import { S } from "./BottomSheet.styled";

export type BottomSheetProps = {
  readonly id: string;
  readonly isOpen: boolean;
  readonly close: () => void;
  readonly backdropTone?: "dimmed" | "none";
  readonly closeOnBackdropClick?: boolean;
  readonly children: ReactNode;
  readonly handleType?: "none" | "resizable";
  readonly initialHeight?: string;
  /** Minimum height while a resizable sheet is dragged. */
  readonly minHeight?: string;
  /** Smallest viewport top offset allowed while a resizable sheet is dragged. */
  readonly minimumTop?: number;
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
  initialHeight = "auto",
  minHeight = "0",
  minimumTop,
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

  useLayoutEffect(() => {
    // 초기 높이는 styled prop 대신 실제 시트 요소에만 적용한다.
    elementRef.current?.style.setProperty("height", initialHeight);
  }, [initialHeight]);

  useEffect(() => {
    // 모달이 열릴 때만 이전 포커스를 기억하고, 앱 본문을 보조기술/키보드 탐색에서 제외한다.
    // 여러 모달 시트가 겹칠 수 있으므로 최초 진입 시에만 root의 기존 상태를 저장한다.
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
    elementRef.current?.focus();

    return () => {
      // 닫히는 시점에는 마지막 모달일 때만 root 상태를 복원하고, 열기 전 포커스로 되돌린다.
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

    // 포인터가 핸들 밖으로 나가도 move/up 이벤트를 계속 받도록 캡처하고,
    // 이번 드래그의 기준점(시트 현재 top, 포인터 시작 Y)을 저장한다.
    e.currentTarget.setPointerCapture(e.pointerId);
    baseYRef.current = elementRef.current.getBoundingClientRect().top;

    // minimumTop이 없으면 현재 렌더링 위치를 인라인 top으로 고정해 드래그 기준을 맞춘다.
    if (minimumTop === undefined) {
      elementRef.current.style.top = `${baseYRef.current}px`;
    }

    dragStartYRef.current = e.clientY;
  };

  const onHandlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    // 드래그 중에만 시작 지점 대비 이동량으로 다음 top을 계산해 즉시 반영한다.
    if (dragStartYRef.current === null) return;
    if (elementRef.current === null) return;
    if (baseYRef.current === null) return;

    const delta = e.clientY - dragStartYRef.current;
    const newTop = getNextTop({
      currentTop: baseYRef.current,
      delta,
      element: elementRef.current,
      minimumTop,
    });

    elementRef.current.style.top = `${newTop}px`;
    if (minimumTop !== undefined) {
      // 상단 이동에 따라 시트 하단이 뷰포트에 고정되도록 높이도 함께 갱신한다.
      elementRef.current.style.height = `${window.innerHeight - newTop}px`;
    }
  };

  const finishHandleDrag = (e: PointerEvent<HTMLDivElement>) => {
    // 마지막 포인터 위치를 한 번 더 계산해 드래그 결과를 다음 드래그의 기준 위치로 확정한다.
    if (baseYRef.current === null) return;
    if (dragStartYRef.current === null) return;
    if (elementRef.current === null) return;

    const delta = e.clientY - dragStartYRef.current;
    const nextTop = getNextTop({
      currentTop: baseYRef.current,
      delta,
      element: elementRef.current,
      minimumTop,
    });

    baseYRef.current = nextTop;
    elementRef.current.style.top = `${nextTop}px`;
    if (minimumTop !== undefined) {
      elementRef.current.style.height = `${window.innerHeight - nextTop}px`;
    }

    dragStartYRef.current = null;
    // 캡처를 해제해 이 포인터 스트림에 대한 드래그를 종료한다.
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const cancelHandleDrag = (e: PointerEvent<HTMLDivElement>) => {
    // 브라우저가 포인터 동작을 취소하면 위치는 유지하고 드래그 상태만 정리한다.
    dragStartYRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // 키보드 제어는 모달 시트에서만 적용한다. 일반 시트의 기본 탐색 흐름은 유지한다.
    if (!isModal) return;
    if (event.key === "Escape") {
      // Escape는 모달을 닫고, 브라우저 기본 동작은 막는다.
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    // Tab/Shift+Tab이 시트의 양 끝에 도달하면 반대편으로 이동시켜 포커스를 시트 안에 가둔다.
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
        $minHeight={minHeight}
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

const getNextTop = ({
  currentTop,
  delta,
  element,
  minimumTop,
}: {
  readonly currentTop: number;
  readonly delta: number;
  readonly element: HTMLElement;
  readonly minimumTop: number | undefined;
}): number => {
  if (minimumTop === undefined) {
    // 최소 top 제약이 없을 때는 시트가 뷰포트 상단 밖으로만 나가지 않게 제한한다.
    return Math.max(currentTop + delta, 0);
  }

  // 리사이즈 모드에서는 최소 높이와 최소 top을 모두 만족하는 위치를 계산한다.
  const minimumHeight = Number.parseFloat(window.getComputedStyle(element).minHeight) || 0;

  return getResizedSheetTop({
    currentTop,
    delta,
    minimumHeight,
    minimumTop,
    viewportHeight: window.innerHeight,
  });
};

export default BottomSheet;
