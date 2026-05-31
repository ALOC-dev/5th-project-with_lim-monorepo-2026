import 'rc-slider/assets/index.css';

import styled from '@emotion/styled';
import Slider from 'rc-slider';

import { type theme as themeType } from "../design-system/theme.generated";

const SliderWrapper = styled.div`
  width: 100%;
  padding: 10px 0;

  .rc-slider-rail {
    background-color: ${({ theme }) => (theme as typeof themeType).tokens.color.neutral["200"]};
    height: 4px;
    border-radius: 2px;
  }

  .rc-slider-track {
    background-color: ${({ theme }) => (theme as typeof themeType).tokens.color.primary["500"]};
    height: 4px;
    border-radius: 2px;
  }

  .rc-slider-handle {
    background-color: ${({ theme }) => (theme as typeof themeType).tokens.color.primary["500"]};
    border: none;
    width: 18px;
    height: 18px;
    margin-top: -8px;
    opacity: 1;
    
    &:hover, &:active, &:focus {
      border: none;
      box-shadow: 0 0 0 5px rgba(200, 100, 80, 0.2);
    }
  }
`;

export const RangeSlider = (props: any) => (
  <SliderWrapper>
    <Slider range {...props} allowCross={false} />
  </SliderWrapper>
);