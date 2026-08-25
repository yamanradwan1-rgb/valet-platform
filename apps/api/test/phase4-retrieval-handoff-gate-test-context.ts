import { randomBytes } from "node:crypto";

import type { HandoffStandardMethod } from "@valet/contracts";

import {
  type GateFixture,
  type HttpResult,
  Phase3OperationsGateContext,
} from "./phase3-operations-gate-test-context";

export interface ParkedGateFixture extends GateFixture {
  readonly sessionVersion: number;
}

export interface RequestedGateFixture extends ParkedGateFixture {
  readonly requestId: string;
  readonly taskId: string;
  readonly taskVersion: number;
}

export interface RetrievalOwner {
  readonly accessToken: string;
  readonly membershipId: string;
  readonly userId: string;
}

function number(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== "number") throw new Error(`Missing number ${key}.`);
  return value;
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") throw new Error(`Missing string ${key}.`);
  return value;
}

export class Phase4RetrievalHandoffGateContext extends Phase3OperationsGateContext {
  private priorHandoffSecret: string | undefined;

  constructor(label: string) {
    super(`006h_${label}`);
  }

  override async setupGate(): Promise<void> {
    this.priorHandoffSecret = process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL;
    process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL =
      randomBytes(32).toString("base64url");
    await super.setupGate();
  }

  override async teardownGate(): Promise<void> {
    try {
      await super.teardownGate();
    } finally {
      if (this.priorHandoffSecret === undefined) {
        delete process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL;
      } else {
        process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL =
          this.priorHandoffSecret;
      }
    }
  }

  staffPost(token: string, path: string, body: unknown): Promise<HttpResult> {
    return this.request("POST", path, { body, token });
  }

  guestPost(
    token: string,
    path: string,
    body: unknown = {},
  ): Promise<HttpResult> {
    return this.request("POST", path, { body, token });
  }

  guestGet(token: string): Promise<HttpResult> {
    return this.request("GET", "/v1/guest/session", { token });
  }

  async createParkedFixture(): Promise<ParkedGateFixture> {
    const fixture = await this.createGateFixture();
    const sessionPath = `/v1/staff/valet-sessions/${fixture.sessionId}`;
    const key = await this.staffPost(
      fixture.accessToken,
      `${sessionPath}/key-slot/assign`,
      { expectedVersion: 1, keySlotCode: fixture.keySlotCode },
    );
    const queued = await this.staffPost(
      fixture.accessToken,
      `${sessionPath}/parking-task/queue`,
      {},
    );
    const taskId = text(queued.body, "taskId");
    const assigned = await this.staffPost(
      fixture.accessToken,
      `/v1/staff/tasks/${taskId}/assign`,
      { expectedVersion: number(queued.body, "version") },
    );
    const accepted = await this.staffPost(
      fixture.accessToken,
      `/v1/staff/tasks/${taskId}/accept`,
      { expectedVersion: number(assigned.body, "version") },
    );
    const started = await this.staffPost(
      fixture.accessToken,
      `${sessionPath}/start-parking`,
      {
        expectedSessionVersion: number(key.body, "version"),
        expectedTaskVersion: number(accepted.body, "version"),
      },
    );
    const parked = await this.staffPost(
      fixture.accessToken,
      `${sessionPath}/confirm-parked`,
      {
        expectedSessionVersion: number(started.body, "sessionVersion"),
        expectedTaskVersion: number(started.body, "taskVersion"),
        keySlotCode: fixture.keySlotCode,
        parkingSpotCode: fixture.parkingSpotCode,
      },
    );
    if (parked.status !== 200 || parked.body.state !== "PARKED") {
      throw new Error("Phase 3 API baseline did not reach PARKED.");
    }
    return {
      ...fixture,
      sessionVersion: number(parked.body, "sessionVersion"),
    };
  }

  async requestRetrieval(
    fixture: ParkedGateFixture,
  ): Promise<RequestedGateFixture> {
    const requested = await this.guestPost(
      fixture.guestToken,
      "/v1/guest/session/request-retrieval",
    );
    if (requested.status !== 200 || requested.body.state !== "REQUESTED") {
      throw new Error("Guest API did not request Retrieval.");
    }
    const lifecycle = await this.adminPool.query<{
      request_id: string;
      session_version: number;
      task_id: string;
      task_version: number;
    }>(
      `SELECT request.id::text AS request_id, task.id::text AS task_id,
              task.version AS task_version, session.version AS session_version
       FROM valet_sessions AS session
       INNER JOIN retrieval_requests AS request
         ON request.valet_session_id = session.id AND request.status = 'OPEN'
       INNER JOIN tasks AS task
         ON task.valet_session_id = session.id AND task.task_type = 'RETRIEVAL'
        AND task.status = 'QUEUED'
       WHERE session.id = $1`,
      [fixture.sessionId],
    );
    const row = lifecycle.rows[0];
    if (row === undefined)
      throw new Error("Retrieval lifecycle was not created.");
    return {
      ...fixture,
      requestId: row.request_id,
      sessionVersion: row.session_version,
      taskId: row.task_id,
      taskVersion: row.task_version,
    };
  }

