import type { ReactNode } from "react";

import courseFavoriteIcon from "../../assets/activity-icons/course-favorite.svg";
import courseHistoryIcon from "../../assets/activity-icons/course-history.svg";
import courseMapIcon from "../../assets/activity-icons/course-map.svg";
import placeFavoriteIcon from "../../assets/activity-icons/place-favorite.svg";
import placePinIcon from "../../assets/activity-icons/place-pin.svg";
import placeRecommendationHistoryIcon from "../../assets/activity-icons/place-recommendation-history.svg";
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
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    >
      <path d="M20 10.5c0 4.8-8 10.5-8 10.5s-8-5.7-8-10.5a8 8 0 0 1 16 0" />
      <circle cx={12} cy={10.5} r={2.5} />
    </g>
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
  "chevron-left": () => (
    <path
      d="m15 18-6-6 6-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.4}
    />
  ),
  "chevron-right": () => (
    <path
      d="m9 6 6 6-6 6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.4}
    />
  ),
  home: () => (
    <path
      d="M4 10.9 12 4l8 6.9V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    />
  ),
  person: () => (
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    >
      <circle cx={12} cy={8} r={3.5} />
      <path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6" />
    </g>
  ),
  history: () => (
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    >
      <path d="M4 7v4h4" />
      <path d="M5.2 11A7 7 0 1 0 7 6.2" />
      <path d="M12 8v4l2.7 1.6" />
    </g>
  ),
  map: () => (
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    >
      <path d="m3.5 6 5-2 7 2 5-2v14l-5 2-7-2-5 2z" />
      <path d="M8.5 4v14M15.5 6v14" />
    </g>
  ),
  "account-settings": () => (
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    >
      <circle cx={9} cy={8} r={3} />
      <path d="M3.5 19c.7-3.3 2.6-5 5.5-5 1.3 0 2.5.4 3.4 1.2" />
      <circle cx={18} cy={17.5} r={2.5} />
      <path d="M18 13.5v1M18 20.5v1M14 17.5h1M21 17.5h-1M15.2 14.7l.7.7M20.1 19.6l.7.7M20.8 14.7l-.7.7M15.9 19.6l-.7.7" />
    </g>
  ),
  logout: () => (
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    >
      <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" />
      <path d="M13 8l4 4-4 4M7 12h10" />
    </g>
  ),
  edit: () => (
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </g>
  ),
  "heart-outline": () => (
    <path
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
    />
  ),
  "heart-filled": () => (
    <path
      fill="currentColor"
      d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
    />
  ),
  "activity-place-history": () => (
    <>
      <image height="22" href={placeRecommendationHistoryIcon} width="22" x="0" y="5" />
      <image height="12.651" href={placePinIcon} width="10.419" x="13" y="1" />
    </>
  ),
  "activity-place-favorite": () => (
    <>
      <image height="16.821" href={placeFavoriteIcon} width="18.333" x="1.833" y="7.75" />
      <image height="12.651" href={placePinIcon} width="10.419" x="13" y="1" />
    </>
  ),
  "activity-course-history": () => (
    <>
      <image height="22" href={courseHistoryIcon} width="22" x="0" y="5" />
      <image height="12.875" href={courseMapIcon} width="12" x="13" y="2" />
    </>
  ),
  "activity-course-favorite": () => (
    <>
      <image height="16.821" href={courseFavoriteIcon} width="18.333" x="1.833" y="7.75" />
      <image height="12.875" href={courseMapIcon} width="12" x="13" y="2" />
    </>
  ),
} satisfies Record<IconName, IconRenderer>;

const iconViewBoxes: Partial<Record<IconName, string>> = {
  "activity-place-history": "0 0 28 28",
  "activity-place-favorite": "0 0 28 28",
  "activity-course-history": "0 0 28 28",
  "activity-course-favorite": "0 0 28 28",
};

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
      viewBox={iconViewBoxes[name] ?? "0 0 24 24"}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...svgProps}
    >
      {renderIcon()}
    </svg>
  );
};
