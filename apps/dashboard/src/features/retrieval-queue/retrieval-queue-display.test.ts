import { describe, expect, it } from "vitest";
import type { RetrievalQueueEntry } from "@valet/contracts";

import { arTranslations } from "../../i18n/translations/ar";
import { enTranslations } from "../../i18n/translations/en";
import {
  queueAssigneeCellText,
  queueAssigneeDetailText,
  queueTaskIdDetailText,
  requestIdCell,
  requesterLabelKeyOf,
  statusLabelKeyOf,
} from "./retrieval-queue-display";

const REQUEST_ID = "481f7350-bb31-4f2d-a050-31a820d0a101";
const TASK_ID = "59220eb7-d188-4c7f-ab9e-a4779a6af101";
const ASSIGNEE_ID = "eb39db89-54d2-45fa-a64e-29f89688f102";

function entry(task: RetrievalQueueEntry["task"]): RetrievalQueueEntry {
  return {
    requestId: REQUEST_ID,
    requestedAt: "2026-08-24T14:32:00Z",
    requesterType: "CUSTOMER",
    status: "OPEN",
    task,
    valetSessionId: "2dc14878-df98-4d0f-b164-bc2506a6b102",
  };
}

describe("retrieval queue display helpers", () => {
  it("treats a null task as not assigned without inventing task data", () => {
    const noTask = entry(null);
    expect(queueTaskIdDetailText(noTask, "Not assigned")).toBe("Not assigned");
    expect(queueAssigneeCellText(noTask, "Unassigned")).toBeNull();
    expect(queueAssigneeDetailText(noTask, "Unassigned")).toBe("Unassigned");
  });

  it("surfaces task facts when the backend provides them", () => {
    const withTask = entry({
      currentAssigneeMembershipId: null,
      status: "IN_PROGRESS",
      taskId: TASK_ID,
    });
    expect(queueTaskIdDetailText(withTask, "Not assigned")).toBe(TASK_ID);
    // Task present but assignee still nullable -> honest unassigned.
    expect(queueAssigneeDetailText(withTask, "Unassigned")).toBe("Unassigned");
  });

  it("shortens a present assignee membership id for table cells", () => {
    const assigned = entry({
      currentAssigneeMembershipId: ASSIGNEE_ID,
      status: "ASSIGNED",
      taskId: TASK_ID,
    });
    expect(queueAssigneeCellText(assigned, "Unassigned")).toBe(
      "eb39db89…f102",
    );
  });

  it("maps both requester types to friendly labels in EN and AR", () => {
    const customer = requesterLabelKeyOf(entry(null));
    expect(enTranslations[customer]).toBe("Customer");
    expect(arTranslations[customer]).toBe("العميل");
    const staffKey = requesterLabelKeyOf({
      ...entry(null),
      requesterType: "STAFF",
    });
    expect(enTranslations[staffKey]).toBe("Staff");
    expect(arTranslations[staffKey]).toBe("الموظف");
  });

  it("maps OPEN and ACCEPTED request statuses in EN and AR", () => {
    const open = statusLabelKeyOf(entry(null));
    expect(enTranslations[open]).toBeTruthy();
    expect(arTranslations[open]).toBeTruthy();
    const accepted = statusLabelKeyOf({ ...entry(null), status: "ACCEPTED" });
    expect(enTranslations[accepted]).toBeTruthy();
    expect(arTranslations[accepted]).toBeTruthy();
  });

  it("shortens request ids consistently for cells", () => {
    expect(requestIdCell(entry(null))).toBe("481f7350…a101");
  });
});
