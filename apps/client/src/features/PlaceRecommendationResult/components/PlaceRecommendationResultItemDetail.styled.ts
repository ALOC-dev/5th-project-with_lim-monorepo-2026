import styled from "@emotion/styled";

import { tokens } from "../../../design-system/tokens.generated";
import { typography } from "../../../design-system/typography.generated";

export const S = {
  Root: styled.div`
    flex: 1;
    background-color: ${tokens.color.neutral[50]};
  `,
  Body: styled.div`
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 24px 28px calc(28px + env(safe-area-inset-bottom));
  `,
  TopCard: styled.section`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 8px;
    background-color: ${tokens.color.neutral[0]};
  `,
  TopCardHeader: styled.div`
    display: flex;
    min-width: 0;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  `,
  PlaceName: styled.h2`
    margin: 0;
    min-width: 0;
    color: ${tokens.color.neutral[900]};
    ${typography.title.sm}
  `,
  BookmarkButton: styled.button<{ readonly $isSaved: boolean }>`
    display: inline-grid;
    width: 36px;
    height: 36px;
    flex: none;
    place-items: center;
    padding: 0;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 50%;
    background-color: ${tokens.color.neutral[0]};
    color: ${({ $isSaved }) => ($isSaved ? tokens.color.primary[500] : tokens.color.primary[700])};

    &:disabled {
      cursor: wait;
      opacity: 0.6;
    }
  `,
  BookmarkFeedback: styled.p`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid ${tokens.color.warning[500]};
    border-radius: 8px;
    background-color: ${tokens.color.neutral[0]};
    color: ${tokens.color.warning[500]};
    ${typography.body.xs}
  `,
  BookmarkRetry: styled.button`
    flex: none;
    padding: 0;
    border: 0;
    background: transparent;
    color: ${tokens.color.primary[700]};
    text-decoration: underline;
    ${typography.label.xs}
  `,
  Meta: styled.p`
    margin: 0;
    color: ${tokens.color.secondary[700]};
    ${typography.label.xs}
  `,
  TagRow: styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 6px;
  `,
  Tag: styled.span`
    padding: 6px 10px;
    border-radius: 999px;
    background-color: ${tokens.color.secondary[100]};
    color: ${tokens.color.neutral[900]};
    ${typography.label.xs}
  `,
  InfoCard: styled.section`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 8px;
    background-color: ${tokens.color.neutral[0]};
  `,
  InfoLabel: styled.h3`
    margin: 0;
    color: ${tokens.color.primary[700]};
    ${typography.label.sm}
  `,
  InfoText: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[700]};
    ${typography.body.xs}
  `,
  ReferenceLinks: styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
  `,
  ReferenceLink: styled.a`
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    align-items: flex-start;
    gap: 8px;
    color: inherit;
    text-decoration: none;
  `,
  ReferenceContent: styled.span`
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  `,
  ReferenceFavicon: styled.img`
    width: 16px;
    height: 16px;
    flex: none;
    border-radius: 3px;
  `,
  ReferenceTitle: styled.span`
    min-width: 0;
    overflow: hidden;
    color: ${tokens.color.primary[700]};
    text-overflow: ellipsis;
    text-decoration: underline;
    text-underline-offset: 3px;
    white-space: nowrap;
    ${typography.label.xs}
  `,
  ReferenceDomain: styled.span`
    min-width: 0;
    overflow: hidden;
    color: ${tokens.color.secondary[500]};
    text-overflow: ellipsis;
    white-space: nowrap;
    ${typography.utility.caption}
  `,
};
