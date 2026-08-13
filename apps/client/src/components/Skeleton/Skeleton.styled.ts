import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

const shimmer = keyframes`
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -100% 0;
  }
`;

export const S = {
  Block: styled.span`
    display: block;
    flex: none;
    background: linear-gradient(
      90deg,
      ${tokens.color.neutral[200]} 20%,
      ${tokens.color.secondary[50]} 45%,
      ${tokens.color.neutral[200]} 70%
    );
    background-size: 200% 100%;
    animation: ${shimmer} 1.4s ease-in-out infinite;

    @media (prefers-reduced-motion: reduce) {
      background: ${tokens.color.neutral[200]};
      animation: none;
    }
  `,
};
