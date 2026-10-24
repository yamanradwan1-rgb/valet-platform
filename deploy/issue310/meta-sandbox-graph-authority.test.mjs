import assert from "node:assert/strict";
import test from "node:test";
import { verifyIssue310MetaAssets } from "./meta-sandbox-graph-authority.mjs";

const template = (id, language) => ({
  id,
  language,
  name: "guest_access",
  status: "APPROVED",
  category: "UTILITY",
  components: [{ type: "BODY", text: "Open the access URL {{1}}" }],
});

function mockGraph(options = {}) {
  const phones = options.phones ?? [{ id: "1426684017189271" }];
  const templates = options.templates ?? [
    template("2003500221022564", "ar"),
    template("28615795824783341", "en_US"),
  ];
  return async (url, request) => {
    assert.equal(url.origin, "https://graph.facebook.com");
    assert.ok(url.pathname.startsWith("/v26.0/3491682417667249/"));
    assert.equal(request.redirect, "error");
    assert.ok(request.headers.authorization.startsWith("Bearer "));
    if (options.httpStatus) return { ok: false, status: options.httpStatus };
    return {
      ok: true,
      json: async () => ({
        data: url.pathname.endsWith("/phone_numbers") ? phones : templates,
      }),
    };
  };
}

test("the real Meta Graph catalog must prove sandbox phone plus two exact templates", async () => {
  const proof = await verifyIssue310MetaAssets(mockGraph(), "synthetic-test-only-credential");
  assert.equal(proof.wabaId, "3491682417667249");
  assert.equal(proof.phoneNumberId, "1426684017189271");
  assert.deepEqual(proof.templateIds, ["2003500221022564", "28615795824783341"]);
  assert.equal(proof.catalogVersion, "meta_guest_access_20261024");
  assert.ok(Number.isFinite(Date.parse(proof.verifiedAt)));
  assert.equal(JSON.stringify(proof).includes("synthetic-test-only-credential"), false);
});

test("an unowned sandbox Phone Number ID is rejected", async () => {
  await assert.rejects(verifyIssue310MetaAssets(mockGraph({
    phones: [{ id: "999999999" }],
  }), "synthetic-test-only-credential"), /does not bind/);
});

test("incorrect English template identity is rejected", async () => {
  await assert.rejects(verifyIssue310MetaAssets(mockGraph({
    templates: [template("2003500221022564", "ar"), template("1234", "en_US")],
  }), "synthetic-test-only-credential"), /en_US/);
});

test("wrong outgoing Meta language is rejected", async () => {
  await assert.rejects(verifyIssue310MetaAssets(mockGraph({
    templates: [template("2003500221022564", "ar"),
      template("28615795824783341", "en")],
  }), "synthetic-test-only-credential"), /en_US/);
});

test("unapproved template is rejected", async () => {
  const arabic = { ...template("2003500221022564", "ar"), status: "PENDING" };
  await assert.rejects(verifyIssue310MetaAssets(mockGraph({
    templates: [arabic, template("28615795824783341", "en_US")],
  }), "synthetic-test-only-credential"), /ar/);
});

test("two body variables and buttons are independently rejected", async () => {
  for (const components of [
    [{ type: "BODY", text: "{{1}} {{2}}" }],
    [{ type: "BODY", text: "{{1}}" }, { type: "BUTTONS", buttons: [] }],
  ]) {
    await assert.rejects(verifyIssue310MetaAssets(mockGraph({
      templates: [{ ...template("2003500221022564", "ar"), components },
        template("28615795824783341", "en_US")],
    }), "synthetic-test-only-credential"), /ar/);
  }
});

test("a failed Graph read remains closed and does not reveal credential", async () => {
  await assert.rejects(verifyIssue310MetaAssets(mockGraph({ httpStatus: 403 }),
    "synthetic-test-only-credential"), (error) =>
    error.message.includes("403") &&
    !error.message.includes("synthetic-test-only-credential"));
});
