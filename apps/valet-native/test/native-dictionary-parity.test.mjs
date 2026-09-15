import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

import { getNativeEmployeeDictionary } from "../src/i18n/native-employee-dictionary";
import { getNativePlatformCopy } from "../src/i18n/native-platform-copy";

const fragments = [
  "",
  "-check-in",
  "-scan-hub",
  "-scanner",
  "-shift",
  "-vehicles",
];

const read = (path) => readFileSync(resolve(import.meta.dirname, path), "utf8");

function dictionaryEntries(source, fileName) {
  const syntax = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const entries = {};
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      const name = node.name.getText(syntax).replaceAll('"', "");
      entries[name] = node.initializer.text;
    }
    ts.forEachChild(node, visit);
  };
  visit(syntax);
  return entries;
}

function sharedDictionaryEntries(entries, excludedKeys) {
  return Object.fromEntries(
    Object.entries(entries).filter(([key]) => !excludedKeys.has(key)),
  );
}

describe("Native central employee dictionary parity", () => {
  for (const locale of ["en", "ar"]) {
    for (const fragment of fragments) {
      it(`mirrors Web ${locale}${fragment || "-core"} source exactly`, () => {
        const web = read(
          `../../valet/src/lib/i18n/dictionary-${locale}${fragment}.ts`,
        );
        const native = read(
          `../src/i18n/native-dictionary-${locale}${fragment}.ts`,
        );
        const nativeEntries = dictionaryEntries(
          native,
          `native-${locale}${fragment}`,
        );
        const webEntries = dictionaryEntries(web, `web-${locale}${fragment}`);
        const acceptedPlatformDifferences = new Set(
          fragment === "-check-in" ? ["plateCameraPreviewHint"] : [],
        );
        const nativeOnly = new Set(
          fragment === "" ? ["invalidJordanMobile"] : [],
        );
        const webOnly = new Set(
          fragment === "-check-in" ? ["plateCameraCapture"] : [],
        );
        expect(
          sharedDictionaryEntries(
            nativeEntries,
            new Set([...nativeOnly, ...acceptedPlatformDifferences]),
          ),
        ).toEqual(
          sharedDictionaryEntries(
            webEntries,
            new Set([...webOnly, ...acceptedPlatformDifferences]),
          ),
        );
        expect([...nativeOnly].every((key) => key in nativeEntries)).toBe(true);
        expect([...webOnly].every((key) => key in webEntries)).toBe(true);
        if (fragment === "-check-in") {
          expect(nativeEntries.plateCameraPreviewHint).toContain(
            locale === "en" ? "automatically" : "تلقائيًا",
          );
        }
      });
    }
  }

  it("has identical EN and AR key sets", () => {
    expect(Object.keys(getNativeEmployeeDictionary("ar")).sort()).toEqual(
      Object.keys(getNativeEmployeeDictionary("en")).sort(),
    );
  });

  it("keeps Key Slot restriction copy aligned across Native and Web EN/AR", () => {
    for (const [locale, expected] of [
      ["en", "Restricted"],
      ["ar", "مقيّد"],
    ]) {
      const web = dictionaryEntries(
        read(`../../valet/src/lib/i18n/dictionary-${locale}.ts`),
        `web-${locale}`,
      );
      const native = dictionaryEntries(
        read(`../src/i18n/native-dictionary-${locale}.ts`),
        `native-${locale}`,
      );
      expect(native.keySlotRestricted).toBe(expected);
      expect(web.keySlotRestricted).toBe(expected);
    }
  });

  it("keeps the explicit Android-only catalog bounded", () => {
    expect(Object.keys(getNativePlatformCopy("en"))).toEqual([
      "auth",
      "camera",
      "scanner",
    ]);
    expect(Object.keys(getNativePlatformCopy("ar"))).toEqual([
      "auth",
      "camera",
      "scanner",
    ]);
  });
});
