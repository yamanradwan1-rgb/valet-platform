import { describe, expect, it } from "vitest";
import type { TaskOverviewEntry } from "@valet/contracts";

import { arTranslations } from "../../i18n/translations/ar";
import { enTranslations } from "../../i18n/translations/en";
import {
  supportedTaskStatuses,
  taskAssigneeCellText,
  taskIdCell,
  taskStatusLabelKeyOf,
  taskTypeLabelKeyOf,
} from "./tasks-display";

const TASK_ID = "59220eb7-d188-4c7f-ab9e-a4779a6af101";
const ASSIGNEE_ID = "eb39db89-54d2-45fa-a64e-29f89688f102";

function entry(overrides?: {
  status?: TaskOverviewEntry["status"];
  taskType?: TaskOverviewEntry["taskType"];
  assignee?: string | null;
}): TaskOverviewEntry {
  return {
    createdAt: "2026-08-24T14:32:00Z",
    currentAssigneeMembershipId: overrides?.assignee ?? null,
    status: overrides?.status ?? "QUEUED",
    taskId: TASK_ID,
    taskType: overrides?.taskType ?? "PARKING",
    updatedAt: "2026-08-24T14:37:00Z",
    valetSessionId: "2dc14878-df98-4d0f-b164-bc2506a6b102",
  };
}

describe("tasks display helpers", () => {
  it("maps PARKING and RETRIEVAL types to friendly labels in EN and AR", () => {
    const parking = taskTypeLabelKeyOf(entry({ taskType: "PARKING" }));
    expect(enTranslations[parking]).toBeTruthy();
    expect(arTranslations[parking]).toBeTruthy();
    expect(enTranslations[parking]).not.toMatch(/_/u);

    const retrieval = taskTypeLabelKeyOf(entry({ taskType: "RETRIEVAL" }));
    expect(enTranslations[retrieval]).toBeTruthy();
    expect(arTranslations[retrieval]).toBeTruthy();
    expect(enTranslations[retrieval]).not.toMatch(/_/u);
    expect(retrieval).not.toBe(parking);
  });

  it("covers all six shared task statuses with labels in EN and AR", () => {
    expect(supportedTaskStatuses()).toEqual([
      "QUEUED",
      "ASSIGNED",
      "ACCEPTED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ]);
    for (const status of supportedTaskStatuses()) {
      const key = taskStatusLabelKeyOf(status);
      expect(enTranslations[key].length).toBeGreaterThan(0);
      expect(arTranslations[key].length).toBeGreaterThan(0);
      expect(enTranslations[key]).not.toMatch(/_/u);
      expect(arTranslations[key]).not.toMatch(/_/u);
    }
  });

  it("renders a nullable assignee as Unassigned", () => {
    expect(taskAssigneeCellText(entry({ assignee: null }), "Unassigned")).toBe(
      "Unassigned",
    );
  });

  it("shortens a present assignee membership id without inventing data", () => {
    expect(
      taskAssigneeCellText(entry({ assignee: ASSIGNEE_ID }), "Unassigned"),
    ).toBe("eb39db89…f102");
  });

  it("shortens task ids consistently for cells", () => {
    expect(taskIdCell(entry())).toBe("59220eb7…f101");
  });
});
