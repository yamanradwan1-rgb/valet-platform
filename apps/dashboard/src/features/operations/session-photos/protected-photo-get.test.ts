import { describe, expect, it, vi } from "vitest";
import { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

function auth() {
  let identityGeneration = 1;
  let sessionGeneration = 2;
  return {
    provider: {
      getAccessToken: () => "private-token",
      getIdentityGeneration: () => identityGeneration,
      getSessionGeneration: () => sessionGeneration,
      isTokenFresh: () => true,
      refresh: vi.fn(async () => { throw new Error("refresh disabled"); }),
    },
    revoke: () => { sessionGeneration++; identityGeneration++; },
  };
}

describe("#309 DashboardApiClient private binary GET", () => {
  it("sends a fenced credentialed, no-store GET without a JSON body and accepts protected JPEG without filename", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
    const client = new DashboardApiClient({ auth: auth().provider, fetch: fetcher });
    const response = await client.requestBinary("/protected", { method: "GET", expectedContentType: "image/jpeg" });
    expect(response.contentType).toBe("image/jpeg");
    expect(response.bytes).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = fetcher.mock.calls[0]?.[1];
    expect(init).toMatchObject({ method: "GET", credentials: "include", cache: "no-store" });
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toMatchObject({ Authorization: "Bearer private-token", Accept: "image/jpeg" });
    expect(init?.headers).not.toHaveProperty("Content-Type");
  });

  it("discards private bytes if the auth generation changes before response completion", async () => {
    const state = auth();
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const client = new DashboardApiClient({ auth: state.provider, fetch: fetcher });
    const promise = client.requestBinary("/protected", { method: "GET", expectedContentType: "image/jpeg" });
    await Promise.resolve();
    state.revoke();
    finish(new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { status: 200, headers: { "Content-Type": "image/jpeg" } }));
    await expect(promise).rejects.toMatchObject({ code: "AUTH_STATE_CHANGED" });
  });
});
