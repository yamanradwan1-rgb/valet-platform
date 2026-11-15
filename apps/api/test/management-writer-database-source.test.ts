import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("management writer database bootstrap SQL", () => {
  it("uses a non-reserved pg_auth_members alias", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/modules/management/management-writer-database.module.ts"),
      "utf8",
    );
    expect(source).toContain("FROM pg_auth_members AS membership");
    expect(source).toContain("WHERE membership.member=role.oid");
    expect(source).not.toContain("FROM pg_auth_members AS grant");
  });
});
