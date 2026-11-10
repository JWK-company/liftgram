// 영상·글 → 루틴 초안 평가(SPEC-054 Phase 1) — 영상 루틴(CREATOR_ROUTINES)의 설명란을 공식 Data API 로 읽어
// 규칙 해석(buildImportDraft) 결과를 사람이 정리한 루틴(정답)과 비교한다. **숫자만 출력**하고 설명란 원문은 어디에도 쓰지 않는다.
//
// 쓰는 법(src 에서): node --import tsx scripts/eval-video-import.mjs [--all] [--list]
//   YOUTUBE_API_KEY 는 src/.env 에서 읽는다(환경 변수가 이긴다). 호출 = 50개당 1단위.
//   --all  : 설명란에 처방 줄이 없는 영상도 포함해 숫자를 함께 보인다
//   --list : 영상별 한 줄(id · 정밀도 · 재현율) — 규칙 고칠 때만
//   --diff : 영상별 넘친 종목(+)·놓친 종목(-) 이름 — 규칙 고칠 때만(종목 이름만, 원문 없음)
//
// 지표(스펙 리뷰 P11):
//   대상 = 설명란을 해석했을 때 처방 줄이 2개 이상인 영상(「설명란에 처방이 있는 영상」)
//   종목 정밀도·재현율 — 종목 id 일치 · family 일치를 따로
//   세트·횟수 정확도 — 정답 칸이 video(영상이 말한 값)이고 종목이 맞은 줄만
//   날 수 일치 · atSec 차이(둘 다 있을 때 중앙값)
// [원본] 합격선: 정밀도 0.8 이상 · 재현율 0.6 이상(종목 id 기준이 아닌 family 기준도 함께 본다).
// [개선] 코드 리뷰 REV-114(T2~T5) — 대상은 해석기와 무관한 정규식으로 고르고(선택 편향 제거), 합격선은
//   자동 줄 id 정밀도 ≥ 0.85 · 상위 3후보 줄 정밀도 ≥ 0.80 · 설명란에 이름이 그대로 나온 정답(독립 기준) 재현율 ≥ 0.75 ·
//   세트·횟수 읽은 것의 정확도 ≥ 0.90. 옛 지표(전체 정밀도·재현율)는 참고로 함께 낸다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CREATOR_ROUTINES } from "../core/src/domain/creatorRoutines.ts";
import { seedIdOf } from "../core/src/domain/nameKey.ts";
import {
  buildImportDraft,
  buildMentionIndex,
  draftFromLines,
  findMentions,
  splitImportLines,
} from "../core/src/domain/videoImport/index.ts";
import { SEED_EXERCISES } from "../core/src/data/seed/exercises.seed.ts";

