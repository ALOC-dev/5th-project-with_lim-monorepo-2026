import type { SVGProps } from "react";

export const iconNames = [
  "search",
  "close",
  "link",
  "edit",
  "map-pin",
  "my-location",
  "back-arrow",
  "circle-x",
  "chevron-left",
  "chevron-right",
  "home",
  "person",
  "history",
  "map",
  "account-settings",
  "logout",
  "heart-outline",
  "heart-filled",
  "activity-place-history",
  "activity-place-favorite",
  "activity-course-history",
  "activity-course-favorite",
  "password-reset",
  "withdraw",
] as const;

export type IconName = (typeof iconNames)[number];

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children" | "color" | "name"> & {
  readonly name: IconName;
  readonly size?: number | string;
  readonly color?: string;
};
