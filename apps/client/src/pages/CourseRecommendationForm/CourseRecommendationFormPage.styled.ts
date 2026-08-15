import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  Scroll: styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 24px;
    padding: 24px;
    overflow: auto;
  `,
  Section: styled.section`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  Heading: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};
  `,
  Helper: styled.p`
    margin: -4px 0 0;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
  `,
  PickerOpen: styled.button`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    padding: 16px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background: ${tokens.color.neutral[0]};
    text-align: left;

    strong {
      color: ${tokens.color.neutral[900]};
    }

    span {
      grid-column: 1;
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.body.xs};
    }
  `,
  SelectedPlace: styled.div`
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: ${tokens.color.primary[100]};

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  FieldGrid: styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  `,
  Field: styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.label.sm};
    }
  `,
  FieldError: styled.p`
    margin: 0;
    color: ${tokens.color.warning[500]};
    ${tokens.typography.body.xs};
  `,
  Bottom: styled.div`
    padding: 16px 24px 24px;
    border-top: 1px solid ${tokens.color.neutral[200]};
  `,
  Sheet: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 14px;
  `,
  PickerResults: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    overflow: auto;
  `,
  SheetBottom: styled.div`
    flex: none;
    padding-top: 2px;
  `,
  Tabs: styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid ${tokens.color.neutral[200]};
  `,
  Tab: styled.button<{ $active: boolean }>`
    padding: 10px;
    border: 0;
    border-bottom: 2px solid
      ${({ $active }) => ($active ? tokens.color.primary[500] : "transparent")};
    background: transparent;
    color: ${({ $active }) => ($active ? tokens.color.primary[700] : tokens.color.neutral[700])};
  `,
  Count: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[700]};
  `,
  List: styled.ul`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  `,
  ListItem: styled.li`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 10px;

    span {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 3px;
    }

    small {
      overflow: hidden;
      color: ${tokens.color.neutral[700]};
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  SelectPlace: styled.button`
    padding: 8px;
    border: 0;
    border-radius: 8px;
    background: ${tokens.color.primary[100]};
    color: ${tokens.color.primary[700]};

    &:disabled {
      background: ${tokens.color.neutral[200]};
    }
  `,
};
