import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

/** Parse the shipped reader's actual SQL rather than maintaining a copy. */
export function extractSourceSql(): { sql: string; sha256: string } {
  const path = resolve(
    process.cwd(),
    "src/modules/dispatch/uncovered-task-alert-query.ts",
  );
  const source = readFileSync(path, "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  let sql: string | undefined;
  const walk = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(file) === "tx" &&
      node.expression.name.text === "query" &&
      ts.isNoSubstitutionTemplateLiteral(node.arguments[0]!)
    ) {
      assert.equal(sql, undefined, "Multiple inline reader SQL queries found");
      sql = node.arguments[0].text;
    }
    ts.forEachChild(node, walk);
  };
  walk(file);
  assert.ok(sql, "Expected reader query SQL");
  assert.ok(sql.includes("LEFT JOIN LATERAL") && sql.includes("LIMIT $8"));
  return { sql, sha256: createHash("sha256").update(sql).digest("hex") };
}

export interface PgExplainNode extends Record<string, unknown> {
  Plans?: PgExplainNode[];
}

export interface PgExplainResult {
  Plan: PgExplainNode;
  "Planning Time": number;
  "Execution Time": number;
}

export function planNodes(plan: PgExplainNode) {
  const nodes: Record<string, unknown>[] = [];
  const walk = (node: PgExplainNode): void => {
    nodes.push({
      node: node["Node Type"],
      relation: node["Relation Name"] ?? null,
      index: node["Index Name"] ?? null,
      join: node["Join Type"] ?? null,
      loops: node["Actual Loops"],
      rowsPerLoop: node["Actual Rows"],
      removedPerLoop: node["Rows Removed by Filter"] ?? 0,
      inclusiveSharedHits: node["Shared Hit Blocks"] ?? 0,
      inclusiveSharedReads: node["Shared Read Blocks"] ?? 0,
      actualTotalMsPerLoop: node["Actual Total Time"],
      sortMethod: node["Sort Method"] ?? null,
      sortSpaceKb: node["Sort Space Used"] ?? null,
      tempReadBlocks: node["Temp Read Blocks"] ?? 0,
      tempWrittenBlocks: node["Temp Written Blocks"] ?? 0,
    });
    for (const child of node.Plans ?? []) walk(child);
  };
  walk(plan);
  return nodes;
}
