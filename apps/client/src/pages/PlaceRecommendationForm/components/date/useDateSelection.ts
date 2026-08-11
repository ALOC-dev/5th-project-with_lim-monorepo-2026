import { useContext } from "react";

import { DateSelectionContext } from "./DateSelection.context";

export const useDateSelection = () => {
  const context = useContext(DateSelectionContext);
  if (!context) {
    throw new Error("useDateSelection must be used within a DateSelectionProvider");
  }
  return context;
};
