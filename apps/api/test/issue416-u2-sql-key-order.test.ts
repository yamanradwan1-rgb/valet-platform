import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { U2_STATE_GROUPS } from "../src/modules/auth/vap1-typed/u2-state-schema";

const migration136 = readFileSync(
  resolve(
    process.cwd(),
    "../../packages/database/prisma/migrations/20261113013600_issue416_vap1_state_codec/migration.sql",
  ),
  "utf8",
);

describe("Issue416 private U2 SQL row key ordering", () => {
  it("matches every closed Node class-defined key index without nullable authority", () => {
    const cases = [
      ...migration136.matchAll(/WHEN\s+(\d+)\s+THEN\s+ARRAY\[([\d,\s]+)\]/g),
    ];
    const sqlKeys = new Map(
      cases.map((item) => [
        Number(item[1]),
        item[2]!.split(",").map((value) => Number(value.trim())),
      ]),
    );
    const classes = Object.entries(U2_STATE_GROUPS);
    expect([...sqlKeys.keys()]).toEqual(
      classes.map(([group]) => Number(group)),
    );

    for (const [group, schema] of classes) {
      expect(sqlKeys.get(Number(group))).toEqual(
        schema.keyIndices.map((index) => index + 1),
      );
      for (const index of schema.keyIndices) {
        expect(schema.attributes[index]?.nullable).not.toBe(true);
      }
    }
  });

  it("rejects sorting whole TLV records instead of extracted raw key bytes", () => {
    expect(migration136).toMatch(
      /v_key := auth_proof_private\.state_row_sort_key\(p_group,v_row\)/,
    );
    expect(migration136).toMatch(
      /v_prev_key IS NOT NULL AND v_key <= v_prev_key/,
    );
    expect(migration136).not.toMatch(/v_row <= v_prev/);
    expect(migration136).toMatch(
      /REVOKE ALL ON FUNCTION auth_proof_private\.state_row_sort_key\(integer,bytea\) FROM PUBLIC/,
    );
  });
});
