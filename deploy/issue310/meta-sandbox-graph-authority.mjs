const graphOrigin = "https://graph.facebook.com";
const graphVersion = "v26.0";
const wabaId = "3491682417667249";
const phoneNumberId = "1426684017189271";
const requiredTemplates = [
  { id: "2003500221022564", language: "ar" },
  { id: "28615795824783341", language: "en_US" },
];

async function graphCollection(fetchImpl, credential, edge, fields) {
  const entries = [];
  const seenCursors = new Set();
  let cursor;
  for (let page = 0; page < 5; page += 1) {
    const url = new URL(`${graphOrigin}/${graphVersion}/${wabaId}/${edge}`);
    url.searchParams.set("fields", fields);
    url.searchParams.set("limit", "100");
    if (cursor !== undefined) url.searchParams.set("after", cursor);
    const response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${credential}` },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Meta Graph ${edge} read rejected (HTTP ${response.status}).`);
    }
    const result = await response.json();
    if (!result || !Array.isArray(result.data) || result.data.length > 100) {
      throw new Error(`Meta Graph ${edge} data shape is invalid.`);
    }
    entries.push(...result.data);
    if (!result.paging?.next) return entries;
    const next = result.paging?.cursors?.after;
    if (typeof next !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(next) ||
        seenCursors.has(next)) {
      throw new Error("Meta Graph pagination authority is invalid.");
    }
    seenCursors.add(next);
    cursor = next;
  }
  throw new Error("Meta Graph evidence exceeds the bounded sandbox catalog.");
}

function approvedSingleBodyUrl(template) {
  if (template?.name !== "guest_access" || template.status !== "APPROVED" ||
      template.category !== "UTILITY" || !Array.isArray(template.components)) {
    return false;
  }
  const bodies = template.components.filter((part) => part?.type === "BODY");
  if (bodies.length !== 1 || typeof bodies[0].text !== "string" ||
      template.components.some((part) => part?.type === "BUTTONS")) return false;
  const variables = bodies[0].text.match(/\{\{[0-9]+\}\}/g) ?? [];
  const otherVariables = template.components
    .filter((part) => part?.type !== "BODY")
    .flatMap((part) => typeof part?.text === "string"
      ? (part.text.match(/\{\{[0-9]+\}\}/g) ?? []) : []);
  return variables.length === 1 && variables[0] === "{{1}}" &&
    otherVariables.length === 0;
}

/** Return only non-secret facts proven through a bearer-authorized Meta Graph read. */
export async function verifyIssue310MetaAssets(fetchImpl, credential) {
  if (typeof credential !== "string" || credential.length < 20 ||
      credential.length > 4096 || /\s/.test(credential)) {
    throw new Error("The temporary sender-only Meta credential is unavailable.");
  }
  const phones = await graphCollection(fetchImpl, credential, "phone_numbers", "id");
  if (!phones.some((phone) => phone?.id === phoneNumberId)) {
    throw new Error("Meta Graph does not bind the approved sandbox phone to this WABA.");
  }
  const templates = await graphCollection(fetchImpl, credential, "message_templates",
    "id,name,language,status,category,components");
  for (const required of requiredTemplates) {
    const matches = templates.filter((item) => item?.id === required.id &&
      item?.language === required.language);
    if (matches.length !== 1 || !approvedSingleBodyUrl(matches[0])) {
      throw new Error(`Meta Graph does not prove the required ${required.language} template.`);
    }
  }
  return {
    version: "wa310-meta-graph-evidence-v1",
    verifiedAt: new Date().toISOString(),
    wabaId,
    phoneNumberId,
    templateIds: requiredTemplates.map((item) => item.id),
    catalogVersion: "meta_guest_access_20261024",
  };
}
