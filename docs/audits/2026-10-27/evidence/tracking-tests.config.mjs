import paths from './reproduction-paths.cjs';
export default { test: { include: [
  paths.sourceRoot + '/apps/api/src/modules/tracking/live-map-cursor.test.ts',
  paths.sourceRoot + '/apps/api/src/modules/tracking/route-history-cursor.test.ts',
  paths.sourceRoot + '/apps/api/src/modules/tracking/point-in-polygon.test.ts',
], maxWorkers: 1 } };
