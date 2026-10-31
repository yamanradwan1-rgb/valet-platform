import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export const root = fileURLToPath(new URL("../", import.meta.url));
function locateRepo() {
  if (process.env.VAYLET_REPO) return path.resolve(process.env.VAYLET_REPO);
  for (let candidate = root; ; candidate = path.dirname(candidate)) {
    if (existsSync(path.join(candidate, "apps/dashboard/package.json")))
      return candidate;
    if (path.dirname(candidate) === candidate) break;
  }
  const localCheckout = "D:/kndoom/valet-platform";
  if (existsSync(path.join(localCheckout, "apps/dashboard/package.json")))
    return localCheckout;
  throw new Error(
    "Run this prototype inside valet-platform or set VAYLET_REPO.",
  );
}
export const repo = locateRepo();
export const dashboard = path.join(repo, "apps/dashboard");
function locateDependencies() {
  if (process.env.VAYLET_DEPENDENCIES_ROOT)
    return path.resolve(process.env.VAYLET_DEPENDENCIES_ROOT);
  if (existsSync(path.join(repo, "node_modules/vitest"))) return repo;
  const commonDir = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: repo, encoding: "utf8" },
  ).trim();
  const primary = path.dirname(commonDir);
  if (existsSync(path.join(primary, "node_modules/vitest"))) return primary;
  throw new Error(
    "Install the repository dependencies with pnpm install first.",
  );
}
export const dependencies = locateDependencies();
export const dependencyDashboard = path.join(dependencies, "apps/dashboard");
export const requireDashboard = createRequire(
  path.join(dependencyDashboard, "package.json"),
);
export const requireRoot = createRequire(
  path.join(dependencies, "package.json"),
);
const requireVitest = createRequire(requireRoot.resolve("vitest/package.json"));
export const vite = await import(pathToFileURL(requireVitest.resolve("vite")));

export const config = {
  root,
  configFile: false,
  cacheDir: path.join(root, ".vite"),
  publicDir: path.join(root, "public"),
  resolve: {
    alias: [
      { find: "next/link", replacement: path.join(root, "src/link-entry.ts") },
      {
        find: "next/image",
        replacement: path.join(root, "src/image-entry.ts"),
      },
      { find: "@dashboard", replacement: path.join(dashboard, "src") },
      {
        find: "zod",
        replacement: path.join(
          dependencies,
          "packages/contracts/node_modules/zod",
        ),
      },
      {
        find: /^react-dom(\/.*)?$/,
        replacement:
          path.join(dependencyDashboard, "node_modules/react-dom") + "$1",
      },
      {
        find: /^react(\/.*)?$/,
        replacement:
          path.join(dependencyDashboard, "node_modules/react") + "$1",
      },
      {
        find: "lucide-react",
        replacement: path.join(
          dependencyDashboard,
          "node_modules/lucide-react",
        ),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  oxc: { jsx: { runtime: "automatic" } },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.PROTOTYPE_PORT || 4321),
    strictPort: true,
    fs: { allow: [root, repo, dependencies] },
    watch: { ignored: ["**/evidence/**", "**/dist/**"] },
  },
  build: { outDir: path.join(root, "dist"), emptyOutDir: true },
};
