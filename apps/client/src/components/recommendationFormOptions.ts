import type { DropdownOption } from "./Dropdown";

export const TIME_HOUR_OPTIONS: readonly DropdownOption[] = Array.from(
  { length: 24 },
  (_, hour) => {
    const value = String(hour).padStart(2, "0");
    return { label: `${value}시`, value };
  },
);

export const TIME_MINUTE_OPTIONS: readonly DropdownOption[] = ["00", "15", "30", "45"].map(
  (value) => ({
    label: `${value}분`,
    value,
  }),
);

export const MIDNIGHT_HOUR_OPTION: DropdownOption = { label: "24시", value: "24" };

export const NUMBER_OF_PEOPLE_OPTIONS: readonly DropdownOption[] = Array.from(
  { length: 20 },
  (_, index) => {
    const value = index + 1;
    return { label: `${value}명`, value: String(value) };
  },
);
