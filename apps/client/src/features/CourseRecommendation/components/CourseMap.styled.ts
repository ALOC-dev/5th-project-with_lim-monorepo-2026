import styled from "@emotion/styled";

import { tokens } from "../../../design-system/tokens.generated";

export const S = {
  Map: styled.div<{ $height?: string }>`
    height: ${({ $height }) => $height ?? "100%"};
    min-height: ${({ $height }) => $height ?? "220px"};
    overflow: hidden;
    background: ${tokens.color.secondary[100]};
  `,
  MapFallback: styled.div`
    display: grid;
    min-height: 220px;
    place-items: center;
    background: ${tokens.color.secondary[100]};
  `,
  Marker: styled.span`
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 2px solid white;
    border-radius: 50%;
    background: ${tokens.color.primary[500]};
    color: white;
  `,
};
