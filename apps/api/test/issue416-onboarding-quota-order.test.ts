import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import type {
  PostgresPool,
  PostgresTransaction,
} from "../src/common/database/postgres";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { authorizeStaffManagement } from "../src/modules/management/staff-management-authorization";
import {
  createStaffOnboarding,
  resendStaffOnboarding,
  staffOnboardingOperationExists,
} from "../src/modules/management/staff-onboarding-repository";
import {
  lockStaffOnboardingAccount,
  staffOnboardingTargetEmail,
} from "../src/modules/management/staff-onboarding-account-lock";
import { recordAdminActivityInTransaction } from "../src/modules/auth/mfa/mfa-assurance-policy";
import { StaffOnboardingService } from "../src/modules/management/staff-onboarding.service";
import type { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { AntiAbuseUnavailableError } from "../src/modules/anti-abuse/anti-abuse.service";

vi.mock("../src/common/database/postgres-transaction", () => ({
  inPostgresTransaction: vi.fn(),
}));
vi.mock("../src/modules/management/staff-management-authorization", () => ({
  authorizeStaffManagement: vi.fn(),
}));
vi.mock("../src/modules/management/staff-onboarding-repository", () => ({
  createStaffOnboarding: vi.fn(),
  resendStaffOnboarding: vi.fn(),
  staffOnboardingOperationExists: vi.fn(),
}));
vi.mock("../src/modules/management/staff-onboarding-account-lock", () => ({
  lockStaffOnboardingAccount: vi.fn(),
  staffOnboardingTargetEmail: vi.fn(),
}));
vi.mock("../src/modules/auth/mfa/mfa-assurance-policy", () => ({
  recordAdminActivityInTransaction: vi.fn(),
}));

const org = randomUUID(),
  membership = randomUUID(),
  userId = randomUUID();
const key = {
  scope: "v1:staff-onboarding-create-organization",
  keyHash: "redacted",
  lockHigh: 0,
  lockLow: 1,
} as const;
const reservation = { id: randomUUID(), key };
const context = { userId } as StaffSessionContext;
const command = {
  operationId: randomUUID(),
  email: "employee@example.test",
  firstName: "A",
  lastName: "B",
  role: "VALET_EMPLOYEE" as const,
  locationIds: [randomUUID()],
};
const originalOrigin = process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN;
let held = 0;
let commitLost = false;
const flow: string[] = [];
const abuse = {
  key: vi.fn(() => key),
  reserve: vi.fn(async () => {
    flow.push("reserve");
    expect(held).toBe(0);
    return { allowed: true as const, reservation };
  }),
  finalize: vi.fn(async (_: unknown, state: string) => {
    flow.push("finalize:" + state);
    expect(held).toBe(0);
  }),
};
const service = new StaffOnboardingService(
  {} as PostgresPool,
  abuse as unknown as AntiAbuseService,
);
const saved = {
  membership_id: membership,
  invitation_id: randomUUID(),
  generation: 1,
  expires_at: new Date("2030-01-01"),
  changed: true,
};

beforeEach(() => {
  held = 0;
  commitLost = false;
  flow.length = 0;
  vi.clearAllMocks();
  process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN = "https://invite.example.test";
  vi.mocked(inPostgresTransaction).mockImplementation(async (_pool, action) => {
    held++;
    flow.push("begin");
    try {
      const result = await action({
        query: vi.fn(),
      } as unknown as PostgresTransaction);
      if (commitLost && flow.filter((value) => value === "begin").length === 2)
        throw new Error("Lost COMMIT acknowledgement");
      return result;
    } finally {
      flow.push("release");
      held--;
    }
  });
  vi.mocked(authorizeStaffManagement).mockResolvedValue({
    kind: "COMPANY_ADMIN",
    organizationId: org,
    membershipId: membership,
    activeLocationIds: null,
    scopeFingerprint: "test",
  });
  vi.mocked(staffOnboardingOperationExists).mockResolvedValue(false);
  vi.mocked(createStaffOnboarding).mockResolvedValue(saved);
  vi.mocked(resendStaffOnboarding).mockResolvedValue(saved);
  vi.mocked(staffOnboardingTargetEmail).mockResolvedValue(command.email);
  vi.mocked(lockStaffOnboardingAccount).mockResolvedValue(undefined);
  vi.mocked(recordAdminActivityInTransaction).mockResolvedValue(undefined);
});

afterEach(() => {
  if (originalOrigin === undefined)
    delete process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN;
  else process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN = originalOrigin;
});

describe("#416 onboarding quota lease isolation", () => {
  it("completes preflight and quota lease before domain locks, finalizes after COMMIT", async () => {
    const response = await service.create(context, org, command);
    expect(response.outcome).toBe("INVITE_ISSUED");
    expect(flow).toEqual([
      "begin",
      "release",
      "reserve",
      "begin",
      "release",
      "finalize:COUNTED",
    ]);
    expect(vi.mocked(authorizeStaffManagement)).toHaveBeenCalledTimes(2);
    expect(abuse.finalize).toHaveBeenCalledWith(reservation, "COUNTED");
  });

  it("does not reserve on an authorized committed-operation replay", async () => {
    vi.mocked(staffOnboardingOperationExists).mockResolvedValue(true);
    vi.mocked(createStaffOnboarding).mockResolvedValue({
      ...saved,
      changed: false,
    });
    const response = await service.create(context, org, command);
    expect(response.outcome).toBe("INVITE_PENDING_LINK_UNAVAILABLE");
    expect(abuse.reserve).not.toHaveBeenCalled();
    expect(abuse.finalize).not.toHaveBeenCalled();
    expect(vi.mocked(authorizeStaffManagement)).toHaveBeenCalledTimes(2);
  });

  it("does not reserve before current MFA and membership authorization", async () => {
    vi.mocked(authorizeStaffManagement).mockRejectedValueOnce(
      new Error("DENIED"),
    );
    await expect(service.create(context, org, command)).rejects.toThrow(
      "DENIED",
    );
    expect(abuse.reserve).not.toHaveBeenCalled();
    expect(vi.mocked(createStaffOnboarding)).not.toHaveBeenCalled();
  });

  it("finalizes IGNORED after a confirmed callback failure/rollback", async () => {
    vi.mocked(createStaffOnboarding).mockRejectedValueOnce(new Error("DENIED"));
    await expect(service.create(context, org, command)).rejects.toThrow(
      "DENIED",
    );
    expect(abuse.finalize).toHaveBeenCalledWith(reservation, "IGNORED");
  });

  it("does not count a failed copy-once link response before COMMIT", async () => {
    delete process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN;
    await expect(service.create(context, org, command)).rejects.toMatchObject({
      code: "STAFF_ONBOARDING_UNAVAILABLE",
    });
    expect(abuse.finalize).toHaveBeenCalledWith(reservation, "IGNORED");
  });

  it("keeps PENDING when the domain callback succeeded but COMMIT may have occurred", async () => {
    commitLost = true;
    await expect(service.create(context, org, command)).rejects.toThrow(
      "COMMIT",
    );
    expect(abuse.reserve).toHaveBeenCalledTimes(1);
    expect(abuse.finalize).not.toHaveBeenCalled();
  });

  it("returns a committed copy-once link when COUNTED finalization is unavailable", async () => {
    abuse.finalize.mockImplementationOnce(async (_reservation, state) => {
      flow.push("finalize:" + state);
      throw new AntiAbuseUnavailableError();
    });
    const response = await service.create(context, org, command);
    expect(response.outcome).toBe("INVITE_ISSUED");
    expect(response).toHaveProperty("activationLink");
    expect(abuse.finalize).toHaveBeenCalledExactlyOnceWith(
      reservation,
      "COUNTED",
    );
    expect(flow).toEqual([
      "begin",
      "release",
      "reserve",
      "begin",
      "release",
      "finalize:COUNTED",
    ]);
    vi.mocked(staffOnboardingOperationExists).mockResolvedValue(true);
    vi.mocked(createStaffOnboarding).mockResolvedValue({
      ...saved,
      changed: false,
    });
    const replay = await service.create(context, org, command);
    expect(replay.outcome).toBe("INVITE_PENDING_LINK_UNAVAILABLE");
    expect(replay).not.toHaveProperty("activationLink");
    expect(abuse.finalize).toHaveBeenCalledTimes(1);
  });

  it("returns the committed resend link when quota finalization is unavailable", async () => {
    abuse.finalize.mockImplementationOnce(async (_reservation, state) => {
      flow.push("finalize:" + state);
      throw new AntiAbuseUnavailableError();
    });
    const response = await service.resend(context, org, membership, {
      operationId: randomUUID(),
    });
    expect(response.outcome).toBe("INVITE_ISSUED");
    expect(response).toHaveProperty("activationLink");
    expect(abuse.finalize).toHaveBeenCalledExactlyOnceWith(
      reservation,
      "COUNTED",
    );
  });

  it("does not suppress unexpected finalizer failures after COMMIT", async () => {
    abuse.finalize.mockRejectedValueOnce(new Error("unexpected invariant"));
    await expect(service.create(context, org, command)).rejects.toThrow(
      "unexpected invariant",
    );
    expect(abuse.finalize).toHaveBeenCalledExactlyOnceWith(
      reservation,
      "COUNTED",
    );
  });

  it("resend also reserves outside the domain lease and ignores unchanged issuance", async () => {
    vi.mocked(resendStaffOnboarding).mockResolvedValue({
      ...saved,
      changed: false,
    });
    const response = await service.resend(context, org, membership, {
      operationId: randomUUID(),
    });
    expect(response.outcome).toBe("INVITE_PENDING_LINK_UNAVAILABLE");
    expect(flow).toEqual([
      "begin",
      "release",
      "reserve",
      "begin",
      "release",
      "finalize:IGNORED",
    ]);
    expect(vi.mocked(staffOnboardingTargetEmail)).toHaveBeenCalledTimes(2);
  });
});
