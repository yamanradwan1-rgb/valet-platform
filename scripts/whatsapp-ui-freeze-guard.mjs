import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = "53e9be1ab3a6f0e1411df30952287d0135e6d189";
const c0Source = "1ecdbeff1c4b7b011a1af00c843f7930e515cea4";
const manifest = "docs/plans/AUTOMATIC_WHATSAPP_GUEST_ACCESS_UI_FREEZE_MANIFEST.tsv";
const prefixes = ["apps/customer/", "apps/dashboard/", "apps/valet-native/",
  "apps/valet/", "packages/ui/", "packages/employee-client/"];
const waSettingsPrefix = "apps/dashboard/src/features/administration/settings/whatsapp-";

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16_777_216 });
}

export function protectedPath(path) {
  return prefixes.some((p) => path.startsWith(p)) || path.startsWith("docs/validation/");
}

export function approvedChange(path, pinnedPaths) {
  if (path === "apps/dashboard/src/features/administration/settings/settings-page.tsx") return true;
  if (pinnedPaths.has(path)) return false;
  if (path.startsWith(waSettingsPrefix)) {
    return /^apps\/dashboard\/src\/features\/administration\/settings\/whatsapp-[a-z0-9-]+\.(?:ts|tsx|module\.css)$/.test(path);
  }
  if (/^packages\/employee-client\/src\/whatsapp-compat-[a-z0-9-]+\.test\.ts$/.test(path)) return true;
  if (/^apps\/valet-native\/test\/whatsapp-compat-(?:[a-z0-9-]+\.test\.ts|fixture[a-z0-9-]*\.ts)$/.test(path)) return true;
  if (/^docs\/validation\/whatsapp\/(?:C0_CONTRACT_AND_OWNERSHIP|W[1-7]-[A-Za-z0-9_-]+)\.md$/.test(path)) return true;
  return false;
}

export function forbiddenChanges(paths, pinnedPaths) {
  return paths.filter((path) => protectedPath(path) && !approvedChange(path, pinnedPaths));
}

function parseManifest(raw) {
  const lines = raw.replace(/\r/g, "").split("\n");
  if (lines[0] !== `# UI freeze baseline ${baseline}` ||
      lines[2] !== "path\tgit_blob_sha\tmode") {
    throw new Error("UI freeze manifest header changed");
  }
  const paths = new Set();
  for (const line of lines.slice(3).filter(Boolean)) {
    const [path, hash, mode] = line.split("\t");
    if (!path || !/^[a-f0-9]{40}$/.test(hash ?? "") ||
        !/^100[0-7]{3}$/.test(mode ?? "") || paths.has(path)) {
      throw new Error("UI freeze manifest invalid or duplicate path");
    }
    paths.add(path);
  }
  if (paths.size !== 2174) throw new Error("UI freeze manifest original count changed");
  return paths;
}

export function verifyUiFreeze() {
  const published = git("show", `${c0Source}:${manifest}`).replace(/\r/g, "");
  const original = readFileSync(resolve(root, manifest), "utf8").replace(/\r/g, "");
  if (published !== original) throw new Error("Frozen UI manifest was modified");
  const pinnedPaths = parseManifest(original);
  // --name-only includes added, deleted and renamed paths (rename detection off).
  const changed = git("diff", "--name-only", "--no-renames", baseline).split(/\r?\n/).filter(Boolean);
  const untracked = git("ls-files", "--others", "--exclude-standard", "-z")
    .split("\0").filter(Boolean);
  const paths = [...new Set([...changed, ...untracked])];
  return { checked: paths.length, forbidden: forbiddenChanges(paths, pinnedPaths) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyUiFreeze();
    for (const path of result.forbidden) console.error("UI FREEZE VIOLATION:", path);
    console.log(`UI freeze: ${result.forbidden.length ? "FAIL" : "PASS"} / ${result.checked} changed paths`);
    if (result.forbidden.length) process.exitCode = 1;
  } catch (error) {
    console.error("UI freeze: CHECK ERROR", error instanceof Error ? error.message : "");
    process.exitCode = 1;
  }
}
