import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { db } from '@onbae/db';

import { env } from '../env.js';

export const auth = betterAuth({
  appName: 'NOEONE',
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.CORS_ORIGINS,
  database: prismaAdapter(db, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    // Keep the legacy cookie namespace through the brand migration so existing
    // authenticated sessions are not invalidated merely by the rename.
    cookiePrefix: 'onbae',
    useSecureCookies: env.NODE_ENV === 'production',
    ipAddress: {
      // Injected by NOEONE's Fastify boundary from request.ip; client input with
      // this name is overwritten before Better Auth sees it.
      ipAddressHeaders: ['x-noeone-client-ip'],
    },
    database: {
      joins: true,
    },
  },
});

export type NoeoneSession = Awaited<ReturnType<typeof auth.api.getSession>>;
/** @deprecated Compatibility alias during the NOEONE brand migration. */
export type OnbaeSession = NoeoneSession;
