// Publication-only path adapter for the unchanged synthetic audit probes.
// Requires an existing checkout and existing dependencies; installs nothing.
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const sourceRoot = path.resolve(process.env.VAYLET_AUDIT_SOURCE_ROOT || path.resolve(__dirname, '../../../..'));
const dependencyRoot = path.resolve(process.env.VAYLET_AUDIT_DEPENDENCIES_ROOT || sourceRoot);
if (!fs.existsSync(path.join(sourceRoot, 'package.json'))) throw new Error('Set VAYLET_AUDIT_SOURCE_ROOT to the baseline checkout');
const dependencyRequire = createRequire(path.join(dependencyRoot, 'package.json'));
module.exports = { sourceRoot, dependencyRoot, dependencyRequire };
