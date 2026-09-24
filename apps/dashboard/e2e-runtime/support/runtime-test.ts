import { expect, test as base } from "@playwright/test";

import { resetRuntimeFixture } from "./runtime-fixture";

export const test = base.extend<{ runtimeBaseline: void }>({
  runtimeBaseline: [async ({}, use) => {
    await resetRuntimeFixture();
    await use();
  }, { auto: true }],
});

export { expect };
