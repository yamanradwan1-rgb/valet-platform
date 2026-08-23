import { MODULE_METADATA } from "@nestjs/common/constants";
import { APP_FILTER } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { ApiExceptionFilter } from "../src/common/http/api-exception.filter";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";

function metadata<T>(module: object, key: string): T[] {
  return (Reflect.getMetadata(key, module) as T[] | undefined) ?? [];
}

describe("HTTP infrastructure ownership", () => {
  it("provides the neutral runner and one global exception filter", () => {
    expect(
      metadata(HttpInfrastructureModule, MODULE_METADATA.PROVIDERS),
    ).toEqual([
      ApiOperationRunner,
      expect.any(Function),
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
    ]);
    const filterRegistrations = metadata<object>(
      HttpInfrastructureModule,
      MODULE_METADATA.PROVIDERS,
    ).filter(
      (provider) =>
        typeof provider === "object" &&
        provider !== null &&
        "provide" in provider &&
        provider.provide === APP_FILTER,
    );
    expect(filterRegistrations).toHaveLength(1);
  });
});
