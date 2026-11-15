import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { sha256 } from "./catalog.mjs";

function staticSql(expression) {
  if (!expression) return null;
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (ts.isTemplateExpression(expression)) {
    return (
      expression.head.text +
      expression.templateSpans
        .map((part) => " __DYNAMIC__ " + part.literal.text)
        .join("")
    );
  }
  return null;
}

function sqlGrant(sql) {
  // SQL is extracted from the parsed JS literal, never from comments.
  // Unknown GRANT interpolation is a failure, never a safe interpretation.
  const compact = sql.replace(/\s+/g, " ").trim();
  if (!/\bGRANT\b/i.test(compact)) return null;
  if (
    /\bGRANT\s+(?:ALL(?:\s+PRIVILEGES)?|(?:SELECT\s*,\s*)?(?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER))\b/i.test(
      compact,
    )
  ) {
    return "LEGACY_OR_UNCLASSIFIED_TABLE_WRITE_GRANT";
  }
  if (/\bGRANT\s+EXECUTE\s+ON\s+FUNCTION\b/i.test(compact)) {
    return "LEGACY_OR_UNCLASSIFIED_FUNCTION_EXECUTE_GRANT";
  }
  if (/\bGRANT\s+__DYNAMIC__\b/i.test(compact))
    return "UNRESOLVED_DYNAMIC_GRANT";
  return null;
}

function parseModule(file, scriptsRoot, cache, problems) {
  if (cache.has(file)) return cache.get(file);
  const content = readFileSync(file, "utf8");
  const syntax = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  if (syntax.parseDiagnostics.length) {
    problems.push({
      code: "INVALID_PROVISIONER_AST",
      file: relative(scriptsRoot, file),
    });
  }
  const module = {
    file,
    content,
    functions: new Map(),
    imports: new Map(),
    syntax,
  };
  cache.set(file, module);
  for (const node of syntax.statements) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      module.functions.set(node.name.text, node);
    }
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          module.functions.set(declaration.name.text, declaration.initializer);
        }
      }
    }
    if (!ts.isImportDeclaration(node)) continue;
    const literal = node.moduleSpecifier;
    if (!ts.isStringLiteral(literal) || !literal.text.startsWith(".")) continue;
    const importPath = resolve(dirname(file), literal.text);
    if (
      !importPath.startsWith(scriptsRoot + sep) ||
      !importPath.endsWith(".mjs")
    ) {
      problems.push({
        code: "UNEXPECTED_LOCAL_IMPORT",
        file: relative(scriptsRoot, file),
      });
      continue;
    }
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      problems.push({
        code: "UNRESOLVED_IMPORT_BINDING",
        file: relative(scriptsRoot, file),
      });
      continue;
    }
    for (const item of bindings.elements) {
      module.imports.set(item.name.text, {
        file: importPath,
        name: item.propertyName?.text ?? item.name.text,
      });
    }
  }
  return module;
}

function containsRootInvocation(module) {
  return module.syntax.statements.some((statement) => {
    let invoked = false;
    const walk = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "provisionRuntimeRole"
      )
        invoked = true;
      // Never let a mention inside a function body count as top-level invocation.
      if (!ts.isFunctionDeclaration(node)) ts.forEachChild(node, walk);
    };
    walk(statement);
    return invoked;
  });
}

const securityProvisioners =
  /(?:^|\/)(?:mfa-runtime|staff-management-runtime|staff-onboarding-runtime|staff-push-runtime|shift-force-end-runtime|shift-presence-runtime|location-lifecycle-runtime|management-settings-runtime|basic-branding-runtime|audit-foundation-runtime|runtime-table)-privileges\.mjs$/;
const protectedTable =
  /\b(?:staff_auth_sessions|staff_refresh_credentials|user_mfa_totp_factors|mfa_recovery_codes|staff_push_registrations|organization_memberships|membership_location_access|anti_abuse_events|users)\b/i;

