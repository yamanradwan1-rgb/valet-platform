import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";

import { staffAuthOperationRoutes } from "../src/common/http/staff-auth-operation-routes";
import { StaffMfaController } from "../src/modules/auth/mfa/staff-mfa.controller";
import { executeControlledMfaRecovery } from "../tools/mfa-recovery/execution";
import { parseMfaRecoveryArguments } from "../tools/mfa-recovery/input";

function validArguments(): string[] {
  return [
    "--operation",
    "recover-totp",
    "--operation-id",
    randomUUID(),
    "--operator-ref",
    "CHANGE-MFA-42",
    "--user-id",
    randomUUID(),
  ];
}

function replaceValue(values: string[], flag: string, value: string): string[] {
  const copy = [...values];
  const index = copy.indexOf(flag);
  if (index < 0) throw new Error(`Missing test flag ${flag}.`);
  copy[index + 1] = value;
  return copy;
}

describe("controlled MFA recovery command input", () => {
  it("accepts only the exact operation and canonicalizes UUIDs", () => {
    const operationId = randomUUID().toUpperCase();
    const userId = randomUUID().toUpperCase();
    expect(
      parseMfaRecoveryArguments(
        replaceValue(
          replaceValue(validArguments(), "--operation-id", operationId),
          "--user-id",
          userId,
        ),
      ),
    ).toEqual({
      operation: "recover-totp",
      operationId: operationId.toLowerCase(),
      operatorRef: "CHANGE-MFA-42",
      userId: userId.toLowerCase(),
    });

    expect(() =>
      parseMfaRecoveryArguments(
        replaceValue(validArguments(), "--operation", "reset-totp"),
      ),
    ).toThrow("Invalid recovery operation");
  });

  it.each(["not-a-uuid", randomUUID().replace(/^./, "g")])(
    "rejects invalid UUID %s",
    (value) => {
      expect(() =>
        parseMfaRecoveryArguments(
          replaceValue(validArguments(), "--operation-id", value),
        ),
      ).toThrow("Invalid identifier");
      expect(() =>
        parseMfaRecoveryArguments(
          replaceValue(validArguments(), "--user-id", value),
        ),
      ).toThrow("Invalid identifier");
    },
  );

  it("requires a bounded control-free operator reference", () => {
    for (const operatorRef of ["", "x".repeat(201), "CHANGE\nFORGED", "A\u0085B"]) {
      expect(() =>
        parseMfaRecoveryArguments(
          replaceValue(validArguments(), "--operator-ref", operatorRef),
        ),
      ).toThrow("Invalid operator reference");
    }
    expect(
      parseMfaRecoveryArguments(
        replaceValue(validArguments(), "--operator-ref", "مشغّل-MFA-٤٢"),
      ).operatorRef,
    ).toBe("مشغّل-MFA-٤٢");
  });

  it("rejects unknown, duplicate, missing, and dangling options", () => {
    expect(() =>
      parseMfaRecoveryArguments([...validArguments(), "--reason", "nope"]),
    ).toThrow("Invalid command input");
    expect(() =>
      parseMfaRecoveryArguments([
        ...validArguments(),
        "--operation",
        "recover-totp",
      ]),
    ).toThrow("Invalid command input");
    expect(() =>
      parseMfaRecoveryArguments(validArguments().slice(0, -2)),
    ).toThrow("Missing required command option");
    expect(() =>
      parseMfaRecoveryArguments([...validArguments(), "--user-id"]),
    ).toThrow("Invalid command input");
  });
});

describe("controlled MFA recovery boundary", () => {
  it("has no controlled/operator recovery HTTP route", () => {
    const controllerBase = Reflect.getMetadata(PATH_METADATA, StaffMfaController) as string;
    const methodPaths = Object.getOwnPropertyNames(StaffMfaController.prototype)
      .filter((name) => name !== "constructor")
      .map((name) =>
        Reflect.getMetadata(
          PATH_METADATA,
          StaffMfaController.prototype[name as keyof StaffMfaController],
        ),
      )
      .filter((path): path is string => typeof path === "string")
      .map((path) => `${controllerBase}/${path}`);

    expect(methodPaths).toEqual(
      expect.arrayContaining([
        "v1/staff/auth/mfa/state",
        "v1/staff/auth/mfa/enrollment/begin",
        "v1/staff/auth/mfa/enrollment/confirm",
        "v1/staff/auth/mfa/step-up",
        "v1/staff/auth/mfa/recovery/begin",
        "v1/staff/auth/mfa/recovery-codes/reissue",
      ]),
    );
    expect(methodPaths.some((path) => /operator|controlled/i.test(path))).toBe(false);
    expect(
      staffAuthOperationRoutes.some(
        (route) =>
          /OPERATOR|CONTROLLED/.test(route.operation) ||
          route.path.test("/v1/staff/auth/mfa/operator-recovery"),
      ),
    ).toBe(false);
  });

  it("requires the migration credential before constructing a database client", async () => {
    const createClient = vi.fn();
    await expect(
      executeControlledMfaRecovery(parseMfaRecoveryArguments(validArguments()), {
        DATABASE_URL: "postgresql://runtime:pw@127.0.0.1:5432/valet",
        NODE_ENV: "test",
      }, {
        createClient,
        verifyTls: vi.fn(),
      }),
    ).rejects.toThrow();
    expect(createClient).not.toHaveBeenCalled();
  });
});
