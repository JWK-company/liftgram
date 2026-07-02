// 사용자를 모더레이터로 승격(또는 강등). 모더레이션 큐 접근 권한 부여.
// 사용법: node scripts/grant-moderator.mjs <email> [role]
//   role 생략 시 moderator. 강등은 `node scripts/grant-moderator.mjs <email> user`.
import { PrismaClient } from '@prisma/client';

const email = process.argv[2];
const role = process.argv[3] ?? 'moderator';
if (!email) {
  console.error('usage: node scripts/grant-moderator.mjs <email> [role=moderator|admin|user]');
  process.exit(1);
}
if (!['user', 'moderator', 'admin'].includes(role)) {
  console.error(`invalid role: ${role} (user|moderator|admin)`);
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const u = await prisma.user.update({ where: { email }, data: { role } });
  console.log(`✓ ${email} → role=${u.role}`);
} catch {
  console.error(`✗ user not found: ${email}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
