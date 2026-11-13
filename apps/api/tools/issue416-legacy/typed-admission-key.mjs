// Isolated L1 planning contract; authoritative SQL identity is W2-owned.
// Never accept a caller-supplied surrogate, hash, or text collation as a key.
export const ADMISSION_RANK = Object.freeze({
  U: 9, O: 10, E: 10, M: 11, L: 11, G: 11,
  SS: 12, RC: 12, F: 13, C: 13, I: 14, R: 14, P: 14,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIENCE_RE = /^[a-z][a-z0-9_-]{1,63}$/;

function uuidBytes(value) {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error("L1_INVALID_UUID");
  }
  return Buffer.from(value.replaceAll("-", ""), "hex");
}

export function admissionKey({ audience, kind, ids }) {
  if (typeof audience !== "string" || !AUDIENCE_RE.test(audience)) {
    throw new Error("L1_INVALID_AUDIENCE");
  }
  if (!Object.hasOwn(ADMISSION_RANK, kind)) throw new Error("L1_UNKNOWN_KIND");
  if (!Array.isArray(ids) || ids.length !== (kind === "G" ? 3 : 1)) {
    throw new Error("L1_INVALID_KEY_CARDINALITY");
  }
  const bytes = Buffer.concat([
    Buffer.from([kind === "G" ? 0x02 : 0x01]),
    ...ids.map(uuidBytes),
  ]);
  const key = Object.freeze({
    audience,
    kind,
    // Hex is a lossless *offline display* of W2's binary key, not a DB ID.
    hex: bytes.toString("hex"),
    rank: ADMISSION_RANK[kind],
  });
  return key;
}

export function sameAdmissionKey(a, b) {
  return a?.audience === b?.audience && a?.kind === b?.kind &&
    a?.hex === b?.hex && a?.rank === b?.rank;
}

export function compareAdmissionKeys(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  // Match PostgreSQL byte/C lexical order, not machine-dependent locale rules.
  const kind = a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
  if (kind !== 0) return kind;
  return Buffer.compare(Buffer.from(a.hex, "hex"), Buffer.from(b.hex, "hex"));
}

export function admissionKeyId(key) {
  // Internal deterministic synthetic fixture locator; not privileged SQL data.
  if (!key || !Object.hasOwn(ADMISSION_RANK, key.kind) ||
      key.rank !== ADMISSION_RANK[key.kind] ||
      typeof key.hex !== "string" ||
      key.hex.length !== (key.kind === "G" ? 98 : 34) ||
      !/^[0-9a-f]+$/.test(key.hex) ||
      key.hex.slice(0, 2) !== (key.kind === "G" ? "02" : "01")) {
    throw new Error("L1_INVALID_TYPED_KEY");
  }
  return `${key.audience}:${key.kind}:${key.hex}`;
}
