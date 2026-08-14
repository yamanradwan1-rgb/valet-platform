import { z } from 'zod';

export const nonEmptyStringSchema = z.string().trim().min(1);

export * from './api-errors';
export * from './check-in';
export * from './complete-handoff';
export * from './confirm-parked';
export * from './dispatch';
export * from './handoff';
export * from './key-custody';
export * from './mark-ready';
export * from './shifts';
export * from './start-parking';
export * from './start-retrieval';
export * from './staff-auth';
