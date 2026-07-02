// 테스트/운영 보조 — MediaAsset.flagged 토글(스캐너 없이 자동보류 경로 검증용).
// 사용법: node scripts/flag-media.mjs <key> [true|false]
import { PrismaClient } from '@prisma/client';

const key = process.argv[2];
const flagged = process.argv[3] !== 'false';
if (!key) {
  console.error('usage: node scripts/flag-media.mjs <key> [true|false]');
  process.exit(1);
}
const prisma = new PrismaClient();
try {
  const r = await prisma.mediaAsset.updateMany({ where: { key }, data: { flagged } });
  console.log(`flagged ${key} = ${flagged} (rows ${r.count})`);
} finally {
  await prisma.$disconnect();
}
