import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { env } from '../env.js';

export const MATCH_QUEUE = 'onbae-match-runner';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export const matchQueue = new Queue(MATCH_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2_000,
    },
    removeOnComplete: 500,
    removeOnFail: 1_000,
  },
});
