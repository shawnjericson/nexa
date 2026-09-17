/**
 * Access tokens for the load test (load/README.md): signs them with the load instance's own
 * JWT_ACCESS_SECRET, so k6 doesn't spend the test logging thousands of people in. Also writes
 * which channels to send to and which of their members may send there.
 *
 *   pnpm --filter @nexa/api exec tsx scripts/load-tokens.ts ../../load/out
 *
 * Refuses to run against anything but a *_test database: the tokens are real.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../src/config/env';
import { prisma } from '../src/infrastructure/database/prisma';
import { JwtAccessTokenService } from '../src/modules/identity/infrastructure/jwt-access-token.service';

const outDir = process.argv[2] ?? 'load-out';
const PEOPLE = 5_000;
const SENDERS = 200;
// Long enough for a whole run.
const TTL_SECONDS = 4 * 60 * 60;

const [database] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
if (!database?.name.endsWith('_test')) {
  throw new Error(`Refusing to mint tokens for database "${database?.name}"`);
}

const organization = await prisma.organization.findUniqueOrThrow({
  where: { slug: 'load' },
  select: { id: true },
});
const tokens = new JwtAccessTokenService(env.JWT_ACCESS_SECRET, TTL_SECONDS);
const sign = async (userId: string) =>
  (await tokens.issue({ userId, sessionId: randomUUID() })).token;

const people = await prisma.user.findMany({
  where: { email: { endsWith: '@load.nexa.local' } },
  orderBy: { createdAt: 'desc' },
  take: PEOPLE,
  select: { id: true },
});
const users = [];
for (const person of people) users.push({ id: person.id, token: await sign(person.id) });

const channels: Record<string, { id: string; members: number; senders: string[] }> = {};
for (const slug of ['toan-cong-ty', 'kenh-5000', 'kenh-1000', 'nhom-1']) {
  const channel = await prisma.conversation.findFirstOrThrow({
    where: { organizationId: organization.id, slug },
    select: { id: true, _count: { select: { members: true } } },
  });
  const members = await prisma.conversationMember.findMany({
    where: { conversationId: channel.id },
    take: SENDERS,
    select: { userId: true },
  });
  const senders = [];
  for (const member of members) senders.push(await sign(member.userId));
  channels[slug] = { id: channel.id, members: channel._count.members, senders };
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'users.json'), JSON.stringify(users));
writeFileSync(
  join(outDir, 'meta.json'),
  JSON.stringify({ organizationId: organization.id, channels }, null, 2),
);
console.log(
  `${users.length} user tokens and ${Object.keys(channels).length} channels in ${outDir}`,
);
await prisma.$disconnect();