  async addOperationalMember(
    fixture: GateFixture,
    role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR",
  ): Promise<RetrievalOwner> {
    const actor = await this.addMember(fixture, role);
    await this.startShift({
      ...actor,
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
    });
    return { ...actor, accessToken: await this.authorize(actor.userId) };
  }

  async assignAndAccept(
    fixture: RequestedGateFixture,
    actor: RetrievalOwner = fixture,
    supervisor?: RetrievalOwner,
  ): Promise<RequestedGateFixture & RetrievalOwner> {
    const assigned = await this.staffPost(
      supervisor?.accessToken ?? actor.accessToken,
      `/v1/staff/tasks/${fixture.taskId}/assign`,
      {
        expectedVersion: fixture.taskVersion,
        ...(supervisor === undefined
          ? {}
          : { targetAssigneeMembershipId: actor.membershipId }),
      },
    );
    const accepted = await this.staffPost(
      actor.accessToken,
      `/v1/staff/tasks/${fixture.taskId}/accept`,
      { expectedVersion: number(assigned.body, "version") },
    );
    return {
      ...fixture,
      ...actor,
      taskVersion: number(accepted.body, "version"),
    };
  }

  async reachHandoffPending(
    fixture: RequestedGateFixture & RetrievalOwner,
  ): Promise<RequestedGateFixture & RetrievalOwner> {
    const path = `/v1/staff/valet-sessions/${fixture.sessionId}`;
    const started = await this.staffPost(
      fixture.accessToken,
      `${path}/start-retrieval`,
      {
        expectedSessionVersion: fixture.sessionVersion,
        expectedTaskVersion: fixture.taskVersion,
      },
    );
    const ready = await this.staffPost(
      fixture.accessToken,
      `${path}/mark-ready`,
      { expectedSessionVersion: number(started.body, "sessionVersion") },
    );
    const initiated = await this.staffPost(
      fixture.accessToken,
      `${path}/initiate-handoff`,
      { expectedSessionVersion: number(ready.body, "sessionVersion") },
    );
    return {
      ...fixture,
      sessionVersion: number(initiated.body, "sessionVersion"),
      taskVersion: number(initiated.body, "taskVersion"),
    };
  }

  async verifyStandard(
    fixture: RequestedGateFixture & RetrievalOwner,
    method: HandoffStandardMethod,
  ): Promise<RequestedGateFixture & RetrievalOwner> {
    return (await this.issueAndVerifyStandard(fixture, method)).fixture;
  }

  async issueAndVerifyStandard(
    fixture: RequestedGateFixture & RetrievalOwner,
    method: HandoffStandardMethod,
  ): Promise<{
    readonly fixture: RequestedGateFixture & RetrievalOwner;
    readonly proofMaterial: string;
  }> {
    const issued = await this.guestPost(
      fixture.guestToken,
      "/v1/guest/session/handoff-verification/issue",
      { method },
    );
    const proofKey = method === "PICKUP_CODE" ? "pickupCode" : "qrPayload";
    const route =
      method === "PICKUP_CODE" ? "verify-pickup-code" : "verify-dynamic-qr";
    const verified = await this.staffPost(
      fixture.accessToken,
      `/v1/staff/valet-sessions/${fixture.sessionId}/${route}`,
      {
        expectedSessionVersion: fixture.sessionVersion,
        [proofKey]: text(issued.body, proofKey),
      },
    );
    return {
      fixture: {
        ...fixture,
        sessionVersion: number(verified.body, "sessionVersion"),
      },
      proofMaterial: text(issued.body, proofKey),
    };
  }

  complete(
    fixture: RequestedGateFixture & RetrievalOwner,
  ): Promise<HttpResult> {
    return this.staffPost(
      fixture.accessToken,
      `/v1/staff/valet-sessions/${fixture.sessionId}/complete-handoff`,
      { expectedSessionVersion: fixture.sessionVersion },
    );
  }
}
