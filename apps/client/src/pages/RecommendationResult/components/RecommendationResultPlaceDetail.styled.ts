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
  PlaceName: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${typography.title.sm}
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
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  `,
  ReferenceLink: styled.a`
    padding: 10px 8px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 8px;
    color: ${tokens.color.neutral[900]};
    text-align: center;
    text-decoration: none;
    ${typography.label.xs}
  `,
};
