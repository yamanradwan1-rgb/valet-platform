import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Render-contract invariant pinning WHY a location-scoped page can never
 * observe an empty/none location id while mounted (the "A-under-none"
 * question, D4-004 pre-commit review §7):
 *
 * 1. The provider derives `location === null` exactly when the bootstrap is
 *    unsettled (loading), failed (error), or settled with ZERO authorized
 *    locations; with >=1 authorized entry bootstrapSucceeded always selects
 *    a non-null id (preferred if still authorized, else deterministic first
 *    entry) — location-bootstrap-state.ts L72-78.
 * 2. LocationGate renders the routed children ONLY in the ready/>=1 state;
 *    every other state returns BEFORE the AppShell-with-children return, in
 *    the SAME commit (single consistent tree), so a mounted page unmounts at
 *    precisely the commit where its locationId would become empty — and the
 *    page's hook cleanup disposes the controller/loader holding any A
 *    snapshot.
 *
 * The dashboard test environment is `node` (no jsdom), so this contract is
 * pinned by source-order invariants per the established pattern.
 */

const contextSource = readFileSync(
  new URL("./location-context.tsx", import.meta.url),
  "utf8",
);
const gateSource = readFileSync(
  new URL("./location-gate.tsx", import.meta.url),
  "utf8",
);

describe("provider location derivation", () => {
  it("derives loading from an unsettled outcome and empties locations otherwise", () => {
    expect(contextSource).toMatch(
      /outcome === null \? "loading" : outcome\.ok \? "ready" : "error"/u,
    );
    expect(contextSource).toContain(
      'const locations = outcome?.ok === true ? toMetaList(outcome.locations) : [];',
    );
  });

  it("keeps location non-null whenever >=1 authorized entry exists", () => {
    // Fallback selection guarantees selectedId !== null for a non-empty list:
    const bootstrapSource = readFileSync(
      new URL("./location-bootstrap-state.ts", import.meta.url),
      "utf8",
    );
    expect(bootstrapSource).toMatch(
      /locations\[0\]\?\.locationId \?\? null/u,
    );
  });
});

describe("gate render ordering", () => {
  it("returns every non-ready posture BEFORE rendering children", () => {
    // The no-access redirect itself lives in an effect earlier in the file;
    // what matters is the ORDER OF THE RENDER-TIME RETURNS below.
    expect(gateSource).toContain('router.replace("/no-access")');
    const loadingBranch = gateSource.indexOf('if (status === "loading") {');
    const errorBranch = gateSource.indexOf('if (status === "error") {');
    const zeroBranch = gateSource.indexOf("if (zeroAuthorized) {");
    const appShellChildren = gateSource.indexOf(
      "<AppShell>{children}</AppShell>",
    );
    expect(loadingBranch).toBeGreaterThan(-1);
    expect(errorBranch).toBeGreaterThan(loadingBranch);
    expect(zeroBranch).toBeGreaterThan(errorBranch);
    expect(appShellChildren).toBeGreaterThan(zeroBranch);
    // Children are rendered in exactly ONE place:
    expect(gateSource.match(/<AppShell>/gu) ?? []).toHaveLength(1);
  });

  it("zero-access keeps children unmounted while redirecting", () => {
    const zeroBlock = gateSource.indexOf("if (zeroAuthorized) {");
    expect(zeroBlock).toBeGreaterThan(-1);
    expect(gateSource.slice(zeroBlock)).toMatch(
      /FullscreenLoader[\s\S]*?\}\s*return <AppShell>/u,
    );
  });
});

describe("snapshot holders die with the unmounted page", () => {
  it("branding hook disposes its controller on unmount", () => {
    const hookSource = readFileSync(
      new URL("../branding/use-branding.ts", import.meta.url),
      "utf8",
    );
    expect(hookSource).toContain("controller.dispose()");
  });

  it("subscription hook disposes its loader on identity change/unmount", () => {
    const hookSource = readFileSync(
      new URL("../subscription/use-subscription.ts", import.meta.url),
      "utf8",
    );
    expect(hookSource).toContain("loader.dispose()");
  });
});
