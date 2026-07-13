import styled from "@emotion/styled";
import { Link } from "react-router-dom";

import { tokens } from "../../design-system/tokens.generated";
// import { typography } from "../../design-system/typography.generated";

export const S = {
  Container: styled.main`
    display: flex;
    flex-direction: column;
    width: 100%;
    margin: 0 auto;
    background-color: ${tokens.color.neutral["50"]};
    box-sizing: border-box;
    position: relative;
    min-height: 100vh;
  `,

  Header: styled.header`
    display: flex;
    width: 100%;
    padding: 18px 24px 6px 24px;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    background: ${tokens.color.neutral["50"]};
    box-sizing: border-box;
  `,

  StatusBarMock: styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    font-size: 14px;
    font-weight: 600;
    padding-bottom: 4px;
    color: ${tokens.color.neutral["900"]};
  `,

  Title: styled.h1`
    font-size: 16px;
    font-weight: 600;
    line-height: 22px;
    color: ${tokens.color.neutral["900"]};
    margin: 0;
  `,
  Form: styled.form`
    display: flex;
    padding: 32px 36px 28px 36px;
    flex-direction: column;
    justify-content: center;
    gap: 16px;
    flex: 1 0 0;
    align-self: stretch;
    /* background: ${tokens.color.neutral["0"]}; */
  `,

  InputGroup: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  `,
  Label: styled.label`
    font-style: normal;
    line-height: 18px;
    font-size: 13px;
    font-weight: 500;
    color: ${tokens.color.neutral["900"]};
  `,

  Input: styled.input`
    display: flex;
    height: 56px;
    padding: 0 16px;
    align-items: center;
    align-self: stretch;
    border-radius: 12px;
    border: 1px solid ${tokens.color.neutral["200"]};
    font-size: 14px;
    background-color: ${tokens.color.neutral["0"]};
    outline: none;
    transition: border-color 0.2s ease;

    &:focus {
      border-color: ${tokens.color.primary["500"]};
    }
  `,
  SubmitButton: styled.button`
    display: flex;
    height: 56px;
    padding: 0 18px;
    justify-content: center;
    align-items: center;
    align-self: stretch;

    border-radius: 12px;
    border: none;
    background-color: ${tokens.color.primary["500"]};
    color: ${tokens.color.neutral["0"]};
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  `,

  AssistSection: styled.div`
    display: flex;
    height: 44px;
    padding: 0 18px;
    justify-content: center;
    align-items: center;
    align-self: stretch;
    margin-top: 12px;
  `,
  StyledLink: styled(Link)`
    color: ${tokens.color.neutral["900"]};
    text-align: center;
    font-size: 14px;
    font-style: normal;
    font-weight: 700;
    line-height: 20px;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  `,
  Footer: styled.footer`
    display: flex;
    height: 75px;
    padding: 12px 0;
    justify-content: center;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
    align-self: stretch;
    /* background: ${tokens.color.neutral["0"]}; */
  `,

  FooterText: styled.span`
    color: ${tokens.color.neutral["700"]};
    font-size: 13px;
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  `,

  SignupLink: styled(Link)`
    color: ${tokens.color.primary["500"]};
    font-size: 13px;
    font-style: normal;
    font-weight: 700;
    line-height: 20px;

    &:hover {
      text-decoration: underline;
    }
  `,
};
