import styled from "@emotion/styled";

import courseRecommendationIcon from "../../assets/home/course-recommendation.svg";
import placeRecommendationIcon from "../../assets/home/place-recommendation.svg";
import { tokens } from "../../design-system/tokens.generated";
import { useAppNavigate } from "../../routes/useAppNavigate";

const HomePage = () => {
  const navigate = useAppNavigate();

  return (
    <>
      <S.Header>
        <S.HeaderRow>
          <S.PageTitle>홈</S.PageTitle>
        </S.HeaderRow>
      </S.Header>

      <S.Content>
        <S.RecommendationStack aria-label="추천 시작">
          <S.RecommendationButton
            aria-label="장소 추천 시작"
            onClick={() => void navigate("/place/recommendation/form")}
            type="button"
          >
            <S.PlaceIconFrame aria-hidden="true">
              <S.PlaceIcon alt="" src={placeRecommendationIcon} />
            </S.PlaceIconFrame>
            <S.RecommendationCopy>
              <S.RecommendationTitle>장소 추천 시작</S.RecommendationTitle>
              <S.RecommendationDescription>
                조건을 입력하고 바로 어울리는 장소를 찾아요
              </S.RecommendationDescription>
            </S.RecommendationCopy>
          </S.RecommendationButton>

          <S.RecommendationButton
            aria-label="코스 추천 시작"
            onClick={() => void navigate("/course/recommendation/form")}
            type="button"
          >
            <S.IconFrame aria-hidden="true">
              <S.Icon alt="" src={courseRecommendationIcon} />
            </S.IconFrame>
            <S.RecommendationCopy>
              <S.RecommendationTitle>코스 추천 시작</S.RecommendationTitle>
              <S.RecommendationDescription>
                여러 장소를 시간순 코스로 묶어 추천받아요
              </S.RecommendationDescription>
            </S.RecommendationCopy>
          </S.RecommendationButton>
        </S.RecommendationStack>
      </S.Content>
    </>
  );
};

export default HomePage;

const S = {
  Header: styled.header`
    display: flex;
    height: 96px;
    flex: 0 0 96px;
    flex-direction: column;
    gap: 4px;
    padding: 18px 24px 6px;
  `,
  StatusRow: styled.div`
    display: flex;
    height: 24px;
    align-items: center;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.utility.meta};
  `,
  HeaderRow: styled.div`
    display: flex;
    height: 44px;
    align-items: center;
  `,
  PageTitle: styled.h1`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.sm};
  `,
  Content: styled.div`
    display: flex;
    flex: 1;
    padding: 20px 24px;
  `,
  RecommendationStack: styled.section`
    display: flex;
    width: 100%;
    flex-direction: column;
    align-self: flex-start;
    gap: 10px;
  `,
  RecommendationButton: styled.button`
    display: flex;
    width: 100%;
    align-items: center;
    gap: 12px;
    overflow: hidden;
    padding: 14px 16px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 14px;
    background: ${tokens.color.neutral[0]};
    color: ${tokens.color.neutral[900]};
    text-align: left;

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
    }
  `,
  IconFrame: styled.span`
    display: grid;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    place-items: center;
    overflow: hidden;
  `,
  PlaceIconFrame: styled.span`
    display: grid;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    place-items: center;
    overflow: hidden;
  `,
  Icon: styled.img`
    display: block;
    width: 100%;
    height: 100%;
  `,
  PlaceIcon: styled.img`
    display: block;
    width: 21.5px;
    height: 15.5px;
  `,
  RecommendationCopy: styled.span`
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  `,
  RecommendationTitle: styled.span`
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};
  `,
  RecommendationDescription: styled.span`
    color: ${tokens.color.secondary[500]};
    ${tokens.typography.body.xs};
    white-space: nowrap;
  `,
};
