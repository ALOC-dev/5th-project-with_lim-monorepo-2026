import styled from '@emotion/styled';
import { useLocation, useNavigate } from 'react-router-dom';

import { tokens } from '../../design-system/tokens.generated';
import { typography } from '../../design-system/typography.generated';
import type { UserOutput, PlaceRecommendationItem } from '@monorepo/recommendation-engine/v1/contracts';

const RecommendationResultPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const result = location.state?.result as UserOutput | undefined;

  if (!result) {
    return (
      <S.Page>
        <S.Empty>
          <S.EmptyText>결과 데이터가 없습니다.</S.EmptyText>
          <S.BackButton onClick={() => navigate('/place/recommendation/form')}>
            처음으로
          </S.BackButton>
        </S.Empty>
      </S.Page>
    );
  }

  return (
    <S.Page>
      <S.Header>
        <S.Title>추천 결과</S.Title>
        <S.Subtitle>총 {result.recommendations.length}개의 장소를 찾았어요</S.Subtitle>
      </S.Header>
      <S.List>
        {result.recommendations.map((item, index) => (
          <RecommendationCard key={item.id} item={item} rank={index + 1} />
        ))}
      </S.List>
      <S.Footer>
        <S.BackButton onClick={() => navigate('/place/recommendation/form')}>
          다시 추천받기
        </S.BackButton>
      </S.Footer>
    </S.Page>
  );
};

const RecommendationCard = ({
  item,
  rank,
}: {
  item: PlaceRecommendationItem;
  rank: number;
}) => (
  <S.Card>
    <S.CardHeader>
      <S.Rank>{rank}</S.Rank>
      <S.CardTitleGroup>
        <S.CardName>{item.name}</S.CardName>
        <S.CardCategory>
          {item.mainCategory} · {item.subCategory}
        </S.CardCategory>
      </S.CardTitleGroup>
      <S.Score>{item.score}점</S.Score>
    </S.CardHeader>

    <S.Summary>{item.contentSummary}</S.Summary>

    <S.Tags>
      {item.tags.map((tag) => (
        <S.Tag key={tag}>{tag}</S.Tag>
      ))}
    </S.Tags>

    <S.Reasons>
      {item.reasons.map((reason, i) => (
        <S.Reason key={i}>• {reason}</S.Reason>
      ))}
    </S.Reasons>

    <S.CardFooter>
      <S.Budget>
        인당 {item.priceRangePerPerson[0].toLocaleString()}~
        {item.priceRangePerPerson[1].toLocaleString()}원
      </S.Budget>
      <S.Links>
        <S.Link href={item.referenceUrls.kakaoMap} target="_blank" rel="noopener noreferrer">
          카카오맵
        </S.Link>
        <S.Link href={item.referenceUrls.naverMap} target="_blank" rel="noopener noreferrer">
          네이버맵
        </S.Link>
      </S.Links>
    </S.CardFooter>
  </S.Card>
);

export default RecommendationResultPage;

const S = {
  Page: styled.main`
    min-height: 100vh;
    background: ${tokens.color.neutral[50]};
    padding: 48px 24px 64px;
    display: flex;
    flex-direction: column;
    align-items: center;
  `,
  Header: styled.div`
    width: 100%;
    max-width: 480px;
    margin-bottom: 32px;
  `,
  Title: styled.h1`
    margin: 0 0 8px;
    color: ${tokens.color.neutral[900]};
    ${typography.title.lg}
  `,
  Subtitle: styled.p`
    margin: 0;
    color: ${tokens.color.secondary[500]};
    ${typography.body.sm}
  `,
  List: styled.div`
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  `,
  Card: styled.article`
    background: ${tokens.color.neutral[0]};
    border-radius: 16px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  `,
  CardHeader: styled.div`
    display: flex;
    align-items: flex-start;
    gap: 12px;
  `,
  Rank: styled.div`
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: ${tokens.color.primary[500]};
    color: ${tokens.color.neutral[0]};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    ${typography.label.sm}
  `,
  CardTitleGroup: styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  CardName: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${typography.title.sm}
  `,
  CardCategory: styled.span`
    color: ${tokens.color.secondary[500]};
    ${typography.body.xs}
  `,
  Score: styled.div`
    color: ${tokens.color.primary[500]};
    ${typography.label.md}
    flex-shrink: 0;
  `,
  Summary: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[700]};
    ${typography.body.sm}
  `,
  Tags: styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  `,
  Tag: styled.span`
    padding: 3px 8px;
    border-radius: 100px;
    background: ${tokens.color.neutral[200]};
    color: ${tokens.color.neutral[700]};
    ${typography.body.xs}
  `,
  Reasons: styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  Reason: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[700]};
    ${typography.body.xs}
  `,
  CardFooter: styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 8px;
    border-top: 1px solid ${tokens.color.neutral[200]};
  `,
  Budget: styled.span`
    color: ${tokens.color.neutral[700]};
    ${typography.body.xs}
  `,
  Links: styled.div`
    display: flex;
    gap: 8px;
  `,
  Link: styled.a`
    color: ${tokens.color.primary[500]};
    ${typography.body.xs}
    text-decoration: none;
    &:hover { text-decoration: underline; }
  `,
  Footer: styled.div`
    width: 100%;
    max-width: 480px;
    margin-top: 32px;
  `,
  BackButton: styled.button`
    width: 100%;
    padding: 14px;
    border: none;
    border-radius: 12px;
    background: ${tokens.color.primary[500]};
    color: ${tokens.color.neutral[0]};
    cursor: pointer;
    ${typography.label.lg}
  `,
  Empty: styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding-top: 120px;
  `,
  EmptyText: styled.p`
    margin: 0;
    color: ${tokens.color.secondary[500]};
    ${typography.body.md}
  `,
};
