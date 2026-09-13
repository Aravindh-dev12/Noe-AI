import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  // Prisma 6.7+ supports recursively loading *.prisma files from a schema
  // directory. Keep schema.prisma as the datasource/generator root and split
  // new institutional domains into prisma/models/*.
  schema: 'prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
