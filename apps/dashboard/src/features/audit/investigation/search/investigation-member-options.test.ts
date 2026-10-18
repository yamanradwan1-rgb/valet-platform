import { describe, expect, it, vi } from "vitest";
import type { AuditInvestigationFilterResponse } from "@valet/contracts";

import type { InvestigationSearchTransport } from "./investigation-search-client";
import {
  loadInvestigationMemberOptions,
  MemberSelectorIntegrityError,
  MemberSelectorStaleError,
  searchInvestigationMembersByPrefix,
  readInvestigationMemberPage,
  type MemberOptionsReader,
} from "./investigation-member-options";
import { investigationSearchScopeKey } from "./investigation-search-scope";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = {
  organizationId: id(100),
  locationId: id(200),
  role: "LOCATION_MANAGER" as const,
  identityGeneration: 5,
  sessionGeneration: 8,
  selectionRevision: 3,
};
const scopeKey = investigationSearchScopeKey(scope);
const record = (n: number, label: string | null = `Member ${n}`) => ({
  id: id(n),
  currentLabel: {
    value: label,
    basis: "CURRENT" as const,
    unavailable: label === null,
  },
});
const fixture = (
  records: ReturnType<typeof record>[],
  nextCursor: string | null = null,
  hasMore = nextCursor !== null,
): AuditInvestigationFilterResponse => ({
  kind: "MEMBER",
  items: records,
  nextCursor,
  hasMore,
});

function harness() {
  const controller = new AbortController();
  let current = true;
  const onAuthReconciled = vi.fn();
  const context: InvestigationSearchTransport = {
    api: {} as InvestigationSearchTransport["api"],
    signal: controller.signal,
    scope,
    onAuthReconciled,
  };
  const request = { scopeKey, isScopeCurrent: () => current };
  return {
    context,
    request,
    controller,
    onAuthReconciled,
    revoke: () => {
      current = false;
      controller.abort();
    },
    switchScope: () => {
      current = false;
    },
  };
}

