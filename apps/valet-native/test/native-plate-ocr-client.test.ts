import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeAuthSession } from "@valet/employee-client";
import { File } from "expo-file-system";
import { recognizeNativePlate } from "../src/check-in/native-plate-ocr-client";

vi.mock("expo-file-system", () => ({
  File: class {
    readonly name = "temporary.jpg";
    readonly type = "image/jpeg";
    constructor(readonly uri: string) {}
    async bytes() {
      return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    }
  },
}));
// Use the installed Expo serializer to reject unsupported URI-only file parts.
const { convertFormDataAsync } = await vi.importActual<{
  convertFormDataAsync(
    body: FormData,
  ): Promise<{ body: Uint8Array<ArrayBuffer>; boundary: string }>;
}>("expo/src/winter/fetch/convertFormData.ts");

class NativeFormData {
  readonly parts: Array<[string, unknown]> = [];
  append(key: string, value: unknown) {
    this.parts.push([key, value]);
  }
  entries() {
    return this.parts.values();
  }
}
const metadata = {
  targetLocationId: "11111111-1111-4111-8111-111111111111",
  plateCountry: "JO",
};
function setup() {
  let generation = 1;
  const loss = vi.fn();
  const refresh = vi.fn();
  const auth = {
    current: () => ({ authGeneration: generation }),
    getAccessToken: () => "test-access-only",
    refresh,
    handleDefinitiveAuthorizationLoss: loss,
  } as unknown as NativeAuthSession;
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ status: "NO_MATCH" })));
  vi.stubGlobal("fetch", http);
  return {
    http,
    loss,
    refresh,
    switchIdentity: () => {
      generation++;
    },
    run: (signal = new AbortController().signal) =>
      recognizeNativePlate(
        "http://localhost:3001",
        auth,
        metadata,
        "cache://temporary.jpg",
        signal,
      ),
  };
}
beforeEach(() => {
  vi.stubGlobal("__DEV__", true);
  vi.stubGlobal("FormData", NativeFormData);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("Native OCR Staff transport", () => {
  it("uploads a transient JPEG only to VAYLET with current bearer and no JSON/base64", async () => {
    const c = setup();
    expect(await c.run()).toEqual({ status: "NO_MATCH" });
    const [url, options] = c.http.mock.calls[0]!;
    expect(url).toBe("http://localhost:3001/v1/staff/check-in/plate-ocr");
    expect(options).toMatchObject({
      method: "POST",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer test-access-only",
      },
    });
    expect(
      (options?.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();
    expect((options?.body as unknown as NativeFormData).parts).toEqual([
      ["targetLocationId", metadata.targetLocationId],
      ["plateCountry", "JO"],
      ["image", new File("cache://temporary.jpg")],
    ]);
  });
  it("serializes the captured JPEG bytes with Expo fetch multipart encoding", async () => {
    const c = setup();
    c.http.mockImplementationOnce(async (_url, options) => {
      const { body, boundary } = await convertFormDataAsync(
        options?.body as FormData,
      );
      const uploaded = await new Response(body, {
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
      }).formData();
      expect(uploaded.getAll("targetLocationId")).toEqual([
        metadata.targetLocationId,
      ]);
      expect(uploaded.getAll("plateCountry")).toEqual(["JO"]);
      expect(uploaded.getAll("image")).toHaveLength(1);
      const image = uploaded.getAll("image")[0] as unknown as Blob;
      expect(image.type).toBe("image/jpeg");
      expect(new Uint8Array(await image.arrayBuffer())).toEqual(
        new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      );
      return new Response(JSON.stringify({ status: "NO_MATCH" }));
    });
    expect(await c.run()).toEqual({ status: "NO_MATCH" });
    expect(c.http).toHaveBeenCalledOnce();
  });
  it("recovers authentication after POST 401 without replaying the upload", async () => {
    const c = setup();
    c.http.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await expect(c.run()).rejects.toMatchObject({ status: 401 });
    expect(c.http).toHaveBeenCalledOnce();
    expect(c.refresh).toHaveBeenCalledOnce();
    expect(c.loss).not.toHaveBeenCalled();
  });
  it.each([403, 404, 500, 503])(
    "does not log out or queue a replay on %s",
    async (status) => {
      const c = setup();
      c.http.mockResolvedValueOnce(new Response("{}", { status }));
      await expect(c.run()).rejects.toMatchObject({ status });
      expect(c.loss).not.toHaveBeenCalled();
      expect(c.http).toHaveBeenCalledOnce();
    },
  );
  it("ignores a result returned after identity replacement", async () => {
    const c = setup();
    let done!: (response: Response) => void;
    c.http.mockReturnValueOnce(
      new Promise((resolve) => {
        done = resolve;
      }),
    );
    const pending = c.run();
    c.switchIdentity();
    done(
      new Response(
        JSON.stringify({
          status: "MATCH",
          candidate: { plateNumberRaw: "OLD", confidence: 1 },
        }),
      ),
    );
    expect(await pending).toEqual({ status: "UNAVAILABLE" });
    expect(c.loss).not.toHaveBeenCalled();
  });
  it("does not start cancelled uploads and aborts active transport", async () => {
    const c = setup();
    const controller = new AbortController();
    controller.abort();
    expect(await c.run(controller.signal)).toEqual({ status: "UNAVAILABLE" });
    expect(c.http).not.toHaveBeenCalled();
    c.http.mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const active = new AbortController();
    const pending = c.run(active.signal);
    const rejected = expect(pending).rejects.toBeDefined();
    active.abort();
    await rejected;
    expect(c.loss).not.toHaveBeenCalled();
  });
  it("bounds network time and validates untrusted responses", async () => {
    const c = setup();
    c.http.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "MATCH",
          candidate: { plateNumberRaw: "x", confidence: 2 },
        }),
      ),
    );
    await expect(c.run()).rejects.toBeDefined();
    vi.useFakeTimers();
    c.http.mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new Error("timeout")),
          );
        }),
    );
    const rejected = expect(c.run()).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    expect(c.loss).not.toHaveBeenCalled();
  });
});
