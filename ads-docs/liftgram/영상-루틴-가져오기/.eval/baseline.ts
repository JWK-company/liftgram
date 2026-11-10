// 기존 규칙 해석기(SPEC-054) 점수 — 설명란 + 「텍스트」 칸에 시각 목록 댓글(가장 많이 좋아요)을 넣는다(사용자가 붙여 넣은 것과 같게)
import { readFileSync, writeFileSync } from 'node:fs';
import { CATALOG } from '/Users/woobi/Desktop/tarae/liftgram/src/core/src/data/catalog/catalog.generated';
import { buildImportDraft, buildMentionIndex } from '/Users/woobi/Desktop/tarae/liftgram/src/core/src/domain/videoImport/index';
const [vidsP, labP, outP, mode] = process.argv.slice(2);
const vids = JSON.parse(readFileSync(vidsP, 'utf8'));
const labels = JSON.parse(readFileSync(labP, 'utf8'));
const idx = buildMentionIndex(CATALOG.map((r: any) => ({ id: r.id, nameKo: r.nameKo, nameEn: r.nameEn, aliases: [...(r.aliasesKo ?? []), ...(r.aliasesEn ?? [])], family: r.family, equipment: r.equipment, isArchived: r.status === 'drop' })) as any);
const en = new Map(CATALOG.map((r: any) => [r.id, r.nameEn]));
const TS = /\d{1,2}:\d{2}/g;
const out: Record<string, string[]> = {};
for (const v of vids) {
  if (!labels[v.id]) continue;
  const cm = [...v.comments].filter((c: any) => (c.text.match(TS) ?? []).length >= 3).sort((a: any, b: any) => b.likes - a.likes)[0];
  const d = buildImportDraft(idx, { description: v.description, text: mode === 'nocomment' ? null : cm?.text ?? null } as any);
  const items = [...d.days.flatMap((x: any) => x.items), ...(d.mentionedOnly ?? [])];
  out[v.id] = items.filter((i: any) => i.exerciseId).map((i: any) => en.get(i.exerciseId) as string);
}
writeFileSync(outP, JSON.stringify(out, null, 1));
