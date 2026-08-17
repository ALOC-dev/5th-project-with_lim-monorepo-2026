export const RESULT_LIST_SHEET_INITIAL_HEIGHT = "40dvh";
export const RESULT_LIST_SHEET_MIN_HEIGHT = "20dvh";

const RESULT_LIST_SHEET_VIEWPORT_RATIO = 0.4;
const MAP_EDGE_PADDING = 24;

type MapViewportMeasurement = {
  readonly mapBottom: number;
  readonly mapHeight: number;
  readonly viewportHeight: number;
};

const getMapBottomOcclusionHeight = ({
  mapBottom,
  mapHeight,
  viewportHeight,
}: MapViewportMeasurement): number => {
  const sheetTop = viewportHeight * (1 - RESULT_LIST_SHEET_VIEWPORT_RATIO);

  return Math.min(mapHeight, Math.max(0, mapBottom - sheetTop));
};

export const getFocusedPlacePanY = (measurement: MapViewportMeasurement): number => {
  return getMapBottomOcclusionHeight(measurement) / 2;
};

export const getFocusedPlaceCenterPoint = (
  targetPoint: { readonly x: number; readonly y: number },
  panY: number,
) => ({
  x: targetPoint.x,
  y: targetPoint.y + panY,
});

export const getRecommendationBoundsPadding = (measurement: MapViewportMeasurement) => ({
  bottom: getMapBottomOcclusionHeight(measurement) + MAP_EDGE_PADDING,
  left: MAP_EDGE_PADDING,
  right: MAP_EDGE_PADDING,
  top: MAP_EDGE_PADDING,
});
