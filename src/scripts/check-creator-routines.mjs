// @plm SRS-092  크리에이터 루틴 영상 점검 — 공식 oEmbed 로 영상이 아직 공개돼 있는지, 제목·채널이 데이터와 같은지 본다.
//
// 쓰는 법: node scripts/check-creator-routines.mjs   (배포 전 필수 · 실패면 종료 코드 1)
//   ✗ 실패 = 404(삭제·비공개) · 제목/채널 불일치 — 데이터를 고치거나 hidden: true
//   ! 경고 = 401/403(퍼가기 금지일 수 있음 — 링크는 동작) · verifiedAt 30일 경과(다시 확인) · draft(검수 전 — 화면 미노출)
// 데이터 파일을 import 하지 않고 텍스트로 읽는다(TS 빌드 없이 돌게). 영상·자막은 내려받지 않는다(ADR-045).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "../core/src/domain/creatorRoutines.ts"), "utf8");
const unq = (s) => s.replace(/\\'/g, "'");
const rows = [
  ...text.matchAll(
    /videoId:\s*'([A-Za-z0-9_-]{11})',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*channel:\s*'((?:[^'\\]|\\.)*)',[\s\S]*?verifiedAt:\s*'(\d{4}-\d{2}-\d{2})'/g,
  ),
].map((m) => ({ videoId: m[1], title: unq(m[2]), channel: unq(m[3]), verifiedAt: m[4] }));
const declared = (text.match(/videoId:\s*'/g) ?? []).length;
if (!rows.length || rows.length !== declared) {
  console.error(
    `데이터를 읽지 못했다: videoId ${declared}개 중 ${rows.length}개만 해석 — source 필드 순서(videoId·title·channel·…·verifiedAt)를 확인`,
  );
  process.exit(1);
}

const drafts = (text.match(/^\s*draft:\s*true/gm) ?? []).length;
if (drafts)
  console.log(`✗ draft: true 가 ${drafts}개 — 사람 검수 전 버전은 화면에 안 나간다(검수 뒤 지울 것)`);

const STALE_DAYS = 30;
let bad = 0;
let warn = drafts;
for (const r of rows) {
  const age = Math.floor((Date.now() - Date.parse(`${r.verifiedAt}T00:00:00Z`)) / 86_400_000);
  if (age > STALE_DAYS) {
    console.log(`! ${r.videoId} 확인한 지 ${age}일 — 영상을 다시 확인하고 verifiedAt 갱신`);
    warn += 1;
  }
  const u = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${r.videoId}`)}`;
  const res = await fetch(u, { headers: { "user-agent": "liftgram-curation-check" } });
  if (res.status === 401 || res.status === 403) {
    console.log(`! ${r.videoId} ${r.channel} — oEmbed ${res.status}(퍼가기 금지일 수 있음 · 링크는 동작)`);
    warn += 1;
    continue;
  }
  if (!res.ok) {
    console.log(`✗ ${r.videoId} ${r.channel} — oEmbed ${res.status}(삭제·비공개?) → hidden: true`);
    bad += 1;
    continue;
  }
  const o = await res.json();
  const issues = [];
  if (o.title !== r.title) issues.push(`제목 「${o.title}」`);
  if (o.author_name !== r.channel) issues.push(`채널 「${o.author_name}」`);
  if (issues.length) {
    console.log(`✗ ${r.videoId} 데이터와 다름: ${issues.join(" · ")}`);
    bad += 1;
  } else console.log(`✓ ${r.videoId} ${r.channel}`);
}
console.log(`\n${rows.length}개 중 실패 ${bad} · 경고 ${warn}`);
process.exit(bad ? 1 : 0);
