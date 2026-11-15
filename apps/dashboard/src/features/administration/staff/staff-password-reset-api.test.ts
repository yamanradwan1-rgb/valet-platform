import { describe, expect, it, vi } from "vitest";
import {
  issueStaffPasswordReset,
  readStaffPasswordResetStatus,
  staffResetManagementPath,
} from "./staff-password-reset-api";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

const org = "16b123bc-fd31-42be-99ed-1a96bb616113";
const member = "f3d0cddb-d975-4ce1-960a-03dd89a48c11";

describe("Issue416 staff reset Management transport", () => {
  it("uses current scoped membership status without query tokens or location claims", async () => {
    const request = vi.fn().mockResolvedValue({
      eligible: false, latestGeneration: 0, linkState: "NONE", expiresAt: null,
    });
    const client = { request } as unknown as DashboardApiClient;
    const abort = new AbortController();
    await readStaffPasswordResetStatus(client, org, member, abort.signal);
    const [path, schema, options] = request.mock.calls[0]!;
    expect(path).toBe(
      `/v1/staff/management/organizations/${org}/staff/${member}/password-resets/status`,
    );
    expect(options).toEqual({ signal: abort.signal });
    expect(schema.safeParse({
      eligible: false, latestGeneration: 0, linkState: "NONE", expiresAt: null,
    }).success).toBe(true);
  });

  it("only sends operation id and CAS generation for issuance", async () => {
    const request = vi.fn().mockResolvedValue({
      outcome: "LINK_UNAVAILABLE", membershipId: member,
      generation: 3, expiresAt: "2026-11-14T04:15:00.000Z",
    });
    const client = { request } as unknown as DashboardApiClient;
    const command = { operationId: org, expectedGeneration: 2 };
    await issueStaffPasswordReset(client, org, member, command);
    expect(request.mock.calls[0]?.[0]).toBe(staffResetManagementPath(org, member));
    expect(request.mock.calls[0]?.[2]).toEqual({ method: "POST", body: command });
    expect(request.mock.calls[0]?.[1].safeParse(await request.mock.results[0]?.value).success).toBe(true);
  });
});
