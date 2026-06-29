import type { ReactNode } from "react";

import OverlayShell from "../OverlayShell/OverlayShell";
import { useOverlayPresence } from "../OverlayShell/useOverlayPresence";
import { S } from "./Modal.styled";

export type ModalAction = {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
};

type ModalProps = {
  readonly id: string;
  readonly isOpen: boolean;
  readonly close: () => void;
  readonly title: string;
  readonly description?: string;
  readonly primaryAction: ModalAction;
  readonly secondaryAction?: ModalAction;
  readonly children?: ReactNode;
};

const MODAL_ANIMATION_DURATION_MS = 200;

const Modal = ({
  id,
  isOpen,
  title,
  description,
  primaryAction,
  secondaryAction,
  children,
  close,
}: ModalProps) => {
  const presence = useOverlayPresence({
    isOpen,
    animationDurationMs: MODAL_ANIMATION_DURATION_MS,
  });

  return (
    <OverlayShell
      id={id}
      close={close}
      animationDurationMs={MODAL_ANIMATION_DURATION_MS}
      presence={presence}
    >
      <S.Dialog
        data-state={presence}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
      >
        <S.Texts>
          <S.Title id={`${id}-title`}>{title}</S.Title>
          {description && <S.Description id={`${id}-description`}>{description}</S.Description>}
        </S.Texts>
        {children}
        {/* TODO: 버튼 컴포넌트로 교체 */}
        <S.ActionRow $hasSecondaryAction={Boolean(secondaryAction)}>
          {secondaryAction && (
            <S.Button
              variant="secondary"
              type="button"
              disabled={secondaryAction.disabled}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </S.Button>
          )}
          <S.Button
            variant="primary"
            type="button"
            disabled={primaryAction.disabled}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </S.Button>
        </S.ActionRow>
      </S.Dialog>
    </OverlayShell>
  );
};

export default Modal;
