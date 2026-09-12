import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';

import { auth } from '../lib/auth-system.js';
import { getPrincipal } from '../lib/auth.js';

export async function authRoutes(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const host = request.headers.host;
      if (!host) {
        return reply.code(400).send({ error: 'missing_host_header' });
      }

      const forwardedProto = request.headers['x-forwarded-proto'];
      const protocol =
        typeof forwardedProto === 'string' && forwardedProto.length > 0
          ? forwardedProto.split(',')[0]!.trim()
          : request.protocol;
      const url = new URL(request.url, `${protocol}://${host}`);
      const headers = fromNodeHeaders(request.headers);

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
      headers: fromNodeHeaders(request.headers),
    });

    return {
      authenticated: true,
      user: session!.user,
      session: {
        id: session!.session.id,
        expiresAt: session!.session.expiresAt,
      },
    };
  });
}
