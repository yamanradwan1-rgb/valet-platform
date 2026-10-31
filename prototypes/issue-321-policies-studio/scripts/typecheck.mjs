import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  root,
  repo,
  dependencyDashboard,
  dependencies,
  requireRoot,
} from "./runtime.mjs";

const config = JSON.parse(
  readFileSync(path.join(root, "tsconfig.json"), "utf8"),
);
const modulePath = (name) =>
  path.join(dependencyDashboard, "node_modules", name);
config.compilerOptions.baseUrl = root;
config.compilerOptions.paths = {
  "@dashboard/*": [path.join(repo, "apps/dashboard/src/*")],
  "@valet/contracts": [path.join(repo, "packages/contracts/src/index.ts")],
  react: [modulePath("@types/react")],
  "react/*": [modulePath("@types/react/*")],
  "react-dom": [modulePath("@types/react-dom")],
  "react-dom/*": [modulePath("@types/react-dom/*")],
  "lucide-react": [modulePath("lucide-react")],
  "next/*": [modulePath("next/*")],
  zod: [path.join(dependencies, "packages/contracts/node_modules/zod")],
};
config.include = [path.join(root, "src")];
const directory = path.join(root, ".generated");
mkdirSync(directory, { recursive: true });
const generated = path.join(directory, "tsconfig.json");
writeFileSync(generated, JSON.stringify(config, null, 2));
const result = spawnSync(
  process.execPath,
  [requireRoot.resolve("typescript/bin/tsc"), "-p", generated],
  {
    cwd: root,
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
