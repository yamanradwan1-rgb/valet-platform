import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { sha256 } from "./catalog.mjs";

const families = Object.freeze([
  [
    "staff-management-runtime-privileges.mjs",
    "runtimeStaffManagementFunctions",
    3,
    "M01-M03",
  ],
  [
    "staff-onboarding-runtime-privileges.mjs",
    "runtimeStaffOnboardingFunctions",
    3,
    "M04-M06",
  ],
  [
    "shift-force-end-runtime-privileges.mjs",
    "runtimeShiftForceEndFunction",
    1,
    "X01",
  ],
  [
    "location-lifecycle-runtime-privileges.mjs",
    "runtimeLocationLifecycleFunctions",
    7,
    "M08",
  ],
  [
    "management-settings-runtime-privileges.mjs",
    "runtimeManagementSettingsFunctions",
    12,
    "M09",
  ],
]);

function getLiterals(file, name, problems) {
  const text = readFileSync(file, "utf8");
  const ast = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  if (ast.parseDiagnostics.length) {
    problems.push({ code: "LEGACY_FUNCTION_AST_INVALID", file });
    return [];
  }
  const declarations = ast.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .filter((decl) => ts.isIdentifier(decl.name) && decl.name.text === name);
  if (declarations.length !== 1) {
    problems.push({
      code: "LEGACY_FUNCTION_DECLARATION_UNRESOLVED",
      function: name,
    });
    return [];
  }
  const value = declarations[0].initializer;
  const literals =
    value && ts.isArrayLiteralExpression(value) ? [...value.elements] : [value];
  if (literals.some((node) => !node || !ts.isStringLiteral(node))) {
    problems.push({ code: "DYNAMIC_LEGACY_SIGNATURE", function: name });
    return [];
  }
  return literals.map((literal) => literal.text);
}

export function inspectLegacySignatures(repo) {
  const root = join(repo, "packages/database/scripts");
  const problems = [];
  const signatures = [];
  for (const [file, constant, count, family] of families) {
    const items = getLiterals(join(root, file), constant, problems);
    if (items.length !== count) {
      problems.push({
        code: "LEGACY_FUNCTION_COUNT_CHANGED",
        file,
        expected: count,
        actual: items.length,
      });
    }
    for (const signature of items) {
      if (!/^public\.[a-z][a-z0-9_]*\([a-z0-9_,\s[\]]*\)$/.test(signature)) {
        problems.push({ code: "LEGACY_FUNCTION_SIGNATURE_UNPARSEABLE", file });
      }
      signatures.push({
        family,
        signature,
        declaration: file + ":" + constant,
      });
    }
  }
  const presence =
    "public.shift_presence_set_policy(uuid,uuid,uuid,text,uuid,uuid,text,text,boolean,integer,integer,uuid)";
  const source = readFileSync(
    join(root, "shift-presence-runtime-privileges.mjs"),
    "utf8",
  );
  const ast = ts.createSourceFile(
    "shift-presence-runtime-privileges.mjs",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  let presentInGrant = false;
  const walk = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.arguments.length > 1 &&
      ts.isStringLiteral(node.arguments[1]) &&
      node.arguments[1].text ===
        "GRANT EXECUTE ON FUNCTION " + presence + " TO %I"
    ) {
      presentInGrant = true;
    }
    ts.forEachChild(node, walk);
  };
  walk(ast);
  if (!presentInGrant) {
    problems.push({ code: "SHIFT_PRESENCE_GRANT_UNRESOLVED" });
  }
  signatures.push({
    family: "M10",
    signature: presence,
    declaration: "shift-presence-runtime-privileges.mjs",
  });
  if (
    new Set(signatures.map((row) => row.signature)).size !== signatures.length
  ) {
    problems.push({ code: "DUPLICATE_LEGACY_SIGNATURE" });
  }
  return {
    signatures,
    problems,
    digest: sha256(JSON.stringify(signatures)),
  };
}
