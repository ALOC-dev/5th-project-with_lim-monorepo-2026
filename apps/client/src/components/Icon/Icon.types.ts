import type { SVGProps } from "react";

export const iconNames = ["search", "close", "link", "map-pin", "back-arrow", "circle-x"] as const;

export type IconName = (typeof iconNames)[number];

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children" | "color" | "name"> & {
  readonly name: IconName;
  readonly size?: number | string;
  readonly color?: string;
};
