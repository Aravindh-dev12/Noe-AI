import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { db } from '@onbae/db';

import { env } from '../env.js';

export const auth = betterAuth({
  appName: 'Onbae',
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
    cookiePrefix: 'onbae',
    useSecureCookies: env.NODE_ENV === 'production',
    ipAddress: {
      // This header is injected by Onbae's Fastify route from request.ip and overwrites
      // any client-supplied value before Better Auth sees the request.
      ipAddressHeaders: ['x-onbae-client-ip'],
    },
    database: {
      joins: true,
    },
  },
});

export type OnbaeSession = Awaited<ReturnType<typeof auth.api.getSession>>;
