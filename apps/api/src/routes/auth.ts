import type { FastifyInstance } from 'fastify';

import { auth } from '../lib/auth-system.js';
import { getPrincipal, trustedAuthHeaders } from '../lib/auth.js';
import { env } from '../env.js';

export async function authRoutes(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      // Build Better Auth URLs from the configured canonical API origin instead of
      // trusting Host/X-Forwarded-* values supplied by the request. Fastify still
      // resolves request.ip through its separately configured trustProxy boundary.
      const url = new URL(request.url, env.BETTER_AUTH_URL);
      const headers = trustedAuthHeaders(request);

      const authRequest = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
      });

      const response = await auth.handler(authRequest);

      reply.code(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });

      const setCookies = response.headers.getSetCookie();
      if (setCookies.length > 0) {
        reply.header('set-cookie', setCookies);
      }

      const body = response.body ? await response.text() : null;
      return reply.send(body);
    },
  });

  app.get('/v1/me', async (request, reply) => {
    const principal = await getPrincipal(request);
    if (!principal || principal.kind !== 'user') {
      return reply.code(401).send({ authenticated: false });
    }

    const session = await auth.api.getSession({
      headers: trustedAuthHeaders(request),
    });

    if (!session) {
      return reply.code(401).send({ authenticated: false });
    }

    return {
      authenticated: true,
      user: session.user,
      session: {
        id: session.session.id,
        expiresAt: session.session.expiresAt,
      },
    };
  });
}
