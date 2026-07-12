import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import type { MouseEvent, ReactNode } from "react";
import { useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";

import { type OverlayPresence, useOverlayPresence } from "./useOverlayPresence";

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

type OverlayShellProps = {
  readonly id: string;
  readonly presence: OverlayPresence;
  readonly backdropHandler: () => void;
  readonly animationDurationMs: number;
  readonly children: ReactNode;
};

/**
 * 모달, 드롭다운 등 오버레이를 위한 공통 컴포넌트.
 * Portal을 이용해 DOM 트리의 최상단에 렌더링되도록 하며, Backdrop 관련 옵션(까맣게 되는지의 여부, 클릭 시의 동작) 주입을 수행한다.
 */
const OverlayShell = ({
  id,
  presence,
  children,
  animationDurationMs,
  backdropHandler,
}: OverlayShellProps) => {
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

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target !== e.currentTarget) return;

    backdropHandler();
  };

  const eleToRender = (
    <S.Root $animationDurationMs={animationDurationMs} data-state={presence} onClick={onClick}>
      {children}
    </S.Root>
  );

  return createPortal(eleToRender, portalContainer);
};

export default OverlayShell;

const S = {
  Root: styled.div<{
    $animationDurationMs: number;
  }>`
    flex: 1;

    position: fixed;
    inset: 0;

    /* TODO: theme으로 관리하기 */
    --overlay-backdrop-open-background-color: rgba(0, 0, 0, 0.5);
    --overlay-animation-duration: ${({ $animationDurationMs }) => `${$animationDurationMs}ms`};

    z-index: ${DEFAULT_Z_INDEX};

    overflow-y: auto;
    overscroll-behavior-y: none;

    background-color: transparent;
    transition: background-color var(--overlay-animation-duration) ease;

    &[data-state="opening"] {
      background-color: var(--overlay-backdrop-open-background-color);
      animation: ${backdropEnter} var(--overlay-animation-duration) ease both;
    }

    &[data-state="opened"] {
      background-color: var(--overlay-backdrop-open-background-color);
    }

    &[data-state="closing"] {
      background-color: transparent;
      animation: ${backdropExit} var(--overlay-animation-duration) ease both;
    }
  `,
};
