import type { CSSProperties } from "react";

import { S } from "./Skeleton.styled";

type SkeletonProps = {
  readonly width: CSSProperties["width"];
  readonly height: CSSProperties["height"];
  readonly borderRadius?: CSSProperties["borderRadius"];
};

export const Skeleton = ({ width, height, borderRadius = 4 }: SkeletonProps) => (
  <S.Block aria-hidden="true" style={{ borderRadius, height, width }} />
);
