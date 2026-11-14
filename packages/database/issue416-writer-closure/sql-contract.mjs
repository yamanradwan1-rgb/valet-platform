import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./catalog.mjs";

// Lexing intentionally discards comments, quoted strings and function bodies:
// a function NAME inside a comment/PLpgSQL literal is not an installed definition.
export function sqlCode(sql) {
  let output = "";
  for (let i = 0; i < sql.length;) {
    if (sql.startsWith("--", i)) {
      const next = sql.indexOf("\n", i + 2);
      i = next < 0 ? sql.length : next;
      output += " ";
      continue;
    }
    if (sql.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) {
          depth++;
          i += 2;
        } else if (sql.startsWith("*/", i)) {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth) throw new Error("SQL_UNTERMINATED_COMMENT");
      output += " ";
      continue;
    }
    if (sql[i] === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i++] === "'") break;
      }
      if (sql[i - 1] !== "'") throw new Error("SQL_UNTERMINATED_STRING");
      output += " ?";
      continue;
    }
    if (sql[i] === "$") {
      const tag = sql.slice(i).match(/^\$[a-zA-Z_0-9]*\$/)?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        if (end < 0) throw new Error("SQL_UNTERMINATED_DOLLAR_BODY");
        i = end + tag.length;
        output += " ?";
        continue;
      }
    }
    if (sql[i] === '"') {
      const start = i++;
      while (i < sql.length && (sql[i] !== '"' || sql[i + 1] === '"')) {
        i += sql[i] === '"' ? 2 : 1;
      }
      if (i >= sql.length) throw new Error("SQL_UNTERMINATED_IDENTIFIER");
      output += sql.slice(start + 1, i).replaceAll('""', '"');
      i++;
      continue;
    }
    output += sql[i++];
  }
  return output;
}

export function definedProofFunctions(sql) {
  const code = sqlCode(sql);
  const found = [];
  const expression =
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(vap1_(?:prepare|execute)_[a-z0-9_]+)\s*\(/gi;
  for (const match of code.matchAll(expression)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    for (; end < code.length && depth; end++) {
      if (code[end] === "(") depth++;
      else if (code[end] === ")") depth--;
    }
    if (depth) throw new Error("SQL_UNTERMINATED_FUNCTION_SIGNATURE");
    found.push({
      name: match[1].toLowerCase(),
      arguments: code
        .slice(start, end - 1)
        .replace(/\s+/g, " ")
        .trim(),
    });
  }
  return found;
}

export function inspectMigrations(repo) {
  const root = join(repo, "packages/database/prisma/migrations");
  const directoryNames = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const definitions = [];
  const hashes = [];
  const problems = [];
  for (const name of directoryNames) {
    const pathname = join(root, name, "migration.sql");
    let content;
    try {
      content = readFileSync(pathname, "utf8");
    } catch {
      problems.push({ code: "MISSING_MIGRATION", migration: name });
      continue;
    }
    const digest = sha256(content);
    hashes.push([name, digest]);
    try {
      for (const definition of definedProofFunctions(content)) {
        definitions.push({ ...definition, migration: name });
      }
    } catch (error) {
      problems.push({
        code: "UNPARSEABLE_SQL",
        migration: name,
        reason: String(error.message),
      });
    }
  }
  const counts = new Map();
  for (const def of definitions)
    counts.set(def.name, (counts.get(def.name) ?? 0) + 1);
  return {
    definitions,
    problems,
    digest: sha256(JSON.stringify(hashes)),
    duplicateDefinitions: [...counts]
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
  };
}
