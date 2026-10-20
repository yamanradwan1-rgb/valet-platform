import assert from "node:assert/strict";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const gitSha = /^[a-f0-9]{40}$/;

export const browserCases = Object.freeze([
  "T56/T57/T58/T70: actual authorized UI pagination and failure recovery",
  "T49/T60: the ordinary Audit Events tab retains separate read authority",
  ...["en", "ar"].flatMap(locale =>
    ["light", "dark"].flatMap(theme =>
      [320, 390, 768, 1440].flatMap(width =>
        [100, 200].map(zoom =>
          `UI-M1 authentic ${locale}/${theme}/${width}px/${zoom}%`)))),
]);

// Playwright CLI grep sees the full title path: project/file, describe(title),
// test(title). safeOneTimeCase deliberately uses the title twice. A single
// ^title$ regex silently selects zero tests, which must never look like PASS.
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function playwrightFullTitleGrep(title) {
  assert(browserCases.includes(title), "W18_UNKNOWN_PLAYWRIGHT_CASE");
  const escaped = escapeRegex(title);
  return `(?:^|\\s)${escaped}\\s+${escaped}$`;
}

export function validateBrowserScenario(scenario, candidate, lease, scope) {
  assert.match(candidate ?? "", gitSha);
  assert.match(lease ?? "", /^issue300-r2-[a-z0-9-]{8,}$/);
  assert.equal(scenario?.candidateSha, candidate);
  assert.equal(scenario.leaseId, lease);
  assert.equal(scenario.auditPath, "/audit-log?investigationDemo=1");
  assert.match(scenario.expectedSessionUuid ?? "", uuid);
  assert.match(scenario.expectedSourceId ?? "",
    /^(AUDIT|KEY_CUSTODY|DISPATCH|INCIDENT):[0-9a-f-]{36}$/i);
  assert.equal(scenario.expectsPaging, true,
    "W18_BOTH_FIRST_AND_SIGNED_NEXT_PAGES_REQUIRED");
  assert.match(scenario.date ?? "", /^\d{4}-\d{2}-\d{2}$/);
  assert.match(scenario.start ?? "", /^\d{2}:\d{2}$/);
  assert.match(scenario.end ?? "", /^\d{2}:\d{2}$/);
  assert(scope?.organizationId && scope?.locationId);
  assert.equal(scenario.organizationId, scope.organizationId);
  assert.equal(scenario.locationId, scope.locationId);
  assert.equal(browserCases.length, 34);
  return true;
}

export function caseRunPlan(scenario, candidate, lease, scope) {
  validateBrowserScenario(scenario, candidate, lease, scope);
  // Every element is a separate browser run and MUST have separately minted
  // fresh MFA assurance/storageState + an Owner-issued signed browser target.
  return browserCases.map((title, index) => ({
    ordinal: index + 1,
    title,
    freshMfaSessionRequired: true,
    freshOwnerAttestationRequired: true,
    browserOrigin: "http://127.0.0.1:3117",
    enabledApiOrigin: "http://127.0.0.1:3167",
    defaultApiOrigin: "http://127.0.0.1:3168",
    command: [
      "pnpm", "--filter", "@valet/dashboard", "exec", "playwright", "test",
      "--config", "playwright.runtime.config.ts",
      "issue300-closure.spec.ts",
      "--project", "chromium",
      "--workers", "1",
      "--grep", playwrightFullTitleGrep(title),
    ],
  }));
}
