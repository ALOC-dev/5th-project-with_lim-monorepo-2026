import type { ReactNode } from "react";

import Header from "../../../components/Header/Header";
import PageRoot from "../../../components/PageRoot/PageRoot";
import { tokens } from "../../../design-system/tokens.generated";
import { S } from "./CoursePage.styled";

type CoursePageProps = {
  readonly children: ReactNode;
  readonly title: string;
  readonly onBack?: () => void;
  readonly right?: ReactNode;
};

export const CoursePage = ({ children, title, onBack, right }: CoursePageProps) => (
  <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
    <Header onBack={onBack} right={right} title={title} />
    <S.Page>{children}</S.Page>
  </PageRoot>
);
