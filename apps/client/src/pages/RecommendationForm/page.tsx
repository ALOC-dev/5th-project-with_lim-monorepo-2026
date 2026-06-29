import { useState } from "react";

import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import LocationSelectionBottomSheet, {
  type Location,
} from "./components/LocationSelection/LocationSelectionBottomSheet";

// TODO: 추후 현재 위치 정보를 가져오도록 개선
const getInitialLocation = (): Location => {
  return {
    lat: 37.5665,
    lng: 126.978,
    roadNameAddress: "서울특별시 중구 세종대로 110",
  };
};

const RecommendationFormPage = () => {
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(true);
  const closeBottomSheet = () => {
    setIsBottomSheetOpen(false);
  };
  const [location, setLocation] = useState(getInitialLocation);

  return (
    <PageRoot backgroundColor={tokens.color.primary[500]}>
      <LocationSelectionBottomSheet
        close={closeBottomSheet}
        id="location-selector-bottomsheet"
        isOpen={isBottomSheetOpen}
        setLocation={setLocation}
        location={location}
      />
    </PageRoot>
  );
};

export default RecommendationFormPage;
