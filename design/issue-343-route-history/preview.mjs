import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = process.env.VAYLET_REPO ?? 'D:/kndoom/valet-platform';
const require = createRequire(`${repo}/apps/dashboard/package.json`);
const viteEntry = require.resolve('vite', { paths: [path.dirname(require.resolve('vitest/package.json'))] });
const { createServer, build } = await import(pathToFileURL(viteEntry).href);
const dashboard = `${repo}/apps/dashboard/src`;
const configuration = {
  configFile: false,
  root,
  publicDir: `${repo}/apps/dashboard/public`,
  cacheDir: `${root}/.vite`,
  server: { host: '127.0.0.1', port: 4343, strictPort: true, fs: { allow: [repo, root] } },
  resolve: {
    alias: [
      { find: '@dashboard', replacement: dashboard },
      { find: '@prototype', replacement: `${root}/src` },
      { find: /^react-dom(.*)$/, replacement: `${path.dirname(require.resolve('react-dom/package.json'))}$1` },
      { find: /^react(.*)$/, replacement: `${path.dirname(require.resolve('react/package.json'))}$1` },
      { find: 'lucide-react', replacement: require.resolve('lucide-react') },
      { find: '@valet/contracts', replacement: `${repo}/packages/contracts/src/index.ts` },
      { find: 'next/link', replacement: `${root}/src/next-adapters.tsx` },
      { find: 'next/image', replacement: `${root}/src/next-adapters.tsx` },
    ],
    dedupe: ['react', 'react-dom'],
  },
  esbuild: { jsx: 'automatic' },
  plugins: [{
    name: 'isolated-route-history-insertion',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replaceAll('\\', '/').endsWith('/operations/tasks/task-drawer.tsx')) return;
      // This transforms only Vite's in-memory preview module. Never writes repository source.
      if (source.split('</FactList>').length !== 2) throw new Error('Task drawer changed; re-inspect insertion.');
      return source.replace('import type { ManagementLocation',
        'import { RouteHistorySection } from "@prototype/route-section";\nimport type { ManagementLocation')
        .replace('</FactList>', '</FactList><RouteHistorySection key={props.item.taskId} item={props.item} />');
    },
  }],
};

if (process.argv[2] === 'build') {
  await build(configuration);
} else {
  const server = await createServer(configuration);
  await server.listen();
  server.printUrls();
}
