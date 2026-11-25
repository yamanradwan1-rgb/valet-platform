import assert from "node:assert/strict";
import test from "node:test";

import { postgresEndpointIdentity } from "./postgres-endpoint.mjs";

test("PostgreSQL endpoint matching ignores credentials and normalizes protocol, host casing and default port", () => {
  const first = postgresEndpointIdentity(
    "postgresql://runtime:hidden@LOCALHOST:5432/valet_mob007_auth_123_abc123ef",
  );
  const second = postgresEndpointIdentity(
    "postgres://writer:different@localhost/valet_mob007_auth_123_abc123ef",
  );
  assert.equal(first.key, second.key);
  assert.equal(first.port, 5432);
  assert.equal(first.host, "localhost");
  assert.equal(first.database, "valet_mob007_auth_123_abc123ef");
  assert.equal(first.key.includes("hidden"), false);
  assert.notEqual(
    first.key,
    postgresEndpointIdentity(
      "postgresql://runtime:hidden@localhost:60001/valet_mob007_auth_123_abc123ef",
    ).key,
  );
  assert.notEqual(
    first.key,
    postgresEndpointIdentity(
      "postgresql://runtime:hidden@localhost:5432/valet_mob007_auth_123_abc123ee",
    ).key,
  );
  assert.notEqual(
    first.key,
    postgresEndpointIdentity(
      "postgresql://runtime:hidden@127.0.0.1:5432/valet_mob007_auth_123_abc123ef",
    ).key,
  );
});

test("PostgreSQL endpoint matching rejects unsupported, malformed and unqualified targets without echoing secrets", () => {
  for (const input of [
    "mysql://sensitive:secret@localhost/valet",
    "postgresql://sensitive:secret@localhost/",
    "postgresql://sensitive:secret@localhost/valet?sslmode=require",
    "postgresql://sensitive:secret@localhost/valet#fragment",
    "postgresql://sensitive:secret@localhost/valet%2Fextra",
    "postgresql://sensitive:secret@localhost:99999/valet",
    "unparseable",
    undefined,
  ]) {
    assert.throws(
      () => postgresEndpointIdentity(input),
      (error) =>
        error instanceof Error &&
        /endpoint URL is (invalid|unsupported)/.test(error.message) &&
        !error.message.includes("secret"),
    );
  }
});
