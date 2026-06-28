import type { ReactNode } from "react";

import OverlayShell, { type OverlayProps } from "../OverlayShell/OverlayShell";
import { S } from "./Modal.styled";

export type ModalAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type ModalProps = {
  title: string;
  description?: string;
  primaryAction: ModalAction;
  secondaryAction?: ModalAction;
  children?: ReactNode;
} & OverlayProps;

const Modal = ({
  id,
  presence,
  title,
  description,
  primaryAction,
  secondaryAction,
  zIndex,
  backdropTone = "dim",
  children,
  presenceAnimationDurationMs,
  backdropHandler,
}: ModalProps) => {
  if (presence === "closed") return null;

  return (
    <OverlayShell
      id={id}
      zIndex={zIndex}
      backdropTone={backdropTone}
      presence={presence}
      presenceAnimationDurationMs={presenceAnimationDurationMs}
      backdropHandler={backdropHandler}
    >
      <S.Dialog
        data-state={presence}
        $presenceAnimationDurationMs={presenceAnimationDurationMs}
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
