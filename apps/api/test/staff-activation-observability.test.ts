import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { staffAuthOperationRoutes } from "../src/common/http/staff-auth-operation-routes";
import { formatOperationMeasurement } from "../src/common/observability/console-operation-observer";
import type { OperationMeasurement } from "../src/common/observability/operation-observability";
import { StaffActivationFailedError } from "../src/modules/auth/staff-activation-repository";

describe("T05-D activation observation privacy", () => {
  it("only POST maps to the bounded activation operation label", () => {
    for (const method of ["GET", "PUT", "POST"]) {
      const route = staffAuthOperationRoutes.find(
        (candidate) =>
          candidate.method === method &&
          candidate.path.test("/v1/staff/auth/activate"),
      );
      expect(route?.operation).toBe(
        method === "POST" ? "STAFF_AUTH_ACTIVATE" : undefined,
      );
    }
  });
  it("error envelope, measurement and formatted log exclude credential/body/password", async () => {
    const token = `vsi1.${"x".repeat(43)}`,
      password = "Private synthetic password!";
    const measurements: OperationMeasurement[] = [];
    const runner = new ApiOperationRunner(
      { now: () => 1 },
      {
        observe: (value) => {
          measurements.push(value);
        },
      },
    );
    const error = await runner
      .run(
        "STAFF_AUTH_ACTIVATE",
        {
          headers: {},
          requestId: "240d-safe",
          ...{ body: { inviteToken: token, password } },
        },
        async () => {
          throw new StaffActivationFailedError();
        },
      )
      .catch((reason: unknown) => reason);
    expect(error instanceof HttpException).toBe(true);
    const envelope = (error as HttpException).getResponse();
    expect((error as HttpException).getStatus()).toBe(401);
    const output = JSON.stringify({
      envelope,
      measurements,
      lines: measurements.map(formatOperationMeasurement),
    });
    expect(output.includes(token) || output.includes(password)).toBe(false);
    expect(measurements.length).toBe(1);
    expect(measurements[0]?.errorCode).toBe("STAFF_ACTIVATION_FAILED");
  });
});
