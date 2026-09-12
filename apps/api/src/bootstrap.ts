import { db } from '@onbae/db';

export async function bootstrapCoreRecords() {
  const host = await db.host.upsert({
    where: { slug: 'onbae' },
    update: { displayName: 'Onbae', status: 'active' },
    create: {
      id: 'host_onbae',
      slug: 'onbae',
      displayName: 'Onbae',
      status: 'active',
    },
  });

  await db.environment.upsert({
    where: {
      hostId_slug_version: {
        hostId: host.id,
        slug: 'triad',
        version: '1.0.0',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: 'env_triad_v1',
      hostId: host.id,
      slug: 'triad',
      displayName: 'Triad',
      version: '1.0.0',
      status: 'ACTIVE',
      config: {
        rounds: 3,
        description: 'Best-of-three deterministic actor competition.',
      },
    },
  });
}
