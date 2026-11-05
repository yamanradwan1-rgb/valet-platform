import type { ClientConfig } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  withRestrictedOcrClient,
  type OcrToolClient,
  type OcrToolConnectionDependencies,
} from "../tools/ocr-control/restricted-connection";

const identity = "ocr_operator_qa";
const operatorUrl = `postgresql://${identity}:opaque@localhost:45432/qa_ocr`;
const environment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  OCR_OPERATOR_DATABASE_URL: operatorUrl,
  OCR_MAINTENANCE_DATABASE_URL:
    "postgresql://ocr_maintenance_qa:opaque@localhost:45432/qa_ocr",
};

function safePrincipal(overrides: Record<string, unknown> = {}) {
  return {
    session_role: identity,
    unchanged_role: true,
    rolcanlogin: true,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
    can_create_database: false,
    can_create_schema: false,
    has_direct_ocr_table_access: false,
    ...overrides,
  };
}

function fakeConnection(overrides: Record<string, unknown> = {}) {
  const client = {
    connect: vi.fn(async () => undefined),
    end: vi.fn(async () => undefined),
    query: vi.fn(async () => ({
      rowCount: 1,
      rows: [safePrincipal(overrides)],
    })),
  } as unknown as OcrToolClient;
  const createClient = vi.fn((config: ClientConfig) => {
    if (!config.user) throw new Error("Missing restricted role identity.");
    return client;
  });
  const verifyTls = vi.fn(async () => undefined);
  const dependencies: OcrToolConnectionDependencies = {
    createClient,
    verifyTls,
  };
  return { client, createClient, verifyTls, dependencies };
}

describe("Issue #429 direct OCR restricted DB principals", () => {
  it("requires dedicated credentials and refuses migration/runtime identity", async () => {
    const { dependencies, createClient } = fakeConnection();
    for (const unsafe of [
      { NODE_ENV: "test" },
      { ...environment, DATABASE_URL: operatorUrl },
      { ...environment, MIGRATION_DATABASE_URL: operatorUrl },
      { ...environment, OCR_MAINTENANCE_DATABASE_URL: operatorUrl },
    ]) {
      await expect(
        withRestrictedOcrClient(
          "operator",
          unsafe,
          async () => 1,
          dependencies,
        ),
      ).rejects.toThrow();
    }
    expect(createClient).not.toHaveBeenCalled();
  });

  it("verifies actual session_user and closes the direct client", async () => {
    const { dependencies, client, createClient, verifyTls } = fakeConnection();
    const action = vi.fn(async () => 17);
    expect(
      await withRestrictedOcrClient(
        "operator",
        environment,
        action,
        dependencies,
      ),
    ).toBe(17);
    expect(createClient).toHaveBeenCalledOnce();
    expect(verifyTls).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledWith(client);
    expect(client.end).toHaveBeenCalledOnce();
  });

  it.each([
    { session_role: "runtime_role" },
    { unchanged_role: false },
    { rolsuper: true },
    { rolcreatedb: true },
    { rolcreaterole: true },
    { rolreplication: true },
    { rolbypassrls: true },
    { can_create_database: true },
    { can_create_schema: true },
    { has_direct_ocr_table_access: true },
  ])("rejects untrusted DB role or elevated privileges", async (unsafe) => {
    const { dependencies, client } = fakeConnection(unsafe);
    const action = vi.fn();
    await expect(
      withRestrictedOcrClient("operator", environment, action, dependencies),
    ).rejects.toThrow();
    expect(action).not.toHaveBeenCalled();
    expect(client.end).toHaveBeenCalledOnce();
  });

  it("has a strict maintenance-only login, never fallback to operator credentials", async () => {
    const { dependencies, createClient } = fakeConnection();
    await expect(
      withRestrictedOcrClient(
        "maintenance",
        {
          NODE_ENV: "test",
          OCR_OPERATOR_DATABASE_URL: operatorUrl,
        },
        async () => 0,
        dependencies,
      ),
    ).rejects.toThrow();
    expect(createClient).not.toHaveBeenCalled();
  });
});
