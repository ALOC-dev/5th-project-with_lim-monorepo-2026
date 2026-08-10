import styled from "@emotion/styled";
import { useNavigate } from "react-router-dom";

import Header from "../../components/Header/Header";
import { Icon } from "../../components/Icon";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";

type ActivityLink = {
  readonly description: string;
  readonly icon: "heart-outline" | "map-pin";
  readonly label: string;
  readonly to: string;
};

const activityLinks: readonly ActivityLink[] = [
  {
    label: "장소 추천 기록",
    description: "이전에 추천받은 장소를 확인해요.",
    icon: "map-pin",
    to: "/place/recommendation/history",
  },
  {
    label: "찜한 장소",
    description: "마음에 든 장소를 다시 살펴봐요.",
    icon: "heart-outline",
    to: "/place/favorite",
  },
  {
    label: "코스 추천 기록",
    description: "추천받은 코스를 다시 확인해요.",
    icon: "map-pin",
    to: "/course/recommendation/history",
  },
  {
    label: "찜한 코스",
    description: "저장해 둔 코스를 모아봐요.",
    icon: "heart-outline",
    to: "/course/favorite",
  },
];

export const ActivityHubPage = () => {
  const navigate = useNavigate();

  return (
    <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
      <Header title="내 활동" />
      <S.Content>
        <S.Intro>
          <h2>오늘은 어디로 떠나볼까요?</h2>
          <p>장소 또는 코스를 추천받고, 마음에 든 기록을 모아보세요.</p>
        </S.Intro>

        <S.RecommendationGrid aria-label="추천 시작">
          <S.RecommendationCard
            aria-label="장소 추천"
            onClick={() => void navigate("/place/recommendation/form")}
            type="button"
          >
            <S.CardEyebrow>PLACE</S.CardEyebrow>
            <strong>장소 추천</strong>
            <span>지금 필요한 장소를 추천받아요.</span>
            <Icon name="chevron-right" size={20} />
          </S.RecommendationCard>
          <S.RecommendationCard
            aria-label="코스 추천"
            onClick={() => void navigate("/course/recommendation/form")}
            type="button"
          >
            <S.CardEyebrow>COURSE</S.CardEyebrow>
            <strong>코스 추천</strong>
            <span>선택한 장소를 자연스럽게 이어드려요.</span>
            <Icon name="chevron-right" size={20} />
          </S.RecommendationCard>
        </S.RecommendationGrid>

        <S.Section>
          <h2>내 활동</h2>
          <S.ActivityList>
            {activityLinks.map((item) => (
              <S.ActivityButton
                aria-label={item.label}
                key={item.to}
                onClick={() => void navigate(item.to)}
                type="button"
              >
                <S.ActivityIcon>
                  <Icon name={item.icon} size={20} />
                </S.ActivityIcon>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <Icon name="chevron-right" size={20} />
              </S.ActivityButton>
            ))}
          </S.ActivityList>
        </S.Section>
      </S.Content>
    </PageRoot>
  );
};

const S = {
  Content: styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 32px;
    padding: 24px;
  `,
  Intro: styled.section`
    display: flex;
    flex-direction: column;
    gap: 8px;

    h2,
    p {
      margin: 0;
    }

    h2 {
      color: ${tokens.color.neutral[900]};
      ${tokens.typography.title.md};
    }

    p {
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.body.sm};
    }
  `,
  RecommendationGrid: styled.section`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  `,
  RecommendationCard: styled.button`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 8px;
    min-height: 152px;
    padding: 18px 16px;
    border: 1px solid ${tokens.color.primary[300]};
    border-radius: 16px;
    background: ${tokens.color.primary[50]};
    color: ${tokens.color.neutral[900]};
    text-align: left;

    strong {
      grid-column: 1;
      ${tokens.typography.title.xs};
    }

    span {
      grid-column: 1;
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.body.xs};
    }

    svg {
      grid-column: 2;
      grid-row: 2 / span 2;
      align-self: center;
      color: ${tokens.color.primary[700]};
    }

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
    }
  `,
  CardEyebrow: styled.span`
    grid-column: 1 / -1;
    color: ${tokens.color.primary[700]}!important;
    ${tokens.typography.body.xs};
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
  `,
  Section: styled.section`
    display: flex;
    flex-direction: column;
    gap: 12px;

    h2 {
      margin: 0;
      color: ${tokens.color.neutral[900]};
      ${tokens.typography.title.xs};
    }
  `,
  ActivityList: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  ActivityButton: styled.button`
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background: ${tokens.color.neutral[0]};
    color: ${tokens.color.neutral[900]};
    text-align: left;

    span {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 2px;
    }

    strong {
      ${tokens.typography.body.sm};
      font-weight: 700;
    }

    small {
      overflow: hidden;
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.body.xs};
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
    }
  `,
  ActivityIcon: styled.span`
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border-radius: 12px;
    background: ${tokens.color.primary[100]};
    color: ${tokens.color.primary[700]};
  `,
};
