import { z } from 'zod';

/**
 * Request metadata is persisted into Prisma JSON columns. Accept only values
 * that are valid JSON at the HTTP boundary so non-serializable JavaScript
 * values can never reach the persistence layer.
 */
export const jsonMetadataSchema = z.record(z.string(), z.json()).optional();
