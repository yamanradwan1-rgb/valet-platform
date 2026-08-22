import { describe, expect, it, vi } from "vitest";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { executeRetrievalTaskAction } from "./retrieval-task-runner";
import type { AcceptTaskResponse, AssignTaskResponse } from "./retrieval-api";

describe("Retrieval Task Runner Lifecycle & Ownership", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "22222222-2222-4222-8222-222222222222";
  const myMembershipId = "33333333-3333-4333-8333-333333333333";
  const otherMembershipId = "44444444-4444-4444-8444-444444444444";

  it("assigns and accepts QUEUED retrieval task using returned version", async () => {
    const assignRes: AssignTaskResponse = {
      createdAt: "2026-08-21T18:00:00.000Z",
      currentAssigneeMembershipId: myMembershipId,
      sessionId,
      status: "ASSIGNED",
      taskId,
      taskType: "RETRIEVAL",
      version: 2,
    };
    const acceptRes: AcceptTaskResponse = {
      createdAt: "2026-08-21T18:00:01.000Z",
      currentAssigneeMembershipId: myMembershipId,
      sessionId,
      status: "ACCEPTED",
      taskId,
      taskType: "RETRIEVAL",
      version: 3,
    };

    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(assignRes)
        .mockResolvedValueOnce(acceptRes),
    } as unknown as EmployeeApiClient;

    const result = await executeRetrievalTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: null,
        sessionId,
        status: "QUEUED",
        taskId,
        version: 1,
      },
      myMembershipId,
    );

    expect(result).toEqual({
      kind: "NAVIGATE_ACCEPTED",
      sessionId,
      taskId,
      taskVersion: 3,
    });

    expect(mockClient.request).toHaveBeenCalledTimes(2);
    expect(mockClient.request).toHaveBeenNthCalledWith(
      1,
      `/v1/staff/tasks/${taskId}/assign`,
      expect.objectContaining({ body: { expectedVersion: 1 }, method: "POST" }),
    );
    expect(mockClient.request).toHaveBeenNthCalledWith(
      2,
      `/v1/staff/tasks/${taskId}/accept`,
      expect.objectContaining({ body: { expectedVersion: 2 }, method: "POST" }),
    );
  });

  it("accepts ASSIGNED task owned by current employee with exact version", async () => {
    const acceptRes: AcceptTaskResponse = {
      createdAt: "2026-08-21T18:00:01.000Z",
      currentAssigneeMembershipId: myMembershipId,
      sessionId,
      status: "ACCEPTED",
      taskId,
      taskType: "RETRIEVAL",
      version: 4,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(acceptRes),
    } as unknown as EmployeeApiClient;

    const result = await executeRetrievalTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: myMembershipId,
        sessionId,
        status: "ASSIGNED",
        taskId,
        version: 3,
      },
      myMembershipId,
    );

    expect(result).toEqual({
      kind: "NAVIGATE_ACCEPTED",
      sessionId,
      taskId,
      taskVersion: 4,
    });

    expect(mockClient.request).toHaveBeenCalledTimes(1);
    expect(mockClient.request).toHaveBeenCalledWith(
      `/v1/staff/tasks/${taskId}/accept`,
      expect.objectContaining({ body: { expectedVersion: 3 }, method: "POST" }),
    );
  });

  it("navigates without task mutation when task is already ACCEPTED by current employee", async () => {
    const mockClient = {
      request: vi.fn(),
    } as unknown as EmployeeApiClient;

    const result = await executeRetrievalTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: myMembershipId,
        sessionId,
        status: "ACCEPTED",
        taskId,
        version: 5,
      },
      myMembershipId,
    );

    expect(result).toEqual({
      kind: "NAVIGATE_ACCEPTED",
      sessionId,
      taskId,
      taskVersion: 5,
    });
    expect(mockClient.request).not.toHaveBeenCalled();
  });

  it("navigates without task mutation when task is already IN_PROGRESS by current employee", async () => {
    const mockClient = {
      request: vi.fn(),
    } as unknown as EmployeeApiClient;

    const result = await executeRetrievalTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: myMembershipId,
        sessionId,
        status: "IN_PROGRESS",
        taskId,
        version: 6,
      },
      myMembershipId,
    );

    expect(result).toEqual({
      kind: "NAVIGATE_IN_PROGRESS",
      sessionId,
      taskId,
      taskVersion: 6,
    });
    expect(mockClient.request).not.toHaveBeenCalled();
  });

  it("denies ASSIGNED task owned by another employee without mutation", async () => {
    const mockClient = {
      request: vi.fn(),
    } as unknown as EmployeeApiClient;

    const result = await executeRetrievalTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: otherMembershipId,
        sessionId,
        status: "ASSIGNED",
        taskId,
        version: 2,
      },
      myMembershipId,
    );

    expect(result).toEqual({ kind: "DENIED" });
    expect(mockClient.request).not.toHaveBeenCalled();
  });

  it("denies ACCEPTED task owned by another employee without mutation", async () => {
    const mockClient = {
      request: vi.fn(),
    } as unknown as EmployeeApiClient;

    const result = await executeRetrievalTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: otherMembershipId,
        sessionId,
        status: "ACCEPTED",
        taskId,
        version: 3,
      },
      myMembershipId,
    );

    expect(result).toEqual({ kind: "DENIED" });
    expect(mockClient.request).not.toHaveBeenCalled();
  });

  it("denies IN_PROGRESS task owned by another employee without mutation", async () => {
    const mockClient = {
      request: vi.fn(),
    } as unknown as EmployeeApiClient;

    const result = await executeRetrievalTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: otherMembershipId,
        sessionId,
        status: "IN_PROGRESS",
        taskId,
        version: 4,
      },
      myMembershipId,
    );

    expect(result).toEqual({ kind: "DENIED" });
    expect(mockClient.request).not.toHaveBeenCalled();
  });
});
