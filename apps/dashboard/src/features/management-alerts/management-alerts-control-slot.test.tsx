import { createElement, isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { SelectedDashboardScope } from "../../components/scope";

vi.mock("./management-alerts-control", () => ({
  ManagementAlertsControl: function MockManagementAlertsControl() {
    return null;
  },
}));

import { ManagementAlertsControl } from "./management-alerts-control";
import { resolveManagementAlertsControl } from "./management-alerts-control-slot";

describe("resolveManagementAlertsControl", () => {
  const input = {
    api: {} as unknown as DashboardApiClient,
    authorized: true,
    controlKey: "management-alerts-slot-7",
    selectionRevision: 12,
    selectedScope: {} as unknown as SelectedDashboardScope,
  };

  it("returns the original control element with its key and authority props when no override is supplied", () => {
    const resolved = resolveManagementAlertsControl(input);

    expect(isValidElement(resolved)).toBe(true);
    if (!isValidElement(resolved)) throw new Error("Expected a ManagementAlertsControl element");

    const element = resolved as ReactElement<{
      api: DashboardApiClient;
      authorized: boolean;
      selectionRevision: number;
      selectedScope: SelectedDashboardScope;
    }>;
    expect(element.type).toBe(ManagementAlertsControl);
    expect(element.key).toBe(input.controlKey);
    expect(element.props.api).toBe(input.api);
    expect(element.props.authorized).toBe(input.authorized);
    expect(element.props.selectionRevision).toBe(input.selectionRevision);
    expect(element.props.selectedScope).toBe(input.selectedScope);
  });

  it("returns a supplied ReactNode override unchanged", () => {
    const override = createElement("span", { "data-testid": "alerts-override" }, "Override");

    const resolved = resolveManagementAlertsControl({ ...input, override });

    expect(resolved).toBe(override);
  });
});
