import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire('D:/kndoom/valet-platform/apps/dashboard/package.json');
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], {
  cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: 'inherit',
});
process.exit(result.status ?? 1);
