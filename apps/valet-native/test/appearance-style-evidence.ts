import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export function nativePresentationFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory()
      ? nativePresentationFiles(file)
      : /\.(ts|tsx)$/.test(file)
        ? [file]
        : [];
  });
}

/** Evaluate trusted repository style factories without mounting Native/device APIs.
 * Imports are resolved only when an expression actually reads them. */
export function captureNativeStyleSheets(root: string) {
  const modules = new Map<string, ReturnType<typeof moduleValues>>();
  function moduleValues(file: string) {
    const source = fs.readFileSync(file, "utf8");
    const tree = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const declarations = new Map<string, ts.Expression>();
    const imports = new Map<string, { module: string; name: string }>();
    const values = new Map<string, unknown>();
    const sheets: string[] = [];
    for (const node of tree.statements) {
      if (
        ts.isExportDeclaration(node) &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        for (const item of node.exportClause.elements)
          imports.set(item.name.text, {
            module: node.moduleSpecifier.text,
            name: (item.propertyName ?? item.name).text,
          });
      }
      if (
        ts.isImportDeclaration(node) &&
        node.importClause &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const binding = node.importClause.namedBindings;
        if (binding && ts.isNamedImports(binding))
          for (const item of binding.elements)
            imports.set(item.name.text, {
              module: node.moduleSpecifier.text,
              name: (item.propertyName ?? item.name).text,
            });
      }
      if (ts.isVariableStatement(node))
        for (const item of node.declarationList.declarations) {
          if (ts.isIdentifier(item.name) && item.initializer) {
            declarations.set(item.name.text, item.initializer);
            if (
              /^(StyleSheet\.create|createEmployeeStyles)\(/.test(
                item.initializer.getText(tree),
              )
            )
              sheets.push(item.name.text);
          }
        }
    }
    const context = new Proxy(
      {},
      {
        has: (_target, name) => name !== "exports",
        get: (_target, name) =>
          typeof name === "string" ? resolve(name) : undefined,
      },
    );
    function resolve(name: string): unknown {
      if (values.has(name)) return values.get(name);
      if (name === "Object") return Object;
      if (name === "StyleSheet") return { create: (v: unknown) => v };
      const imported = imports.get(name);
      if (imported) {
        if (imported.name === "createEmployeeStyles") {
          const paletteFile = path.join(root, "appearance/employee-palette.ts");
          const palettes = load(paletteFile).resolve(
            "employeePalettes",
          ) as Record<string, unknown>;
          return (factory: (p: unknown) => unknown) => ({
            light: factory(palettes.light),
            dark: factory(palettes.dark),
          });
        }
        const target = path.resolve(path.dirname(file), imported.module);
        const actual = [target + ".ts", target + ".tsx"].find(fs.existsSync);
        if (!actual)
          throw Error(`Style evidence cannot resolve ${file}: ${name}`);
        return load(actual).resolve(imported.name);
      }
      const declaration = declarations.get(name);
      if (!declaration) throw Error(`Style evidence missing ${file}: ${name}`);
      const compiled = ts.transpileModule(
        `const result = (${declaration.getText(tree)});`,
        {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
          },
        },
      ).outputText;
      const result: unknown = Function(
        "scope",
        `with(scope) { ${compiled}; return result; }`,
      )(context);
      values.set(name, result);
      return result;
    }
    return { resolve, sheets };
  }
  function load(file: string) {
    let module = modules.get(file);
    if (!module) {
      module = moduleValues(file);
      modules.set(file, module);
    }
    return module;
  }
  return Object.fromEntries(
    nativePresentationFiles(root)
      .filter((file) => !file.includes(`${path.sep}appearance${path.sep}`))
      .flatMap((file) =>
        load(file).sheets.map((name) => [
          `${path.relative(root, file).replaceAll("\\", "/").replace("shell/native-gate-style-sheets.ts", "shell/native-gate-primitives.tsx")}:${name.replace(/Theme$/, "")}`,
          load(file).resolve(name),
        ]),
      ),
  );
}