const here = dirname(fileURLToPath(import.meta.url));
function envKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  try {
    for (const line of readFileSync(join(here, "..", ".env"), "utf8").split("\n")) {
      const m = /^YOUTUBE_API_KEY=(.*)$/.exec(line.trim());
      if (m) return m[1].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
  return null;
}
const key = envKey();
if (!key) {
  console.error("YOUTUBE_API_KEY 가 없습니다(src/.env 또는 환경 변수)");
  process.exit(1);
}
const all = process.argv.includes("--all");
const list = process.argv.includes("--list");
const diff = process.argv.includes("--diff"); // 종목 이름만(원문 없음) — 넘친 것 + / 놓친 것 -

const exercises = SEED_EXERCISES.map((e) => ({
  id: seedIdOf(e.nameEn),
  nameKo: e.nameKo,
  nameEn: e.nameEn,
  aliases: e.aliases,
  equipment: e.equipment,
  family: e.family,
  isArchived: e.isArchived,
}));
const famOf = new Map(exercises.map((e) => [e.id, e.family ?? e.id]));
const exById = new Map(exercises.map((e) => [e.id, e]));
const idx = buildMentionIndex(exercises);

// EVAL_SKIP=id,id — 정답이 프로그램 일부만 담은 루틴을 빼고 따로 잴 때(진단용)
const skipIds = new Set((process.env.EVAL_SKIP ?? "").split(",").filter(Boolean));
const routines = CREATOR_ROUTINES.filter((r) => !r.hidden && !r.draft && !skipIds.has(r.id));
const ids = [...new Set(routines.map((r) => r.source.videoId))];
const desc = new Map();
for (let i = 0; i < ids.length; i += 50) {
  const chunk = ids.slice(i, i + 50);
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${chunk.join(",")}&fields=items(id,snippet/description)`,
    { headers: { "X-Goog-Api-Key": key } },
  );
  if (!res.ok) {
    console.error(`Data API ${res.status}`);
    process.exit(1);
  }
  for (const v of (await res.json()).items ?? []) desc.set(v.id, v.snippet?.description ?? "");
}

const sum = {
  reach: 0,
  reachHit: 0,
  predCandOk: 0,
  candHit: 0,
  videos: 0,
  pred: 0,
  truth: 0,
  hitId: 0,
  hitFam: 0,
  predFam: 0,
  srCells: 0,
  srHit: 0,
  daysOk: 0,
  atDiffs: [],
};
const rows = [];
for (const r of routines) {
  const d = desc.get(r.source.videoId);
  if (d == null) continue;
  const stated = draftFromLines(idx, splitImportLines(d, "desc")).stated;
  // [원본] if (!all && stated < 2) continue; — 해석기 출력으로 대상을 골라 지표가 부풀었다(T2)
  const rxLines = d.split("\n").filter((l) => /\d+\s*[x×X]\s*\d+|\d+\s*(?:sets?\b|세트)/i.test(l)).length;
  if (!all && rxLines < 2) {
    sum.skipped = (sum.skipped ?? 0) + 1;
    continue;
  }
  const draft = buildImportDraft(idx, { description: d });
  const pred = draft.days.flatMap((x) => x.items).filter((i) => i.exerciseId);
  const truth = r.days.flatMap((x) => x.items);
  const truthIds = new Set(truth.map((i) => i.exerciseId));
  const truthFam = new Set(truth.map((i) => famOf.get(i.exerciseId)));
  const predIds = new Set(pred.map((i) => i.exerciseId));
  const hitId = [...predIds].filter((x) => truthIds.has(x)).length;
  const predFam = new Set(pred.map((i) => famOf.get(i.exerciseId)));
  const hitFam = [...predFam].filter((x) => truthFam.has(x)).length;
  // 후보(확인 필요 줄의 후보 칩) 안에 정답이 있으면 — 사용자가 한 번 눌러 고칠 수 있다
  const candHit = [...truthIds].filter((t) => pred.some((x) => x.candidates.includes(t))).length;
  sum.candHit += candHit;
  // 설명란에서 닿을 수 있는 정답 — 설명란 어디엔가 이름·별칭이 나온 종목(큐레이션이 스크립트에서 가져온 종목은 뺀다)
  const anywhere = new Set(findMentions(idx, d).flatMap((m) => m.term.ids));
  const reach = [...truthIds].filter(
    (t) => anywhere.has(t) || [...anywhere].some((a) => famOf.get(a) === famOf.get(t)),
  );
  sum.reach += reach.length;
  sum.reachHit += reach.filter((t) =>
    pred.some((x) => x.candidates.includes(t) || x.exerciseId === t),
  ).length;
  // 후보 기준 정밀도 — 예측 줄의 후보 안에 정답이 있으면 맞음(확인 화면에서 한 번 눌러 고친다)
  sum.predCandOk += pred.filter(
    (x) => x.candidates.some((c) => truthIds.has(c)) || truthIds.has(x.exerciseId),
  ).length;
  sum.predItems = (sum.predItems ?? 0) + pred.length;
  // 자동 줄(확인 표시 없이 저장될 줄)의 id 정밀도 · 상위 3후보 정밀도(T3)
  const autos = pred.filter((x) => x.status === "auto");
  sum.auto = (sum.auto ?? 0) + autos.length;
  sum.autoOk = (sum.autoOk ?? 0) + autos.filter((x) => truthIds.has(x.exerciseId)).length;
  sum.top3Ok =
    (sum.top3Ok ?? 0) +
    pred.filter((x) => [x.exerciseId, ...x.candidates.slice(0, 3)].some((c) => truthIds.has(c))).length;
  // 독립 기준 닿는 정답 — 설명란에 이름·영문명·별칭이 글자 그대로 나온 정답(매처와 무관 · T3)
  const low = d.toLowerCase().normalize("NFKC");
  const flat = low.replace(/\s+/g, "");
  const literal = [...truthIds].filter((t) => {
    const e = exById.get(t);
    if (!e) return false;
    return [e.nameKo, e.nameEn, ...(e.aliases ?? [])].some((n) => {
      const k = n.toLowerCase().normalize("NFKC");
      return k.length >= 3 && (low.includes(k) || flat.includes(k.replace(/\s+/g, "")));
    });
  });
  sum.lit = (sum.lit ?? 0) + literal.length;
  sum.litHit = (sum.litHit ?? 0) + literal.filter((t) => predIds.has(t)).length;
  if (r.days.length > 1) {
    sum.multi = (sum.multi ?? 0) + 1;
    if (draft.days.length === r.days.length) sum.multiOk = (sum.multiOk ?? 0) + 1;
  } else sum.single = (sum.single ?? 0) + 1;
  sum.videos += 1;
  sum.pred += predIds.size;
  sum.truth += truthIds.size;
  sum.hitId += hitId;
  sum.predFam += predFam.size;
  sum.hitFam += hitFam;
  if ((draft.days.length || 1) === r.days.length) sum.daysOk += 1;
  for (const t of truth) {
    const p = pred.find((x) => x.exerciseId === t.exerciseId);
    if (!p) continue;
    if (t.src?.sets === "video") {
      sum.srCells += 1;
      if (p.setsStated && p.sets === t.sets) sum.srHit += 1;
      if (p.setsStated) {
        sum.srRead = (sum.srRead ?? 0) + 1;
        if (p.sets === t.sets) sum.srReadOk = (sum.srReadOk ?? 0) + 1;
      }
    }
    if (t.src?.reps === "video") {
      sum.srCells += 1;
      if (p.repsStated && p.repsMin === t.repsMin && p.repsMax === t.repsMax) sum.srHit += 1;
      if (p.repsStated) {
        sum.srRead = (sum.srRead ?? 0) + 1;
        if (p.repsMin === t.repsMin && p.repsMax === t.repsMax) sum.srReadOk = (sum.srReadOk ?? 0) + 1;
      }
    }
    if (t.atSec != null && p.atSec != null) sum.atDiffs.push(Math.abs(t.atSec - p.atSec));
  }
  if (diff) {
    const nm = (id) => idx.nameKo.get(id) ?? id;
    const plus = [...predIds].filter((x) => !truthIds.has(x)).map(nm);
    const minus = [...truthIds].filter((x) => !predIds.has(x)).map(nm);
    if (plus.length || minus.length) console.log(`${r.id}\n  + ${plus.join(", ")}\n  - ${minus.join(", ")}`);
  }
  rows.push(
    `${r.id} · 날 예측 ${draft.days.length} 정답 ${r.days.length} · 설명란 처방 ${stated}줄 · 예측 ${predIds.size} · 정답 ${truthIds.size} · id 맞음 ${hitId} · family 맞음 ${hitFam}`,
  );
}
const f = (a, b) => (b ? (a / b).toFixed(2) : "—");
const med = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : "—");
if (list) console.log(rows.join("\n"));
console.log(
  `대상 영상 ${sum.videos}개(${all ? "전체" : "설명란에 처방 줄 2개 이상"}) / 보이는 영상 루틴 ${routines.length}개`,
);
console.log(`종목 정밀도 id ${f(sum.hitId, sum.pred)} · family ${f(sum.hitFam, sum.predFam)}`);
console.log(`종목 재현율 id ${f(sum.hitId, sum.truth)} · family ${f(sum.hitFam, sum.truth)}`);
console.log(
  `후보 안에 정답(재현율) ${f(sum.candHit, sum.truth)} · 설명란에서 닿는 정답 기준 ${f(sum.reachHit, sum.reach)}(${sum.reach}개)`,
);
console.log(`후보 기준 정밀도 ${f(sum.predCandOk, sum.predItems)}`);
console.log(`세트·횟수 정확도(정답이 video 인 칸) ${f(sum.srHit, sum.srCells)} (${sum.srCells}칸)`);
console.log(
  `날 수 일치 ${f(sum.daysOk, sum.videos)} · atSec 차이 중앙값 ${med(sum.atDiffs)}초(${sum.atDiffs.length}줄)`,
);
console.log(`── 합격선(REV-114) ── 정규식으로 고른 대상 ${sum.videos}개 · 뺀 영상 ${sum.skipped ?? 0}개`);
console.log(
  `자동 줄 id 정밀도 ${f(sum.autoOk, sum.auto)} (${sum.auto}줄) · 상위 3후보 줄 정밀도 ${f(sum.top3Ok, sum.predItems)}`,
);
console.log(`설명란에 이름이 그대로 나온 정답 재현율 ${f(sum.litHit, sum.lit)} (${sum.lit}개)`);
console.log(
  `세트·횟수 읽은 비율 ${f(sum.srRead ?? 0, sum.srCells)} · 읽은 것의 정확도 ${f(sum.srReadOk ?? 0, sum.srRead ?? 0)}`,
);
console.log(
  `날 수: 하루짜리 ${sum.single ?? 0}개(늘 1일로 답한 기준선 ${f(sum.single ?? 0, sum.videos)}) · 여러 날 ${sum.multi ?? 0}개 중 ${sum.multiOk ?? 0}개 맞음`,
);
// [원본] precision >= 0.8 && recall >= 0.6
const ok =
  (sum.autoOk ?? 0) / (sum.auto || 1) >= 0.85 &&
  (sum.top3Ok ?? 0) / (sum.predItems || 1) >= 0.8 &&
  (sum.litHit ?? 0) / (sum.lit || 1) >= 0.75 &&
  (sum.srReadOk ?? 0) / (sum.srRead || 1) >= 0.9;
console.log(ok ? "합격" : "불합격 — 규칙을 고쳐 다시 잰다");
