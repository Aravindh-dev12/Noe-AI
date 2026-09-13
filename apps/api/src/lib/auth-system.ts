import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { db } from '@onbae/db';

import { env } from '../env.js';

export const auth = betterAuth({
  appName: 'NOE',
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
    // Cookie namespace is a compatibility identifier, not a display brand.
    // Keep it until a deliberate session migration is implemented.
    cookiePrefix: 'onbae',
    useSecureCookies: env.NODE_ENV === 'production',
    ipAddress: {
      // NOE writes the first header. Older names remain accepted so an in-flight
      // deployment does not invalidate auth merely because the public brand changed.
      ipAddressHeaders: ['x-noe-client-ip', 'x-noeone-client-ip'],
    },
    database: {
      joins: true,
    },
  },
});

export type NoeSession = Awaited<ReturnType<typeof auth.api.getSession>>;
/** @deprecated Compatibility alias from the NOEONE public brand. */
export type NoeoneSession = NoeSession;
/** @deprecated Compatibility alias from the original Onbae public brand. */
export type OnbaeSession = NoeSession;
