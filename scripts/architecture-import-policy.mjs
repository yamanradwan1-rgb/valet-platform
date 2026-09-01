import { builtinModules } from "node:module";
import { posix } from "node:path";

const NODE_BUILTINS = new Set(
  builtinModules.map((name) => name.replace(/^node:/, "")),
);

export function importViolation(sourcePath, specifier, workspacePackageRoots) {
  const sourceArea = classifyArea(sourcePath);
  const targetPath = resolveImportTarget(
    sourcePath,
    specifier,
    workspacePackageRoots,
  );
  const targetArea =
    targetPath === undefined ? undefined : classifyArea(targetPath);
  const apiViolation = apiImportViolation(sourceArea, targetArea);
  if (apiViolation !== undefined) return apiViolation;

  if (sourceArea === "portable") {
    if (["web", "native", "api", "server"].includes(targetArea)) {
      return `portable Employee client must not import ${targetArea} implementation`;
    }
    const dependency = forbiddenPortableDependency(specifier);
    if (dependency !== undefined) {
      return `portable Employee client must not import ${dependency}`;
    }
  }
  if (
    sourceArea === "native" &&
    ["web", "api", "server"].includes(targetArea)
  ) {
    return `Employee Native must not import ${targetArea} implementation`;
  }
  if (sourceArea === "native" && isWebOnlyDependency(specifier)) {
    return "Employee Native must not import Web-only dependency";
  }
  if (sourceArea === "web" && targetArea === "native") {
    return "Employee Web must not import Native implementation";
  }
  return undefined;
}

export function resolveImportTarget(
  sourcePath,
  specifier,
  workspacePackageRoots,
) {
  const normalizedSpecifier = specifier.replaceAll("\\", "/");
  if (normalizedSpecifier.startsWith(".")) {
    return posix
      .resolve("/", posix.dirname(sourcePath), normalizedSpecifier)
      .slice(1);
  }
  const packageName = packageNameForSpecifier(normalizedSpecifier);
  const packageRoot = workspacePackageRoots.get(packageName);
  if (packageRoot === undefined) return undefined;
  const suffix = normalizedSpecifier
    .slice(packageName.length)
    .replace(/^\//, "");
  return suffix.length === 0 ? packageRoot : posix.join(packageRoot, suffix);
}

function classifyArea(repositoryPath) {
  if (repositoryPath.startsWith("apps/api/src/common/")) return "common";
  if (repositoryPath.startsWith("apps/api/src/modules/anti-abuse/"))
    return "anti-abuse";
  if (repositoryPath.startsWith("apps/api/src/modules/auth/")) return "auth";
  if (repositoryPath.startsWith("apps/api/src/modules/guest-access/"))
    return "guest-access";
  if (repositoryPath.startsWith("apps/api/src/modules/check-in-api/"))
    return "check-in";
  if (repositoryPath.startsWith("apps/api/src/modules/")) return "module";
  if (inRoot(repositoryPath, "apps/api")) return "api";
  if (inRoot(repositoryPath, "apps/valet-native")) return "native";
  if (inRoot(repositoryPath, "apps/valet")) return "web";
  if (inRoot(repositoryPath, "packages/employee-client")) return "portable";
  if (inRoot(repositoryPath, "packages/database")) return "server";
  return undefined;
}

function inRoot(repositoryPath, root) {
  return repositoryPath === root || repositoryPath.startsWith(`${root}/`);
}

function apiImportViolation(sourceArea, targetArea) {
  if (sourceArea === "common" && isApiModuleArea(targetArea)) {
    return "common must not import application modules";
  }
  const forbiddenTargets = {
    "anti-abuse": new Set(["auth", "guest-access", "check-in"]),
    auth: new Set(["guest-access", "check-in"]),
    "guest-access": new Set(["check-in"]),
    "check-in": new Set(["guest-access", "anti-abuse"]),
  };
  if (forbiddenTargets[sourceArea]?.has(targetArea)) {
    return `${sourceArea} must not import ${targetArea}`;
  }
  return undefined;
}

function isApiModuleArea(area) {
  return ["anti-abuse", "auth", "guest-access", "check-in", "module"].includes(
    area,
  );
}

function forbiddenPortableDependency(specifier) {
  const normalized = specifier.replaceAll("\\", "/");
  const bare = normalized.replace(/^node:/, "").split("/")[0];
  if (normalized.startsWith("node:") || NODE_BUILTINS.has(bare)) {
    return "Node runtime dependency";
  }
  if (isPackageOrSubpath(normalized, "next")) return "Next.js";
  if (isPackageOrSubpath(normalized, "react-dom")) return "React DOM";
  if (
    isPackageOrSubpath(normalized, "react-native") ||
    normalized.startsWith("@react-native/") ||
    normalized.startsWith("@react-native-") ||
    normalized.includes("/react-native")
  ) {
    return "React Native/platform dependency";
  }
  if (
    normalized === "expo" ||
    normalized.startsWith("expo-") ||
    normalized.startsWith("@expo/")
  ) {
    return "Expo dependency";
  }
  if (isPackageOrSubpath(normalized, "android")) return "Android dependency";
  if (isPackageOrSubpath(normalized, "ios")) return "iOS dependency";
  return undefined;
}

function isWebOnlyDependency(specifier) {
  const normalized = specifier.replaceAll("\\", "/");
  return (
    isPackageOrSubpath(normalized, "next") ||
    isPackageOrSubpath(normalized, "react-dom")
  );
}

function isPackageOrSubpath(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function packageNameForSpecifier(specifier) {
  const segments = specifier.split("/");
  return specifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0];
}