describe("Issue #300 W5 bounded MEMBER selector continuation", () => {
  it("makes exactly one 20-option signed request per explicit page, same prefix and cursor", async () => {
    const h = harness();
    const read = vi.fn<MemberOptionsReader>()
      .mockResolvedValueOnce(fixture(Array.from({ length: 20 }, (_, i) => record(i + 1)), "signedmembercursor_123", true))
      .mockResolvedValueOnce(fixture([record(21, "Duplicate"), record(22, "Duplicate")]));
    const first = await readInvestigationMemberPage(h.context, "Du", null, read);
    expect(read).toHaveBeenCalledTimes(1);
    expect(first.nextCursor).toBe("signedmembercursor_123");
    const second = await readInvestigationMemberPage(h.context, "Du", first.nextCursor, read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(second.options.map((row) => row.id)).toEqual([id(21), id(22)]);
    expect(read.mock.calls.map((call) => call[1])).toEqual([
      { kind: "MEMBER", text: "Du", limit: 20 },
      { kind: "MEMBER", text: "Du", limit: 20, cursor: "signedmembercursor_123" },
    ]);
  });
  it("never fabricates Next when incomplete server response omits a cursor", async () => {
    const h = harness();
    const read = vi.fn<MemberOptionsReader>().mockResolvedValue(
      fixture([record(1)], null, true));
    const first = await readInvestigationMemberPage(h.context, "A", null, read);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("loads 21+ canonical IDs over verified cursors with duplicate names and inactive members", async () => {
    const { context, request } = harness();
    const first = Array.from({ length: 20 }, (_, i) =>
      record(i + 1, i === 0 ? "Same Current Name" : `Member ${i + 1}`),
    );
    const second = [
      record(21, "Same Current Name"),
      record(22, null), // inactive membership without a current display label
      record(23, "Former employee"), // inactive still historically participated
    ];
    const read = vi
      .fn<MemberOptionsReader>()
      .mockResolvedValueOnce(fixture(first, "after20xx", true))
      .mockResolvedValueOnce(fixture(second));
    const result = await loadInvestigationMemberOptions(context, request, read);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw Error("Expected complete selector");
    expect(result.options).toHaveLength(23);
    expect(result.options[0]).toEqual({
      id: id(1),
      label: "Same Current Name",
    });
    expect(result.options[20]).toEqual({
      id: id(21),
      label: "Same Current Name",
    });
    expect(result.options[21]).toEqual({ id: id(22), label: id(22) });
    expect(result.options[22]).toEqual({
      id: id(23),
      label: "Former employee",
    });
    expect(new Set(result.options.map((option) => option.id)).size).toBe(23);
    expect(read.mock.calls.map(([, query]) => query)).toEqual([
      { kind: "MEMBER", limit: 20 },
      { kind: "MEMBER", limit: 20, cursor: "after20xx" },
    ]);
  });

  it("fails closed on current backend hasMore=true / nextCursor=null", async () => {
    const { context, request } = harness();
    const read = vi.fn<MemberOptionsReader>().mockResolvedValue(
      fixture(
        Array.from({ length: 20 }, (_, i) => record(i + 1)),
        null,
        true,
      ),
    );
    const result = await loadInvestigationMemberOptions(context, request, read);
    expect(result).toEqual({
      status: "incomplete",
      scopeKey,
      options: [],
      reason: "server-continuation-unavailable",
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("bounds even cursor-capable servers without emitting partial false directory choices", async () => {
    const { context, request } = harness();
    const first = Array.from({ length: 20 }, (_, i) => record(i + 1));
    const read = vi
      .fn<MemberOptionsReader>()
      .mockResolvedValue(fixture(first, "after20xx", true));
    expect(
      await loadInvestigationMemberOptions(
        context,
        { ...request, maxMembers: 20 },
        read,
      ),
    ).toEqual({
      status: "incomplete",
      scopeKey,
      options: [],
      reason: "limit-exceeded",
    });
    expect(read).toHaveBeenCalledTimes(1);
    await expect(
      loadInvestigationMemberOptions(
        context,
        { ...request, maxMembers: 201 },
        read,
      ),
    ).rejects.toThrow(RangeError);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("uses server text prefix without locally searching a truncated first page", async () => {
    const { context, request } = harness();
    const read = vi
      .fn<MemberOptionsReader>()
      .mockResolvedValue(fixture([record(21, "Former employee")]));
    const result = await searchInvestigationMembersByPrefix(
      context,
      { ...request, text: "Former" },
      read,
    );
    expect(result).toMatchObject({
      status: "complete",
      options: [{ id: id(21), label: "Former employee" }],
    });
    expect(read.mock.calls[0]?.[1]).toEqual({
      kind: "MEMBER",
      text: "Former",
      limit: 20,
    });
    expect(() =>
      searchInvestigationMembersByPrefix(
        context,
        { ...request, text: "" },
        read,
      ),
    ).toThrow(RangeError);
  });

  it("stops on scope change, abort and auth refresh even if backend ignores abort", async () => {
    const run = async (reason: "scope" | "abort" | "auth") => {
      const h = harness();
      let complete!: (value: AuditInvestigationFilterResponse) => void;
      let triggerAuth!: () => void;
      const reader: MemberOptionsReader = (ctx) => {
        triggerAuth = ctx.onAuthReconciled;
        return new Promise((resolve) => {
          complete = resolve;
        });
      };
      const active = loadInvestigationMemberOptions(
        h.context,
        h.request,
        reader,
      );
      if (reason === "scope") h.switchScope();
      if (reason === "abort") h.revoke();
      if (reason === "auth") triggerAuth();
      complete(fixture([record(1)]));
      await expect(active).rejects.toBeInstanceOf(MemberSelectorStaleError);
      expect(h.onAuthReconciled).toHaveBeenCalledTimes(
        reason === "auth" ? 1 : 0,
      );
    };
    await run("scope");
    await run("abort");
    await run("auth");
  });

  it("clears the entire pending directory when Location/grant changes during page two", async () => {
    const h = harness();
    let completeSecond!: (value: AuditInvestigationFilterResponse) => void;
    const reader = vi
      .fn<MemberOptionsReader>()
      .mockResolvedValueOnce(
        fixture(
          Array.from({ length: 20 }, (_, i) => record(i + 1)),
          "secondpage",
          true,
        ),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            completeSecond = resolve;
          }),
      );
    const loading = loadInvestigationMemberOptions(
      h.context,
      h.request,
      reader,
    );
    await vi.waitFor(() => expect(reader).toHaveBeenCalledTimes(2));
    h.switchScope();
    completeSecond(fixture([record(21)]));
    await expect(loading).rejects.toBeInstanceOf(MemberSelectorStaleError);
  });

  it("rejects duplicate IDs, cursor loops, unexpected types and unexpected scope", async () => {
    const h = harness();
    const readSame = vi
      .fn<MemberOptionsReader>()
      .mockResolvedValueOnce(fixture([record(1)], "cursor001", true))
      .mockResolvedValueOnce(fixture([record(1)]));
    await expect(
      loadInvestigationMemberOptions(h.context, h.request, readSame),
    ).rejects.toBeInstanceOf(MemberSelectorIntegrityError);
    const readCycle = vi
      .fn<MemberOptionsReader>()
      .mockResolvedValue(fixture([record(1)], "cursor001", true));
    await expect(
      loadInvestigationMemberOptions(h.context, h.request, readCycle),
    ).rejects.toBeInstanceOf(MemberSelectorIntegrityError);
    const readWrong: MemberOptionsReader = async () => ({
      ...fixture([record(1)]),
      kind: "KEY_SLOT",
    });
    await expect(
      loadInvestigationMemberOptions(h.context, h.request, readWrong),
    ).rejects.toThrow();
    await expect(
      loadInvestigationMemberOptions(
        h.context,
        { ...h.request, scopeKey: "other-location" },
        readCycle,
      ),
    ).rejects.toBeInstanceOf(MemberSelectorStaleError);
  });
});
