import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { useState } from "react";
import { toast } from "sonner";

import { toApiClientErrorMessage } from "../../apis/errors";
import { Icon } from "../../components/Icon";
import Modal from "../../components/Modal/Modal";
import { useAuth } from "../../contexts/Auth.context";
import { tokens } from "../../design-system/tokens.generated";
import { useAppNavigate } from "../../routes/useAppNavigate";

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
  const navigate = useAppNavigate();
  const { logout } = useAuth();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const closeLogoutModal = () => {
    if (isLoggingOut) return;
    setIsLogoutModalOpen(false);
  };

  const confirmLogout = async (): Promise<void> => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      await logout();
      setIsLogoutModalOpen(false);
      toast.success("로그아웃되었습니다.");
    } catch (error) {
      setIsLoggingOut(false);
      toast.error(`로그아웃에 실패했습니다. (${toApiClientErrorMessage(error)})`);
    }
  };

  return (
    <>
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
              <small>준비 중</small>
            </S.StaticMenuItem>
            <S.MenuButton
              aria-label="로그아웃"
              onClick={() => setIsLogoutModalOpen(true)}
              type="button"
            >
              <Icon name="logout" size={20} />
              <span>로그아웃</span>
              <Icon name="chevron-right" size={16} />
            </S.MenuButton>
          </S.MenuList>
        </S.Section>
      </S.Content>

      <Modal
        id="logout-confirm-modal"
        isOpen={isLogoutModalOpen}
        close={closeLogoutModal}
        title="로그아웃할까요?"
        description="로그아웃하면 다시 로그인해야 해요."
        primaryAction={{
          label: "로그아웃",
          onClick: () => {
            void confirmLogout();
          },
          disabled: isLoggingOut,
        }}
        secondaryAction={{
          label: "취소",
          onClick: closeLogoutModal,
          disabled: isLoggingOut,
        }}
      />
    </>
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
    color: ${tokens.color.neutral[700]};
    cursor: default;

    small {
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.utility.caption};
    }
  `,
};
