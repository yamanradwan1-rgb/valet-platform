import { describe, expect, it } from "vitest";

import {
  advanceNestedMfaBridge,
  initialNestedMfaBridgeState,
  type NestedMfaEpoch,
} from "./use-nested-mfa-bridge";

function epoch(
  options: {
    readonly identity?: number;
    readonly location?: string;
    readonly path?: string;
    readonly revision?: number;
    readonly session?: number;
    readonly visit?: symbol;
  } = {},
): NestedMfaEpoch {
  const {
    identity = 1,
    location = "location-1",
    path = "/guest-information",
    revision = 1,
    session = 1,
    visit = Symbol("route visit"),
  } = options;
  const cycleKey = JSON.stringify([identity, session, location, path]);
  return { cycleKey, key: `${cycleKey}:${revision}`, revision, visit };
}

describe("nested protected-read MFA bridge", () => {
  it("opens one challenge for concurrent errors and ignores duplicate assurance", () => {
    const source = epoch();
    const open = advanceNestedMfaBridge(
      initialNestedMfaBridgeState,
      source,
      source,
      "required",
    );
    expect(open.challenge).toBe(source);
    expect(advanceNestedMfaBridge(open, source, source, "required")).toBe(open);

    const assured = advanceNestedMfaBridge(open, source, source, "assured");
    expect(assured.challenge).toBeNull();
    expect(assured.exhausted).toEqual({
      cycleKey: source.cycleKey,
      minimumRevision: 2,
      visit: source.visit,
    });
    expect(advanceNestedMfaBridge(assured, source, source, "assured")).toBe(
      assured,
    );
  });

  it("permits one post-assurance refetch but prevents a repeat-403 ceremony loop", () => {
    const visit = Symbol("same route visit");
    const before = epoch({ visit });
    const after = epoch({ visit, revision: 2 });
    const open = advanceNestedMfaBridge(
      initialNestedMfaBridgeState,
      before,
      before,
      "required",
    );
    const assured = advanceNestedMfaBridge(open, before, before, "assured");

    expect(advanceNestedMfaBridge(assured, before, before, "succeeded")).toBe(
      assured,
    );
    expect(advanceNestedMfaBridge(assured, after, after, "required")).toBe(
      assured,
    );
    expect(advanceNestedMfaBridge(assured, after, after, "assured")).toBe(
      assured,
    );

    const succeeded = advanceNestedMfaBridge(
      assured,
      after,
      after,
      "succeeded",
    );
    expect(succeeded.exhausted).toBeNull();
    expect(
      advanceNestedMfaBridge(succeeded, after, after, "required").challenge,
    ).toBe(after);
  });

  it("rejects old session and selected-Location events, including late onAssured", () => {
    const source = epoch();
    const open = advanceNestedMfaBridge(
      initialNestedMfaBridgeState,
      source,
      source,
      "required",
    );
    const replacementSession = epoch({ session: 2, visit: source.visit });
    const replacementLocation = epoch({
      location: "location-2",
      visit: source.visit,
    });
    const nextRevision = epoch({ revision: 2, visit: source.visit });

    for (const live of [
      replacementSession,
      replacementLocation,
      nextRevision,
    ]) {
      expect(advanceNestedMfaBridge(open, live, source, "required")).toBe(open);
      expect(advanceNestedMfaBridge(open, live, source, "assured")).toBe(open);
      expect(advanceNestedMfaBridge(open, live, source, "succeeded")).toBe(
        open,
      );
    }
  });

  it("fences a return to the same URL after an intermediate route visit", () => {
    const first = epoch({ visit: Symbol("first visit") });
    const returned = epoch({ visit: Symbol("return visit") });
    expect(first.key).toBe(returned.key);
    const open = advanceNestedMfaBridge(
      initialNestedMfaBridgeState,
      first,
      first,
      "required",
    );
    expect(advanceNestedMfaBridge(open, returned, first, "assured")).toBe(open);
    expect(advanceNestedMfaBridge(open, returned, first, "required")).toBe(
      open,
    );
    const current = advanceNestedMfaBridge(
      open,
      returned,
      returned,
      "required",
    );
    expect(current.challenge).toBe(returned);
  });

  it("allows another challenge when the staff session or scope legitimately changes", () => {
    const before = epoch();
    const original = advanceNestedMfaBridge(
      initialNestedMfaBridgeState,
      before,
      before,
      "required",
    );
    const blocked = advanceNestedMfaBridge(original, before, before, "assured");
    for (const next of [
      epoch({ session: 2, visit: before.visit }),
      epoch({ location: "new-location", visit: before.visit }),
      epoch({ identity: 2, visit: before.visit }),
      epoch({ path: "/another", visit: Symbol("new visit") }),
    ]) {
      expect(
        advanceNestedMfaBridge(blocked, next, next, "required").challenge,
      ).toBe(next);
    }
  });
});
