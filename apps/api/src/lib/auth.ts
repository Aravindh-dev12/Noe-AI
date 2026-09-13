import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';

import { env } from '../env.js';
import { auth } from './auth-system.js';

export type Principal =
  | { kind: 'admin' }
  | {
      kind: 'user';
      userId: string;
      email: string;
      name: string;
    };

export function trustedAuthHeaders(request: FastifyRequest): Headers {
  const headers = fromNodeHeaders(request.headers);
  // Always overwrite internal IP headers with Fastify's server-derived address.
  // NOEONE is the public header namespace. The shorter NOE and historical
  // Onbae aliases remain server-controlled compatibility paths so existing
  // sessions/integrations are not broken by a display-brand migration.
  headers.set('x-noeone-client-ip', request.ip);
  headers.set('x-noe-client-ip', request.ip);
  return headers;
}

function providedAdminCredential(request: FastifyRequest): string | null {
  const current = request.headers['x-noeone-admin-key'];
  if (typeof current === 'string') return current;

  // Compatibility aliases are intentionally read-only migration paths.
  const previous = request.headers['x-noe-admin-key'];
  if (typeof previous === 'string') return previous;

  const legacy = request.headers['x-onbae-admin-key'];
  return typeof legacy === 'string' ? legacy : null;
}

export function hasValidAdminCredential(request: FastifyRequest): boolean {
  const provided = providedAdminCredential(request);
  if (!provided) return false;

  const expectedBuffer = Buffer.from(env.ADMIN_API_KEY);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export function assertAdmin(request: FastifyRequest): void {
  if (hasValidAdminCredential(request)) return;

  const provided = providedAdminCredential(request);
  throw Object.assign(
    new Error(provided ? 'Invalid admin credential.' : 'Missing admin credential.'),
    { statusCode: provided ? 403 : 401 },
  );
}

export async function getPrincipal(request: FastifyRequest): Promise<Principal | null> {
  if (hasValidAdminCredential(request)) {
    return { kind: 'admin' };
  }

  const session = await auth.api.getSession({
    headers: trustedAuthHeaders(request),
  });

  if (!session) return null;

  return {
    kind: 'user',
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

export async function requirePrincipal(request: FastifyRequest): Promise<Principal> {
  const principal = await getPrincipal(request);
  if (!principal) {
    throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
  }
  return principal;
}

export async function requireUserPrincipal(
  request: FastifyRequest,
): Promise<Extract<Principal, { kind: 'user' }>> {
  const principal = await requirePrincipal(request);
  if (principal.kind !== 'user') {
    throw Object.assign(new Error('A user session is required.'), { statusCode: 403 });
  }
  return principal;
}

export function assertActorControl(
  principal: Principal,
  actor: { ownerId: string | null; actorType: string },
): void {
  if (principal.kind === 'admin') return;

  if (actor.actorType !== 'USER' || actor.ownerId !== principal.userId) {
    throw Object.assign(new Error('You do not control this actor.'), { statusCode: 403 });
  }
}
