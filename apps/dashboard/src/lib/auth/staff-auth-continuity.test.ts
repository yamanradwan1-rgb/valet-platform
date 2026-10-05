import { describe, expect, it, vi } from "vitest";
import { StaffAuthClient } from "./staff-auth-client";

const a = "88888888-8888-4888-8888-888888888888";
const b = "99999999-9999-4999-8999-999999999999";
const payload = (character: string) => ({
  accessToken: `vsa1.${character.repeat(43)}`,
  tokenType: "Bearer",
  accessExpiresAt: "2099-01-01T00:00:00.000Z",
  sessionExpiresAt: "2099-02-01T00:00:00.000Z",
});
const response = (sessionId: string | null, character: string) =>
  Response.json(payload(character), {
    headers:
      sessionId === null ? {} : { "X-Vaylet-Staff-Auth-Session-Id": sessionId },
  });
const credentials = { email: "same@example.com", password: "secret" };

describe("Dashboard logical auth session continuity", () => {
  it.each([null, "malformed", "uuid,uuid"])(
    "legacy/malformed metadata %s preserves token auth with no invented continuity",
    async (header) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response(header, "a"))
        .mockResolvedValueOnce(response(header, "b"));
      const client = new StaffAuthClient({ fetch: fetcher });
      await client.login(credentials);
      expect(client.getAccessToken()).toBe(payload("a").accessToken);
      expect(client.getStaffAuthSessionId()).toBeNull();
      expect(client.getSession()).not.toHaveProperty("staffAuthSessionId");
      await client.refresh();
      expect(client.getSessionGeneration()).toBe(2);
      expect(client.getIdentityGeneration()).toBe(1);
      expect(client.getStaffAuthSessionId()).toBeNull();
    },
  );
  it.each([null, "malformed"])(
    "loss of established header continuity %s retires identity without rejecting valid auth",
    async (header) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response(a, "a"))
        .mockResolvedValueOnce(response(header, "b"));
      const client = new StaffAuthClient({ fetch: fetcher });
      await client.login(credentials);
      await client.refresh();
      expect(client.getStaffAuthSessionId()).toBeNull();
      expect(client.getAccessToken()).toBe(payload("b").accessToken);
      expect(client.getIdentityGeneration()).toBe(2);
    },
  );
  it("same-session refresh advances sessionGeneration and preserves identity and public UUID", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(a, "a"))
      .mockResolvedValueOnce(response(a, "b"));
    const client = new StaffAuthClient({ fetch: fetcher });
    await client.login(credentials);
    const identity = client.getIdentityGeneration();
    await client.refresh();
    expect(client.getStaffAuthSessionId()).toBe(a);
    expect(client.getSessionGeneration()).toBe(2);
    expect(client.getIdentityGeneration()).toBe(identity);
    expect(client.getAccessToken()).toBe(payload("b").accessToken);
  });
  it("cookie selecting another logical session on refresh advances the identity fence", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(a, "a"))
      .mockResolvedValueOnce(response(b, "b"));
    const client = new StaffAuthClient({ fetch: fetcher });
    await client.login(credentials);
    await client.refresh();
    expect(client.getStaffAuthSessionId()).toBe(b);
    expect(client.getSessionGeneration()).toBe(2);
    expect(client.getIdentityGeneration()).toBe(2);
  });
  it("same User logging in again has different continuity even at identical expiry", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(a, "a"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(response(b, "b"));
    const client = new StaffAuthClient({ fetch: fetcher });
    await client.login(credentials);
    const expiry = client.getSession()!.sessionExpiresAt;
    await client.logout();
    expect(client.getStaffAuthSessionId()).toBeNull();
    await client.login(credentials);
    expect(client.getStaffAuthSessionId()).toBe(b);
    expect(client.getSession()!.sessionExpiresAt).toBe(expiry);
    expect(client.getIdentityGeneration()).toBe(3);
  });
});
