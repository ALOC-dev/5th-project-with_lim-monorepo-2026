import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { useNavigate } from "react-router-dom";

import { Icon } from "../../components/Icon";
import PageRoot from "../../components/PageRoot/PageRoot";
import { useAuth } from "../../contexts/Auth.context";
import { tokens } from "../../design-system/tokens.generated";

type ActivityLink = {
  readonly icon:
    | "activity-place-history"
    | "activity-place-favorite"
    | "activity-course-history"
    | "activity-course-favorite";
  readonly label: string;
  readonly to: string;
};

const activityLinks: readonly ActivityLink[] = [
  {
    label: "장소 추천 기록",
    icon: "activity-place-history",
    to: "/place/recommendation/history",
  },
  {
    label: "저장한 장소",
    icon: "activity-place-favorite",
    to: "/place/favorite",
  },
  {
    label: "코스 추천 기록",
    icon: "activity-course-history",
    to: "/course/recommendation/history",
  },
  {
    label: "저장한 코스",
    icon: "activity-course-favorite",
    to: "/course/favorite",
  },
];

export const ActivityHubPage = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
      <S.Content>
        <S.PageTitle>마이</S.PageTitle>

        <S.Section aria-labelledby="activity-heading">
          <S.SectionTitle id="activity-heading">내 활동</S.SectionTitle>
          <S.MenuList>
            {activityLinks.map((item) => (
              <S.MenuButton
                aria-label={item.label}
                key={item.to}
                onClick={() => void navigate(item.to)}
                type="button"
              >
                <Icon name={item.icon} size={28} />
                <span>{item.label}</span>
                <Icon name="chevron-right" size={16} />
              </S.MenuButton>
            ))}
          </S.MenuList>
        </S.Section>

        <S.Section aria-labelledby="settings-heading">
          <S.SectionTitle id="settings-heading">설정</S.SectionTitle>
          <S.MenuList>
            <S.StaticMenuItem>
              <Icon name="account-settings" size={20} />
              <span>계정 관리</span>
              <Icon name="chevron-right" size={16} />
            </S.StaticMenuItem>
            <S.MenuButton aria-label="로그아웃" onClick={logout} type="button">
              <Icon name="logout" size={20} />
              <span>로그아웃</span>
              <Icon name="chevron-right" size={16} />
            </S.MenuButton>
          </S.MenuList>
        </S.Section>
      </S.Content>

      <S.BottomNavigation aria-label="주요 메뉴">
        <S.NavigationButton
          aria-label="홈"
          onClick={() => void navigate("/")}
          type="button"
        >
          <Icon name="home" size={22} />
          <span>홈</span>
        </S.NavigationButton>
        <S.NavigationButton $active aria-current="page" aria-label="마이" type="button">
          <Icon name="person" size={22} />
          <span>마이</span>
        </S.NavigationButton>
      </S.BottomNavigation>
    </PageRoot>
  );
};

const menuItemStyle = css`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  min-height: 50px;
  gap: 10px;
  width: 100%;
  padding: 12px;
  border: 1px solid ${tokens.color.neutral[200]};
  border-radius: 10px;
  background: ${tokens.color.neutral[0]};
  color: ${tokens.color.neutral[900]};
  text-align: left;

  span {
    min-width: 0;
    ${tokens.typography.body.sm};
    font-weight: 500;
  }

  > svg:last-child {
    color: ${tokens.color.secondary[500]};
  }
`;

const S = {
  Content: styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 52px 24px 24px;
  `,
  PageTitle: styled.h1`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.sm};
  `,
  Section: styled.section`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  SectionTitle: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.utility.cta};
  `,
  MenuList: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  MenuButton: styled.button`
    ${menuItemStyle}

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
    }
  `,
  StaticMenuItem: styled.div`
    ${menuItemStyle}
  `,
  BottomNavigation: styled.nav`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: auto;
    padding: 8px 20px calc(8px + env(safe-area-inset-bottom));
    border-top: 1px solid ${tokens.color.neutral[200]};
    background: ${tokens.color.neutral[0]};
  `,
  NavigationButton: styled.button<{ $active?: boolean }>`
    display: flex;
    height: 52px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-radius: 14px;
    color: ${({ $active = false }) =>
      $active ? tokens.color.primary[500] : tokens.color.secondary[500]};
    background: ${({ $active = false }) => ($active ? tokens.color.primary[50] : "transparent")};

    span {
      ${tokens.typography.label.xs};
    }

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
    }
  `,
};
