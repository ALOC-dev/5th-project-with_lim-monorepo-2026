import { S } from "./FeedbackState.styled";

export type FeedbackStateKind = "loading" | "empty" | "error";

type FeedbackStateAction = {
  readonly label: string;
  readonly onClick: () => void;
};

type FeedbackStateProps = {
  readonly kind: FeedbackStateKind;
  readonly title: string;
  readonly description?: string;
  readonly action?: FeedbackStateAction;
};

const FeedbackState = ({ kind, title, description, action }: FeedbackStateProps) => {
  return (
    <S.Wrapper
      aria-live={kind === "error" ? "assertive" : "polite"}
      role={kind === "error" ? "alert" : "status"}
    >
      <S.Title>{title}</S.Title>
      {description ? <S.Description>{description}</S.Description> : null}
      {action ? (
        <S.ActionButton onClick={action.onClick} type="button">
          {action.label}
        </S.ActionButton>
      ) : null}
    </S.Wrapper>
  );
};

export default FeedbackState;
