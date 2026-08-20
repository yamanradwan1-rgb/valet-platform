import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { UnconfiguredDigitalPaymentProviderRegistry } from "../src/modules/payments/digital-payment-provider";
import { ProviderEventError } from "../src/modules/payments/provider-event-errors";
import { Phase6CoreE2ETestContext } from "./phase6-core-e2e-test-context";
import {
  ProviderEventTestContext,
  TestProviderEventAuthenticator,
} from "./provider-event-test-context";

const canaries = [
  "SENSITIVE_PAN_CANARY",
  "SENSITIVE_CVV_CANARY",
  "PROVIDER_SECRET_CANARY",
  "AUTHORIZATION_HEADER_CANARY",
  "RAW_CALLBACK_CANARY",
] as const;

function expectCanariesAbsent(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const canary of canaries) expect(serialized).not.toContain(canary);
}

describe("VAL-008H production provider and HTTP security gate", () => {
  const context = new Phase6CoreE2ETestContext("production_security");

  beforeAll(async () => context.setupApi(), 120_000);
  afterAll(async () => context.teardownApi(), 60_000);

  it("wires only the fail-closed unconfigured production provider registry", () => {
    const registry = context.providerRegistry();
    expect(registry).toBeInstanceOf(UnconfiguredDigitalPaymentProviderRegistry);
    expect(
      registry.configuredProviderFor({
        locationId: randomUUID(),
        organizationId: randomUUID(),
        paymentId: randomUUID(),
      }),
    ).toBeNull();
    expect(registry.providerFor("test-provider")).toBeNull();
  });

  it("rejects caller-nominated financial authority without echoing canaries", async () => {
    const fixture = await context.createHandoffFixture();
    const authorization = `Bearer ${await context.loginManager(fixture)}`;
    const before = await context.financialSurfaceCounts(fixture);
    const response = await context.request(
      "POST",
      `/v1/staff/valet-sessions/${fixture.sessionId}/payment/refunds`,
      {
        authorization,
        body: {
          amount: "1.000",
          authorizedByMembershipId: canaries[0],
          currency: canaries[1],
          idempotencyKey: randomUUID(),
          provider: canaries[2],
          providerReference: canaries[3],
          rawCallback: canaries[4],
          reason: "Strict input proof",
          status: "SUCCEEDED",
        },
      },
    );
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "REQUEST_INVALID" });
    expectCanariesAbsent(response.body);
    expect(await context.financialSurfaceCounts(fixture)).toEqual(before);
  });
});

describe("VAL-008H normalized provider-event canary gate", () => {
  const context = new ProviderEventTestContext("canaries");

  beforeAll(async () => context.setup(), 120_000);
  afterAll(async () => context.teardown(), 60_000);

  it("persists and audits only normalized safe facts", async () => {
    const fixture = await context.fixture();
    const { operation } = await context.unresolvedOperation(fixture);
    const authenticator = new TestProviderEventAuthenticator();
    authenticator.handler = async () =>
      context.collectionEvent(fixture, operation.id, "COLLECTION_SUCCEEDED", {
        safeResultCode: "SAFE_RESULT",
      });
    const raw = {
      authorization: canaries[3],
      cardNumber: canaries[0],
      cvv: canaries[1],
      payload: canaries[4],
      providerSecret: canaries[2],
    };
    const result = await context.ingress(authenticator)(raw);
    expect(result.processingStatus).toBe("PROCESSED");
    const effects = await context.providerEffects(fixture);
    expectCanariesAbsent(effects);
    expect(effects.events).toHaveLength(1);
    expect(effects.audits).toHaveLength(1);
  });

  it("keeps authentication errors generic and writes nothing", async () => {
    const fixture = await context.fixture();
    const before = await context.providerEffects(fixture);
    const authenticator = new TestProviderEventAuthenticator();
    authenticator.handler = async () => {
      throw new Error(canaries.join(" "));
    };
    let failure: unknown;
    try {
      await context.ingress(authenticator)({ raw: canaries });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ProviderEventError);
    expect((failure as Error).message).toBe("Provider event was rejected.");
    expectCanariesAbsent(failure instanceof Error ? failure.message : failure);
    const effects = await context.providerEffects(fixture);
    expect(effects).toEqual(before);
  });
});
