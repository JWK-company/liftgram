// 혼합: LLM 이 뽑은 종목 줄 → 기존 규칙 해석기로 카탈로그 맞추기
import { readFileSync, writeFileSync } from 'node:fs';
import { CATALOG } from '/Users/woobi/Desktop/tarae/liftgram/src/core/src/data/catalog/catalog.generated';
import { buildImportDraft, buildMentionIndex } from '/Users/woobi/Desktop/tarae/liftgram/src/core/src/domain/videoImport/index';
const [logP, outP] = process.argv.slice(2);
const log = JSON.parse(readFileSync(logP, 'utf8'));
const idx = buildMentionIndex(CATALOG.map((r: any) => ({ id: r.id, nameKo: r.nameKo, nameEn: r.nameEn, aliases: [...(r.aliasesKo ?? []), ...(r.aliasesEn ?? [])], family: r.family, equipment: r.equipment, isArchived: r.status === 'drop' })) as any);
const en = new Map(CATALOG.map((r: any) => [r.id, r.nameEn]));
const EQ: Record<string, string> = { 덤벨: '덤벨', 바벨: '바벨', 케이블: '케이블', 머신: '머신', 스미스: '스미스', 밴드: '밴드' };
const out: Record<string, string[]> = {};
for (const l of log) {
  const text = (l.extract ?? []).map((x: any) => {
    const eq = EQ[x.equipment] && !String(x.name).includes(EQ[x.equipment]) ? `${EQ[x.equipment]} ` : '';
    const sr = x.sets && x.reps ? ` ${x.sets}x${x.reps}` : ' 3x10';
    return `${eq}${x.name}${sr}`;
  }).join('\n');
  const d = text ? buildImportDraft(idx, { text } as any) : { days: [], mentionedOnly: [] } as any;
  out[l.id] = [...d.days.flatMap((x: any) => x.items), ...(d.mentionedOnly ?? [])].filter((i: any) => i.exerciseId).map((i: any) => en.get(i.exerciseId) as string);
}
writeFileSync(outP, JSON.stringify(out, null, 1));
