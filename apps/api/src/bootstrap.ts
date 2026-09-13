import { db } from '@onbae/db';

export async function bootstrapCoreRecords() {
  // Preserve the original registry host because historical actor events have a
  // restrictive foreign key to host_onbae. It remains a compatibility identity,
  // not the current public brand.
  await db.host.upsert({
    where: { id: 'host_onbae' },
    update: { displayName: 'NOE legacy registry' },
    create: {
      id: 'host_onbae',
      slug: 'onbae',
      displayName: 'NOE legacy registry',
      status: 'active',
    },
  });

  // host_noeone is also a historical compatibility identifier. Keep the stable
  // database identity so signed events and foreign keys remain valid while the
  // public product name is NOE.
  const host = await db.host.upsert({
    where: { id: 'host_noeone' },
    update: { displayName: 'NOE', status: 'active' },
    create: {
      id: 'host_noeone',
      slug: 'noeone',
      displayName: 'NOE',
      status: 'active',
    },
  });

  // Keep the stable environment ID so existing clients and scheduled matches do
  // not break. New activity is attributed to the compatibility registry host but
  // is presented publicly as NOE.
  await db.environment.upsert({
    where: { id: 'env_triad_v1' },
    update: {
      hostId: host.id,
      slug: 'triad',
      displayName: 'Triad',
      version: '1.0.0',
      status: 'ACTIVE',
    },
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