export function inspectProvisioner(repo) {
  const scriptsRoot = resolve(repo, "packages/database/scripts");
  const rootFile = join(scriptsRoot, "provision-runtime-role.mjs");
  const cache = new Map();
  const problems = [];
  const grants = [];
  const reachable = [];
  const visited = new Set();
  const module = parseModule(rootFile, scriptsRoot, cache, problems);
  if (!containsRootInvocation(module))
    problems.push({ code: "PROVISIONER_ROOT_NOT_INVOKED" });

  const visit = (file, name, chain) => {
    const key = file + ":" + name;
    if (visited.has(key)) return;
    visited.add(key);
    const current = parseModule(file, scriptsRoot, cache, problems);
    const declaration = current.functions.get(name);
    if (!declaration) {
      problems.push({
        code: "UNRESOLVED_PROVISIONER_CALL",
        caller: chain.at(-1),
        callee: name,
      });
      return;
    }
    const location = relative(scriptsRoot, file).replaceAll("\\", "/");
    const nextChain = [...chain, location + ":" + name];
    reachable.push(nextChain);
    const calls = [];
    const collect = (node) => {
      if (ts.isCallExpression(node)) calls.push(node);
      ts.forEachChild(node, collect);
    };
    collect(declaration.body ?? declaration);
    for (const call of calls) {
      const callee = call.expression;
      const isFormatted =
        ts.isIdentifier(callee) && callee.text === "executeFormatted";
      const isQuery =
        ts.isPropertyAccessExpression(callee) && callee.name.text === "query";
      if (isFormatted || isQuery) {
        const sql = staticSql(call.arguments[isFormatted ? 1 : 0]);
        if (sql === null) {
          problems.push({
            code: "NONSTATIC_PROVISIONER_SQL",
            at:
              location +
              ":" +
              current.syntax.getLineAndCharacterOfPosition(call.getStart())
                .line,
          });
        } else {
          const risk = sqlGrant(sql);
          if (risk) {
            grants.push({
              code: risk,
              location:
                location +
                ":" +
                (current.syntax.getLineAndCharacterOfPosition(call.getStart())
                  .line +
                  1),
              chain: nextChain,
              sql: sql.replace(/\s+/g, " ").slice(0, 180),
              scope:
                securityProvisioners.test(location) || protectedTable.test(sql)
                  ? "ISSUE416_AUTHORITY"
                  : "OTHER_RUNTIME_CAPABILITY",
            });
          }
        }
      }
      if (ts.isIdentifier(callee)) {
        const imported = current.imports.get(callee.text);
        if (imported) visit(imported.file, imported.name, nextChain);
        else if (current.functions.has(callee.text))
          visit(file, callee.text, nextChain);
      }
      if (ts.isCallExpression(callee) || ts.isElementAccessExpression(callee)) {
        problems.push({ code: "INDIRECT_PROVISIONER_CALL", location });
      }
    }
  };
  visit(rootFile, "provisionRuntimeRole", []);
  const files = [...cache.values()]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map((item) => ({
      file: relative(repo, item.file).replaceAll("\\", "/"),
      sha256: sha256(item.content),
    }));
  const chain = (needle) =>
    reachable.find((route) => route.at(-1).endsWith(":" + needle));
  for (const required of [
    "provisionRuntimeTablePrivileges",
    "provisionMfaPrivileges",
    "provisionShiftForceEndPrivileges",
    "provisionStaffOnboardingPrivileges",
    "provisionStaffManagementPrivileges",
  ]) {
    if (!chain(required))
      problems.push({
        code: "UNRESOLVED_EXPECTED_PROVISIONER_EDGE",
        function: required,
      });
  }
  const summary = { files, reachable, grants, problems };
  return {
    ...summary,
    securityGrants: grants.filter(
      ({ scope }) => scope === "ISSUE416_AUTHORITY",
    ),
    digest: sha256(JSON.stringify(summary)),
  };
}
