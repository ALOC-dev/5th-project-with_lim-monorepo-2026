import styled from "@emotion/styled";
import { Link } from "react-router-dom";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  Container: styled.main`
    display: flex;
    flex-direction: column;
    width: 100%;
    margin: 0 auto;
    min-height: 100vh;
    background-color: ${tokens.color.neutral["50"]};
    box-sizing: border-box;
  `,

  Header: styled.header`
    display: flex;
    width: 100%;
    padding: 18px 24px 6px 24px;
    flex-direction: column;
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
    color: ${tokens.color.neutral["900"]};
  `,

  NavBar: styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
  `,

  BackButton: styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  `,

  Title: styled.h1`
    font-size: 18px;
    font-weight: 600;
    line-height: 22px;
    color: ${tokens.color.neutral["900"]};
    margin: 0;
  `,

  Form: styled.form`
    display: flex;
    flex-direction: column;
    padding: 24px 28px;
    gap: 16px;
    flex: 1;
    background: ${tokens.color.neutral["50"]};
    box-sizing: border-box;
  `,

  InputGroup: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  `,

  Label: styled.label`
    font-size: 14px;
    font-weight: 500;
    color: ${tokens.color.neutral["900"]};
  `,

  Input: styled.input`
    height: 56px;
    padding: 0 16px;
    border-radius: 12px;
    border: 1.5px solid ${tokens.color.neutral["200"]};
    background-color: ${tokens.color.neutral["0"]};
    font-size: 16px;
    font-weight: 400;
    line-height: 24px;
    outline: none;
    color: ${tokens.color.neutral["900"]};
    transition: border-color 0.2s ease;

    &:focus {
      border-color: ${tokens.color.primary["500"]};
    }

    &::placeholder {
      color: #999999;
    }
  `,

  HelperText: styled.span`
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    color: ${tokens.color.neutral["700"]};
  `,

  SubmitButton: styled.button<{ disabled?: boolean }>`
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 56px;
    border-radius: 12px;
    border: none;
    background-color: ${({ disabled }) =>
      disabled ? tokens.color.neutral["200"] : tokens.color.primary["500"]};
    color: ${({ disabled }) =>
      disabled ? tokens.color.neutral["700"] : tokens.color.neutral["0"]};
    font-size: 14px;
    font-weight: 700;
    cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
    margin-top: 16px;
  `,

  Footer: styled.div`
    display: flex;
    height: 44px;
    justify-content: center;
    align-items: center;
    gap: 4px;
    padding-bottom: 32px;
  `,

  FooterText: styled.span`
    font-size: 14px;
    font-weight: 400;
    line-height: 22px;
    color: ${tokens.color.neutral["700"]};
  `,

  LoginLink: styled(Link)`
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    padding: 0 8px;
    color: ${tokens.color.primary["500"]};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  `,

  IntroSection: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  `,

  Heading: styled.h2`
    font-size: 28px;
    font-weight: 700;
    line-height: 38px;
    color: ${tokens.color.neutral["900"]};
    margin: 0;
  `,

  Description: styled.p`
    font-size: 14px;
    font-weight: 400;
    line-height: 22px;
    color: ${tokens.color.neutral["700"]};
    margin: 0;
  `,

  InfoBox: styled.div`
    display: flex;
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
    padding: 16px 18px;
    border-radius: 12px;
    border: 1px solid ${tokens.color.neutral["200"]};
    background-color: ${tokens.color.neutral["0"]};
  `,

  InfoTitle: styled.strong`
    font-size: 14px;
    font-weight: 500;
    color: ${tokens.color.neutral["900"]};
  `,

  InfoText: styled.span`
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    color: ${tokens.color.neutral["700"]};
  `,

  TitleSection: styled.div`
    margin-bottom: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,

  Badge: styled.span`
    color: ${tokens.color.primary["500"]};
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
  `,
};
