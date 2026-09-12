import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

export * from './events.js';
export * from './host-receipts.js';
export * from './continuity.js';
export * from './institutional.js';
export * from './authority.js';
export * from './temporal-authority.js';
export * from './accountability.js';
export * from './dependency-exposure.js';
export * from './dependency-impact.js';
export * from './control-continuity.js';
export * from './control-operational.js';
export * from './capability-continuity.js';
export * from './recognition-continuity.js';
export * from './external-state-continuity.js';
export * from './transition-clearing.js';
export * from './intent-continuity.js';
export * from './actor-resolution.js';
export * from '@prisma/client';