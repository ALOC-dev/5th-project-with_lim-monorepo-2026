type GetResizedSheetTopInput = {
  readonly currentTop: number;
  readonly delta: number;
  readonly minimumHeight: number;
  readonly minimumTop: number | undefined;
  readonly viewportHeight: number;
};

export const getResizedSheetTop = ({
  currentTop,
  delta,
  minimumHeight,
  minimumTop,
  viewportHeight,
}: GetResizedSheetTopInput): number => {
  if (minimumTop === undefined) {
    return Math.max(currentTop + delta, 0);
  }

  const maximumTop = Math.max(minimumTop, viewportHeight - minimumHeight);

  return Math.min(Math.max(currentTop + delta, minimumTop), maximumTop);
};
