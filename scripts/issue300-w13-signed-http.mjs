import assert from "node:assert/strict";
import { URL } from "node:url";
import { generate } from "otplib";

export function createHttpClient(api, origin) {
  async function request(path, token, body, target = api) {
    assert(path.startsWith("/v1/staff/"), "Only staff API routes are allowed");
    const url = new URL(path, target);
    assert.equal(url.origin, target, "Refusing off-target URL");
    const response = await globalThis.fetch(url, {
      ...(body === undefined
        ? {}
        : { method: "POST", body: JSON.stringify(body) }),
      headers: {
        Origin: origin,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: "manual",
      signal: globalThis.AbortSignal.timeout(20_000),
    });
    assert.equal(
      response.url,
      url.href,
      "Unexpected HTTP redirect or proxy target",
    );
    const raw = await response.text();
    let json;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    return {
      status: response.status,
      json,
      cache: response.headers.get("cache-control"),
      sessionId: response.headers.get("x-vaylet-staff-auth-session-id"),
    };
  }
  return request;
}

export async function loginActualMfa(request, account) {
  const login = await request("/v1/staff/auth/login", null, {
    email: account.email,
    password: account.password,
  });
  assert.equal(login.status, 200, "Actual Argon2 Staff login failed");
  const token = login.json?.accessToken;
  assert.match(token ?? "", /^vsa1\.[A-Za-z0-9_-]{43}$/);
  assert.match(login.sessionId ?? "", /^[a-f0-9-]{36}$/i);
  if (account.mfaSecretBase32) {
    const code = await generate({
      strategy: "totp",
      algorithm: "sha1",
      digits: 6,
      period: 30,
      secret: account.mfaSecretBase32,
    });
    const stepped = await request("/v1/staff/auth/mfa/step-up", token, {
      code,
    });
    assert.equal(
      stepped.status,
      200,
      "Current Staff session MFA step-up failed",
    );
  } else {
    assert.equal(
      account.freshEnrollment,
      true,
      "MFA enrollment is allowed for isolated fresh accounts only",
    );
    const begin = await request(
      "/v1/staff/auth/mfa/enrollment/begin",
      token,
      {},
    );
    assert.equal(begin.status, 200, "Real MFA enrollment failed");
    const secret = begin.json?.provisioning?.secretBase32;
    assert.match(secret ?? "", /^[A-Z2-7]+$/);
    const code = await generate({
      strategy: "totp",
      algorithm: "sha1",
      digits: 6,
      period: 30,
      secret,
    });
    const confirmed = await request(
      "/v1/staff/auth/mfa/enrollment/confirm",
      token,
      { factorId: begin.json.factorId, code },
    );
    assert.equal(
      confirmed.status,
      200,
      "Actual TOTP enrollment confirmation failed",
    );
  }
  return { token, sessionId: login.sessionId };
}

export function pageIds(items, kind) {
  return kind === "timeline"
    ? items.map((item) => `${item.key?.source}:${item.key?.eventId}`)
    : items.map((item) => item.sessionId);
}

export async function firstPage(request, path, token) {
  const reply = await request(path, token);
  assert.equal(
    reply.status,
    200,
    "Guarded 503 and auth errors are not acceptance",
  );
  assert.equal(reply.cache, "no-store");
  assert(Array.isArray(reply.json?.items));
  assert.equal(typeof reply.json.snapshotAt, "string");
  assert(Number.isFinite(Date.parse(reply.json.snapshotAt)));
  assert(reply.json.items.length > 0 && reply.json.items.length <= 100);
  assert.equal(
    typeof reply.json.nextCursor,
    "string",
    "This scenario requires a genuine signed continuation cursor",
  );
  return reply.json;
}

export async function followPages(request, path, token, first, kind) {
  const all = [...first.items];
  const snapshot = first.snapshotAt;
  const coverage = first.coverage;
  let cursor = first.nextCursor;
  let pages = 1;
  while (cursor) {
    assert(++pages <= 1024, "Unbounded cursor pagination");
    const url = new URL(path, "http://127.0.0.1");
    url.searchParams.set("cursor", cursor);
    const reply = await request(url.pathname + url.search, token);
    assert.equal(reply.status, 200, "Continuation must stay authorized");
    assert.equal(reply.cache, "no-store");
    assert.equal(reply.json?.snapshotAt, snapshot, "S0 changed mid-pagination");
    assert.deepEqual(
      reply.json?.coverage,
      coverage,
      "Source coverage changed across a single signed snapshot",
    );
    assert(Array.isArray(reply.json.items));
    assert(reply.json.items.length <= 100);
    all.push(...reply.json.items);
    cursor = reply.json.nextCursor;
  }
  const ids = pageIds(all, kind);
  assert.equal(
    ids.length,
    new Set(ids).size,
    "Duplicate source or Session key",
  );
  return { ids, all, snapshot, pages, coverage };
}

export async function cursorSecurity(request, lane, token, foreignToken) {
  const first = await firstPage(request, lane.timelinePath, token);
  const cursor = first.nextCursor;
  const altered =
    cursor.slice(0, -2) + (cursor.at(-2) === "A" ? "B" : "A") + cursor.at(-1);
  const url = new URL(lane.timelinePath, "http://127.0.0.1");
  url.searchParams.set("cursor", altered);
  assert.notEqual(
    (await request(url.pathname + url.search, token)).status,
    200,
    "Tampered signed cursor accepted",
  );
  const changed = new URL(lane.searchPath, "http://127.0.0.1");
  changed.searchParams.set("cursor", cursor);
  assert.notEqual(
    (await request(changed.pathname + changed.search, token)).status,
    200,
    "Timeline cursor accepted for Search purpose",
  );
  url.searchParams.set("cursor", cursor);
  assert.notEqual(
    (await request(url.pathname + url.search, foreignToken)).status,
    200,
    "Foreign tenant accepted signed cursor",
  );
}
