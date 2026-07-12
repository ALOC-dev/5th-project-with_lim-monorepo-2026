import "rc-slider/assets/index.css";

import styled from "@emotion/styled";
import Slider, { type SliderProps } from "rc-slider";

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

    &:hover,
    &:active,
    &:focus {
      border: none;
      box-shadow: 0 0 0 5px rgba(200, 100, 80, 0.2);
    }
  }
`;

type RangeSliderProps = {
  min: number;
  max: number;
  step?: number;
  value: SliderProps["value"];
  onChange: SliderProps["onChange"];
};

export const RangeSlider = ({ min, max, step, value, onChange }: RangeSliderProps) => (
  <SliderWrapper>
    <Slider
      range
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      allowCross={false}
    />
  </SliderWrapper>
);
