import { describe, expect, it } from "vitest";

import { acquireConditionPhotoIngress } from "../src/modules/check-in-api/condition-photo-ingress";

describe("P2 process-local bounded multipart memory admission", () => {
  it("caps in-flight large buffers and permits release without double decrement", () => {
    const releases = Array.from({ length: 4 }, () => acquireConditionPhotoIngress());
    try {
      expect(() => acquireConditionPhotoIngress())
        .toThrowError("Photo storage is temporarily unavailable.");
    } finally {
      for (const release of releases) {
        release();
        release();
      }
    }
    const release = acquireConditionPhotoIngress();
    release();
  });
});
