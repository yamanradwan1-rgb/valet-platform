import type { OperatingHoursValue } from "@valet/contracts";

export const companyWeek: OperatingHoursValue = {
  days: [
    { weekday: "MONDAY", status: "OPEN", opensAt: "09:15", closesAt: "17:45" },
    { weekday: "TUESDAY", status: "OPEN", opensAt: "09:15", closesAt: "17:45" },
    { weekday: "WEDNESDAY", status: "OPEN", opensAt: "09:15", closesAt: "17:45" },
    { weekday: "THURSDAY", status: "OPEN", opensAt: "09:15", closesAt: "17:45" },
    { weekday: "FRIDAY", status: "OPEN", opensAt: "09:15", closesAt: "17:45" },
    { weekday: "SATURDAY", status: "OPEN", opensAt: "10:00", closesAt: "14:00" },
    { weekday: "SUNDAY", status: "CLOSED" },
  ],
};

export const locationWeek: OperatingHoursValue = {
  days: [
    { weekday: "MONDAY", status: "OPEN", opensAt: "07:30", closesAt: "16:30" },
    { weekday: "TUESDAY", status: "OPEN", opensAt: "07:30", closesAt: "16:30" },
    { weekday: "WEDNESDAY", status: "OPEN", opensAt: "07:30", closesAt: "16:30" },
    { weekday: "THURSDAY", status: "OPEN", opensAt: "07:30", closesAt: "16:30" },
    { weekday: "FRIDAY", status: "CLOSED" },
    { weekday: "SATURDAY", status: "OPEN", opensAt: "08:00", closesAt: "12:00" },
    { weekday: "SUNDAY", status: "CLOSED" },
  ],
};
