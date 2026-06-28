import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import type { MouseEvent } from "react";
import { useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";

import type { OverlayPresence } from "./useOverlay";

const OVERLAY_ROOT_ID = "overlay-root";

const DEFAULT_Z_INDEX = 1000;

const backdropEnter = keyframes`
  from {
    background-color: transparent;
  }

  to {
    background-color: var(--overlay-backdrop-open-background-color);
  }
`;

const backdropExit = keyframes`
  from {
    background-color: var(--overlay-backdrop-open-background-color);
  }

  to {
    background-color: transparent;
  }
`;

export type BackdropTone = "dim" | "transparent";

export type OverlayProps = {
  id: string;
  zIndex?: number;
  backdropTone?: BackdropTone;
  presence: OverlayPresence;
  presenceAnimationDurationMs: number & { __brand: "ms" };
  backdropHandler?: () => void;
};

/**
 * 모달, 드롭다운 등 오버레이를 위한 공통 컴포넌트.
 * Portal을 이용해 DOM 트리의 최상단에 렌더링되도록 하며, Backdrop 관련 옵션(까맣게 되는지의 여부, 클릭 시의 동작) 주입을 수행한다.
 */
const OverlayShell = ({
  id,
  zIndex,
  backdropTone = "dim",
  children,
  presence,
  presenceAnimationDurationMs,
  backdropHandler,
}: OverlayProps & { children: React.ReactNode }) => {
  const portalContainer = useMemo(() => {
    const container = document.createElement("div");
    container.id = id;
    return container;
  }, [id]);

  useLayoutEffect(() => {
    const overlayRootEle = document.getElementById(OVERLAY_ROOT_ID);
    if (!overlayRootEle) {
      throw new Error("Overlay root element not found");
    }

    overlayRootEle.appendChild(portalContainer);

    return () => portalContainer.remove();
  }, [id, portalContainer]);

  if (presence === "closed") return null;

  const onPointerDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target !== e.currentTarget) return;

    backdropHandler?.();
  };

  const eleToRender = (
    <S.Root
      $presenceAnimationDurationMs={presenceAnimationDurationMs}
      data-state={presence}
      $zIndex={zIndex}
      $backdropTone={backdropTone}
      onPointerDown={onPointerDown}
    >
      {children}
    </S.Root>
  );

  return createPortal(eleToRender, portalContainer);
};

export default OverlayShell;

const S = {
  Root: styled.div<{
    $zIndex?: number;
    $backdropTone: BackdropTone;
    $presenceAnimationDurationMs?: number;
  }>`
    flex: 1;

    position: fixed;
    inset: 0;

    /* TODO: theme으로 관리하기 */
    --overlay-backdrop-open-background-color: ${({ $backdropTone }) =>
      $backdropTone === "dim" ? "rgba(0, 0, 0, 0.5)" : "transparent"};

    z-index: ${({ $zIndex }) => $zIndex ?? DEFAULT_Z_INDEX};

    overflow-y: auto;
    overscroll-behavior-y: none;

    background-color: transparent;
    transition: background-color
      ${({ $presenceAnimationDurationMs }) => $presenceAnimationDurationMs}ms ease;

    &[data-state="opening"] {
      background-color: var(--overlay-backdrop-open-background-color);
      animation: ${backdropEnter}
        ${({ $presenceAnimationDurationMs }) => $presenceAnimationDurationMs}ms ease both;
    }

    &[data-state="opened"] {
      background-color: var(--overlay-backdrop-open-background-color);
    }

    &[data-state="closing"] {
      background-color: transparent;
      animation: ${backdropExit}
        ${({ $presenceAnimationDurationMs }) => $presenceAnimationDurationMs}ms ease both;
    }
  `,
};
