import { describe, expect, it } from "vitest";

import {
  DigitalPaymentProviderRegistry,
  UnconfiguredDigitalPaymentProviderRegistry,
} from "../src/modules/payments/digital-payment-provider";
import { projectManagementIntegrations } from "../src/modules/management/management-integrations-status";

const organizationId = "11111111-1111-4111-8111-111111111111";

function configuredEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PLATE_OCR_ENDPOINT: "https://ocr.invalid/v1/",
    PLATE_OCR_TOKEN: "not-a-real-token",
    STAFF_PUSH_ACTIVE_REGISTRATION_STALE_DAYS: "30",
    STAFF_PUSH_CLEANUP_INTERVAL_HOURS: "24",
    STAFF_PUSH_FCM_PROJECT_ID: "valid-project-1",
    STAFF_PUSH_INTENT_DELIVERY_RETENTION_DAYS: "7",
    STAFF_PUSH_LEASE_DURATION_SECONDS: "30",
    STAFF_PUSH_PROVIDER_CALL_TIMEOUT_SECONDS: "10",
    STAFF_PUSH_RETRIEVAL_CREATION_ENABLED: "true",
    STAFF_PUSH_RETRIEVAL_INTENT_TTL_SECONDS: "300",
    STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS: "4",
    STAFF_PUSH_RETRIEVAL_POLICY_VERSION: "1",
    STAFF_PUSH_RETRY_CAP_SECONDS: "60",
    STAFF_PUSH_RETRY_MINIMUM_SECONDS: "10",
    STAFF_PUSH_TERMINAL_REGISTRATION_RETENTION_DAYS: "30",
    STAFF_PUSH_WORKER_SENDING_ENABLED: "true",
  };
}

class ConfiguredRegistry extends DigitalPaymentProviderRegistry {
  calls = 0;
  configuredProviderFor(): string {
    this.calls += 1;
    return "provider";
  }
  providerFor(): null {
    this.calls += 1;
    return null;
  }
}

function statuses(env: NodeJS.ProcessEnv, registry = new UnconfiguredDigitalPaymentProviderRegistry()) {
  return projectManagementIntegrations(organizationId, env, registry).integrations;
}

describe("MGT-BE-12 integration status projection", () => {
  it("treats syntactic configuration as UNKNOWN, never health", () => {
    expect(statuses(configuredEnvironment())).toEqual([
      { key: "PLATE_OCR", status: "UNKNOWN" },
      { key: "STAFF_PUSH", status: "UNKNOWN" },
      { key: "DIGITAL_PAYMENT", status: "UNAVAILABLE" },
    ]);
  });

  it("reports missing/malformed OCR and production fail-closed truthfully", () => {
    const missing = configuredEnvironment();
    delete missing.PLATE_OCR_ENDPOINT;
    expect(statuses(missing)[0]).toEqual({ key: "PLATE_OCR", status: "UNAVAILABLE" });
    const malformed = configuredEnvironment();
    malformed.PLATE_OCR_ENDPOINT = "file:///secret";
    expect(statuses(malformed)[0]).toEqual({ key: "PLATE_OCR", status: "MISCONFIGURED" });
    const production = configuredEnvironment();
    production.NODE_ENV = "production";
    expect(statuses(production)[0]).toEqual({ key: "PLATE_OCR", status: "UNAVAILABLE" });
  });

  it("reports disabled/misconfigured Staff Push without sending", () => {
    const disabled = configuredEnvironment();
    disabled.STAFF_PUSH_WORKER_SENDING_ENABLED = "false";
    expect(statuses(disabled)[1]).toEqual({ key: "STAFF_PUSH", status: "DISABLED" });
    const malformed = configuredEnvironment();
    malformed.STAFF_PUSH_FCM_PROJECT_ID = "bad";
    expect(statuses(malformed)[1]).toEqual({ key: "STAFF_PUSH", status: "MISCONFIGURED" });
  });

  it("does not call a configured payment registry and leaks no configuration", () => {
    const registry = new ConfiguredRegistry();
    const result = projectManagementIntegrations(
      organizationId,
      configuredEnvironment(),
      registry,
    );
    expect(result.integrations[2]).toEqual({
      key: "DIGITAL_PAYMENT",
      status: "UNKNOWN",
    });
    expect(registry.calls).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(
      /token|endpoint|projectId|providerReference|registration/i,
    );
  });

  it("performs no provider network I/O while projecting status", () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      throw new Error("status projection must not perform provider I/O");
    }) as typeof fetch;
    try {
      projectManagementIntegrations(
        organizationId,
        configuredEnvironment(),
        new ConfiguredRegistry(),
      );
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
