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
const unq = (s) => s.replace(/\\'/g, "'");
// [원본] 루틴 파일 하나만 읽었다 — 운동 팁(SPEC-047)도 같은 규칙으로 본다. 파일마다 declared === rows 를 따로 확인한다(qa D4)
// const text = readFileSync(join(here, "../core/src/domain/creatorRoutines.ts"), "utf8");
const FILES = ["../core/src/domain/creatorRoutines.ts", "../core/src/domain/creatorTips.ts"];
const SOURCE_RE =
  /videoId:\s*'([A-Za-z0-9_-]{11})',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*channel:\s*'((?:[^'\\]|\\.)*)',[\s\S]*?verifiedAt:\s*'(\d{4}-\d{2}-\d{2})'/g;
const rows = [];
let text = "";
for (const f of FILES) {
  const t = readFileSync(join(here, f), "utf8");
  text += t;
  const starts = [...t.matchAll(/videoId:\s*'/g)].map((m) => m.index);
  // 항목(객체) 경계 = 배열 원소의 시작 줄 「  {」 + 「    id: '」 — hidden 은 source 앞에도 뒤에도 올 수 있다(코드 리뷰 REV-089 H-1:
  // [원본] 「이 videoId ~ 다음 videoId」 구간으로 봐서 source 앞의 hidden 이 앞 항목으로 밀렸다)
  const objStarts = [...t.matchAll(/^ {2}\{\n {4}id: '/gm)].map((m) => m.index);
  const found = [...t.matchAll(SOURCE_RE)].map((m) => {
    const from = objStarts.filter((i) => i <= m.index).pop() ?? 0;
    const to = objStarts.find((i) => i > m.index) ?? t.length;
    const hidden = /^\s*hidden:\s*true/m.test(t.slice(from, to));
    return {
      file: f.split("/").pop(),
      videoId: m[1],
      title: unq(m[2]),
      channel: unq(m[3]),
      verifiedAt: m[4],
      hidden,
    };
  });
  if (!found.length || found.length !== starts.length) {
    console.error(
      `${f}: 데이터를 읽지 못했다 — videoId ${starts.length}개 중 ${found.length}개만 해석 — source 필드 순서(videoId·title·channel·…·verifiedAt)를 확인`,
    );
    process.exit(1);
  }
  rows.push(...found);
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
    // [원본] 숨긴 항목도 실패로 셌다 — 삭제된 영상을 숨긴 상태가 ✗ 로 남았다(qa D3)
    if (r.hidden) {
      console.log(`! ${r.videoId} ${r.channel} — oEmbed ${res.status}(숨긴 항목 · 데이터에서 빼도 된다)`);
      warn += 1;
      continue;
    }
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
