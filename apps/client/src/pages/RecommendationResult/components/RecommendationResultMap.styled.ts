import styled from "@emotion/styled";

import { tokens } from "../../../design-system/tokens.generated";
import { typography } from "../../../design-system/typography.generated";

export const S = {
  MapLayer: styled.div`
    position: absolute;
    inset: 0;
    background-color: ${tokens.color.secondary[50]};
  `,
  MarkerButton: styled.button<{ readonly $isSelected: boolean }>`
    display: inline-grid;
    place-items: center;
    min-inline-size: ${({ $isSelected }) => ($isSelected ? "28px" : "24px")};
    aspect-ratio: 1;
    border: 1px solid ${tokens.color.primary[500]};
    border-radius: 999px;
    background-color: ${({ $isSelected }) =>
      $isSelected ? tokens.color.primary[500] : tokens.color.neutral[0]};
    color: ${({ $isSelected }) =>
      $isSelected ? tokens.color.neutral[0] : tokens.color.primary[500]};
    box-shadow: ${({ $isSelected }) =>
      $isSelected ? "0 8px 18px rgba(168, 94, 69, 0.24)" : "0 4px 10px rgba(20, 20, 19, 0.08)"};
    ${typography.utility.caption}
  `,
};
