import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import EmployeesShiftsRedirectPage from "./page";
import { redirect } from "next/navigation";

describe("EmployeesShiftsRedirectPage", () => {
  it("keeps the legacy bookmark on the canonical Active Shifts surface", () => {
    EmployeesShiftsRedirectPage();
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/active-shifts");
  });
});
