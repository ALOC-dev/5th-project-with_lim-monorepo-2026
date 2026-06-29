import styled from "@emotion/styled";

export const S = {
  MapFrame: styled.div`
    position: relative;
    width: 100%;
    flex: 1;
  `,
  CenterMarker: styled.div`
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 1;
    width: 8px;
    height: 8px;
    border-radius: 500%;
    background: blue;
    transform: translate(-50%, -50%);
    pointer-events: none;
  `,
};
