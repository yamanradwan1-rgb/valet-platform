import { describe, expect, it } from "vitest";

import { AppController } from "../src/app.controller";

describe("AppController", () => {
  it("returns the bootstrap status", () => {
    expect(new AppController().getStatus()).toEqual({
      name: "valet-api",
      status: "ok",
    });
  });
});
