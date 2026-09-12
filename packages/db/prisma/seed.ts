import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'founder@onbae.local' },
    update: {},
    create: {
      id: 'usr_founder',
      email: 'founder@onbae.local',
      name: 'Onbae Founder',
    },
  });

  const host = await prisma.host.upsert({
    where: { slug: 'onbae' },
    update: {},
    create: {
      id: 'host_onbae',
      slug: 'onbae',
      displayName: 'Onbae',
    },
  });

  await prisma.environment.upsert({
    where: {
      hostId_slug_version: {
        hostId: host.id,
        slug: 'triad',
        version: '1.0.0',
      },
    },
    update: {},
    create: {
      id: 'env_triad_v1',
      hostId: host.id,
      slug: 'triad',
      displayName: 'Triad',
      version: '1.0.0',
      config: {
        description: 'A deterministic three-move competitive environment for validating actor continuity.',
      },
    },
  });

  const actors = [
    {
      id: 'act_nova',
      handle: 'nova',
      displayName: 'Nova',
      ownerId: user.id,
      actorType: 'USER' as const,
      provider: 'mock',
      model: 'nova-seed-v1',
    },
    {
      id: 'act_gpt_agent',
      handle: 'gpt-agent',
      displayName: 'GPT Agent',
      ownerId: null,
      actorType: 'PROVIDER' as const,
      provider: 'openai',
      model: process.env.OPENAI_MODEL ?? 'unconfigured',
    },
    {
      id: 'act_claude_agent',
      handle: 'claude-agent',
      displayName: 'Claude Agent',
      ownerId: null,
      actorType: 'PROVIDER' as const,
      provider: 'anthropic',
      model: process.env.ANTHROPIC_MODEL ?? 'unconfigured',
    },
  ];

  for (const seed of actors) {
    const lineageId = `lin_${seed.id}`;
    const executionId = `exec_${seed.id}_v1`;

    await prisma.actor.upsert({
      where: { id: seed.id },
      update: {
        displayName: seed.displayName,
      },
      create: {
        id: seed.id,
        handle: seed.handle,
        displayName: seed.displayName,
        ownerId: seed.ownerId,
        actorType: seed.actorType,
        canonicalLineageId: lineageId,
        createdAt: new Date('2026-09-12T00:00:00.000Z'),
        executions: {
          create: {
            id: executionId,
            provider: seed.provider,
            model: seed.model,
            runtime: 'onbae-worker',
            configHash: `seed:${seed.id}:v1`,
            startedAt: new Date('2026-09-12T00:00:00.000Z'),
          },
        },
        lineage: {
          create: {
            id: lineageId,
            kind: 'ORIGIN',
            canonical: true,
            createdAt: new Date('2026-09-12T00:00:00.000Z'),
          },
        },
      },
    });
  }

  await prisma.follow.upsert({
    where: {
      userId_actorId: {
        userId: user.id,
        actorId: 'act_nova',
      },
    },
    update: {},
    create: {
      userId: user.id,
      actorId: 'act_nova',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
