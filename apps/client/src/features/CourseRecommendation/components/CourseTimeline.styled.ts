import styled from "@emotion/styled";

import { tokens } from "../../../design-system/tokens.generated";

const timeColumnWidth = 52;
const trackColumnWidth = 18;
const timelineColumnGap = 10;
const timelineAxisOffset = timeColumnWidth + timelineColumnGap + trackColumnWidth / 2;

export const S = {
  TimelineCard: styled.section`
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 20px 16px 16px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 16px;
    background: ${tokens.color.neutral[0]};
  `,
  Heading: styled.h3`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};
  `,
  List: styled.ol`
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  Item: styled.li<{ $last: boolean }>`
    position: relative;
    display: grid;
    grid-template-columns: ${timeColumnWidth}px ${trackColumnWidth}px minmax(0, 1fr);
    column-gap: ${timelineColumnGap}px;
    padding-bottom: ${({ $last }) => ($last ? "0" : "28px")};

    &::after {
      position: absolute;
      z-index: 0;
      top: 11px;
      bottom: -11px;
      left: ${timelineAxisOffset}px;
      display: ${({ $last }) => ($last ? "none" : "block")};
      width: 2px;
      transform: translateX(-50%);
      background: ${tokens.color.primary[500]};
      content: "";
    }
  `,
  Time: styled.time`
    padding-top: 1px;
    color: ${tokens.color.primary[700]};
    text-align: right;
    white-space: nowrap;
    ${tokens.typography.label.lg};
  `,
  Track: styled.span`
    position: relative;
    display: flex;
    align-self: stretch;
    justify-content: center;
  `,
  Marker: styled.span`
    position: relative;
    z-index: 1;
    width: 16px;
    height: 16px;
    margin-top: 3px;
    border-radius: 50%;
    background: ${tokens.color.primary[500]};
  `,
  Place: styled.div`
    display: flex;
    min-width: 0;
    min-height: 44px;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  `,
  PlaceLink: styled.a`
    display: flex;
    min-width: 0;
    min-height: 44px;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    color: inherit;
    text-decoration: none;

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 3px;
      border-radius: 8px;
    }
  `,
  PlaceText: styled.span`
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  `,
  PlaceName: styled.strong`
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.body.lg};
  `,
  PlaceMeta: styled.span`
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.label.md};
  `,
  Leg: styled.span`
    z-index: 1;
    grid-column: 3;
    margin-top: 8px;
    color: ${tokens.color.primary[700]};
    ${tokens.typography.label.sm};
  `,
  FooterSummary: styled.p`
    margin-top: 28px;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.md};
  `,
};
