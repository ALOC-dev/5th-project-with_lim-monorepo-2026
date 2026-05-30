'use client';

import styled from '@emotion/styled';

import { Button } from '../../components/Dropdown/button'; // 경로를 확인해주세요

const S = {
  Wrapper: styled.div`
    padding: 40px;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
  `,
};

export default function RecommendationPage() {
  return (
    <S.Wrapper>
      <Button 
        tone="primary" 
        width="fit" 
        onClick={() => alert("버튼이 정상적으로 작동합니다!")}
      >
        테스트 버튼
      </Button>
    </S.Wrapper>
  );
}