import type { TaskOverviewEntry } from '@valet/contracts';
import type { ProtectedDashboardContextValue } from '@dashboard/components/foundation/protected-dashboard-context';

export const location = {
  locationId: '33333333-3333-4333-8333-333333333333',
  name: 'Amman · Demo Hotel',
  code: 'AMM',
  status: 'ACTIVE' as const,
  timezone: 'Asia/Amman',
  currency: 'JOD',
};
export const organization = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  name: 'VAYLET Demo Operations',
  timezone: 'Asia/Amman',
};

export const tasks: TaskOverviewEntry[] = [
  ['PARKING', 'COMPLETED', '14:24', '14:28'],
  ['RETRIEVAL', 'COMPLETED', '15:42', '15:46'],
  ['PARKING', 'IN_PROGRESS', '16:02', '16:03'],
].map(([taskType, status, start, end], index) => ({
  taskId: `a0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  valetSessionId: `b0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  taskType: taskType as TaskOverviewEntry['taskType'],
  status: status as TaskOverviewEntry['status'],
  currentAssigneeMembershipId: null,
  assignee: null,
  createdAt: `2026-10-31T${start}:00+03:00`,
  updatedAt: `2026-10-31T${end}:00+03:00`,
}));

// Local read adapter only. No credentials, network, API writes or raw GPS in Tasks payloads.
const api = {
  async request(route: string) {
    if (!route.endsWith('/overview/tasks')) throw new Error('Prototype read unavailable.');
    return { items: tasks, nextCursor: null };
  },
} as unknown as ProtectedDashboardContextValue['api'];

export const dashboardContext: ProtectedDashboardContextValue = {
  api,
  identityGeneration: 1,
  selectionRevision: 1,
  sessionGeneration: 1,
  selectedScope: { authority: 'LOCATION_MANAGER', organization, location },
};
