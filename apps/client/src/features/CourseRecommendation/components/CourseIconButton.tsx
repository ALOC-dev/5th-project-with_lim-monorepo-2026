import styled from "@emotion/styled";

import { tokens } from "../../../design-system/tokens.generated";

export const CourseIconButton = styled.button<{ readonly $isBookmarked?: boolean }>`
  display: grid;
  width: 44px;
  height: 44px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: ${({ $isBookmarked = true }) =>
    $isBookmarked ? tokens.color.primary[500] : tokens.color.neutral[700]};

  &:disabled {
    cursor: wait;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: 2px solid ${tokens.color.primary[500]};
    outline-offset: 2px;
  }
`;
