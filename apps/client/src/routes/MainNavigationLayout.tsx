import { Outlet } from "react-router-dom";

import BottomBar from "../components/BottomBar/BottomBar";
import PageRoot from "../components/PageRoot/PageRoot";
import { tokens } from "../design-system/tokens.generated";

/** Keeps the primary navigation mounted while switching between its tabs. */
export const MainNavigationLayout = () => {
  return (
    <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
      <Outlet />
      <BottomBar />
    </PageRoot>
  );
};
