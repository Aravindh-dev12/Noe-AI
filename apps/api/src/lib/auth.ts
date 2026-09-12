import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

import { env } from '../env.js';

export function assertAdmin(request: FastifyRequest): void {
  const provided = request.headers['x-onbae-admin-key'];
  if (typeof provided !== 'string') {
    throw Object.assign(new Error('Missing admin credential.'), { statusCode: 401 });
  }

  const expectedBuffer = Buffer.from(env.ADMIN_API_KEY);
  const providedBuffer = Buffer.from(provided);

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw Object.assign(new Error('Invalid admin credential.'), { statusCode: 403 });
  }
}
