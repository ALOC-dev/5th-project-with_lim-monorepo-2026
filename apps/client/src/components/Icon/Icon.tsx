import type { ReactNode } from "react";

import type { IconName, IconProps } from "./Icon.types";

type IconRenderer = () => ReactNode;

const iconRenderers = {
  search: () => (
    <path
      fill="currentColor"
      d="m19.6 21-6.3-6.3q-.75.6-1.725.95T9.5 16Q6.775 16 4.888 14.113T3 9.5t1.888-4.613T9.5 3t4.613 1.888T16 9.5q0 1.1-.35 2.075T14.7 13.3L21 19.6zM9.5 14q1.875 0 3.188-1.312T14 9.5t-1.312-3.187T9.5 5T6.313 6.313T5 9.5t1.313 3.188T9.5 14"
    />
  ),
  close: () => (
    <path
      fill="currentColor"
      d="M12 13.4 7.1 18.3q-.275.275-.7.275t-.7-.275-.275-.7.275-.7l4.9-4.9-4.9-4.9q-.275-.275-.275-.7t.275-.7.7-.275.7.275l4.9 4.9 4.9-4.9q.275-.275.7-.275t.7.275.275.7-.275.7L13.4 12l4.9 4.9q.275.275.275.7t-.275.7-.7.275-.7-.275z"
    />
  ),
  link: () => (
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15" />
    </g>
  ),
  "map-pin": () => (
    <>
      <circle cx={12} cy={11} fill="currentColor" r={8} />
      <circle cx={12} cy={11} fill="#fff" r={3} />
    </>
  ),
  "back-arrow": () => (
    <path
      d="M19 12H5m7 7-7-7 7-7"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.4}
    />
  ),
  "circle-x": () => (
    <g fill="none" stroke="currentColor">
      <circle cx={12} cy={12} r={8.5} strokeWidth={2} />
      <path d="m9 9 6 6m0-6-6 6" strokeLinecap="round" strokeWidth={2} />
    </g>
  ),
} satisfies Record<IconName, IconRenderer>;

export const Icon = ({
  name,
  size = 24,
  color = "currentColor",
  style,
  role,
  "aria-label": ariaLabel,
  ...svgProps
}: IconProps) => {
  const renderIcon = iconRenderers[name];

  return (
    <svg
      aria-hidden={ariaLabel === undefined ? true : undefined}
      aria-label={ariaLabel}
      color={color}
      fill="none"
      focusable={false}
      height={size}
      role={ariaLabel === undefined ? role : (role ?? "img")}
      style={{ display: "block", flexShrink: 0, ...style }}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...svgProps}
    >
      {renderIcon()}
    </svg>
  );
};
