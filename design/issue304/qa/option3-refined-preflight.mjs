// Browser-free preflight for Owner's Option 3 refinement.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { designDir } from './browser-setup.mjs';

const builtPath = join(designDir, 'option-3.html');
const sources = ['option-3.inner', 'option-3.css', 'option-3.js']
  .map((name) => join(designDir, 'concepts', name));
const expected = ['keys-active', 'keys-available', 'keys-in-use',
  'spots-active', 'spots-available', 'spots-occupied'];
let result;
try {
  const built = readFileSync(builtPath, 'utf8');
  const builtModified = statSync(builtPath).mtimeMs;
  const latestSource = Math.max(...sources.map((path) => statSync(path).mtimeMs));
  const labels = JSON.parse(readFileSync(sources[0], 'utf8')
    .match(/<script type="application\/json" data-c-copy>([\s\S]+?)<\/script>/)[1]);
  const keys = ['activeKeySlots', 'keysAvailable', 'keysInUse', 'activeParkingSpots', 'spotsAvailable', 'spotsOccupied'];
  const copyComplete = keys.every((key) => labels[key]?.length === 2 && labels[key].every((text) => text.trim().length > 2));
  const hooksComplete = expected.every((name) => built.includes(`data-c-kpi="${name}"`));
  result = { builtFresh: builtModified >= latestSource, hooksComplete, copyComplete,
    sourceCount: sources.length, unexpectedExternalAssets: /<script[^>]+src=["']https?:|<link[^>]+href=["']https?:/i.test(built),
    shellMarkerPresent: built.includes('data-issue304-shell'),
    detailPlateSelector: built.includes('c-row-identity'),
    builtDate: new Date(builtModified).toISOString(), latestSourceDate: new Date(latestSource).toISOString() };
} catch (error) { result = { error: String(error) }; }
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (result.error || Object.entries(result).some(([key, value]) =>
  ['builtFresh', 'hooksComplete', 'copyComplete', 'shellMarkerPresent', 'detailPlateSelector'].includes(key) && value === false)
  || result.unexpectedExternalAssets) process.exitCode = 2;
