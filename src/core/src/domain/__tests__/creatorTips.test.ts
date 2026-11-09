// 운동 팁 데이터 무결성 · 출처 규칙 · 문구 안전 · 조회 도우미 순위/결정성 (SPEC-047 · SRS-112 · SRS-092)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_EXERCISES } from '../../data/seed/exercises.seed';
import { CHANNEL_NAMES_KO, youtubeWatchUrl } from '../creatorRoutines';
import {
  CREATOR_TIPS,
  type CreatorTip,
  TIP_TOPICS,
  chapterTimeLabel,
  preWorkoutTip,
  tipById,
  tipsFor,
  tipsForExercise,
  tipWatchUrl,
  visibleTipTopics,
} from '../creatorTips';
import { containsMedicalClaim } from '../wellness';

const slugId = (en: string) => `seed-${en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
const activeIds = new Set(SEED_EXERCISES.filter((e) => !e.isArchived).map((e) => slugId(e.nameEn)));
const MUSCLES = new Set([
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'traps', 'fullBody',
]);
const shown = CREATOR_TIPS.filter((t) => !t.draft && !t.hidden);

/** 팁 전용 금지어 — 웰니스 게이트(wellness.ts)가 못 잡는 통증·재활·효과 단정(스펙 리뷰 C3) */
const TIP_FORBIDDEN = ['통증 해결', '통증이 사라', '통증을 없애', '디스크 치료', '재활 효과', '교정 효과', '예방 효과', '부상 방지', '보장', '확실히', '무조건'];
const ownTexts = (t: CreatorTip) => [
  t.titleKo,
  ...t.pointsKo.map((p) => p.text),
  t.cautionKo ?? '',
  ...(t.chapters ?? []).map((c) => c.labelKo),
];

test('주제 5개 · 첫판 팁 ≥20 · 주제마다 서로 다른 채널 ≥2', () => {
  assert.deepEqual(TIP_TOPICS.map((t) => t.id), ['stretch', 'warmup', 'form', 'injury', 'recovery']);
  assert.ok(shown.length >= 20, `팁 ${shown.length}개`);
  for (const t of TIP_TOPICS) {
    const channels = new Set(tipsFor(t.id).map((x) => x.source.channel));
    assert.ok(channels.size >= 2, `${t.id}: 채널 ${channels.size}개`);
  }
});

test('팁 데이터: id 유일 · 영상 하나는 한 팁에만 · 출처 필드 · 부위 · 종목 · 챕터 · 요점', () => {
  const ids = new Set<string>();
  const videos = new Set<string>();
  for (const t of CREATOR_TIPS) {
    assert.match(t.id, /^tip-[a-z0-9-]+$/, `id 형식 ${t.id}`);
    assert.ok(!ids.has(t.id), `id 중복 ${t.id}`);
    ids.add(t.id);
    if (!t.hidden && !t.draft) {
      assert.ok(!videos.has(t.source.videoId), `영상 중복 ${t.source.videoId}`);
      videos.add(t.source.videoId);
    }
    assert.ok(TIP_TOPICS.some((x) => x.id === t.topicId), `${t.id} 주제`);
    assert.match(t.source.videoId, /^[A-Za-z0-9_-]{11}$/, `${t.id} videoId`);
    assert.ok(t.source.title.trim() && t.source.channel.trim(), `${t.id} 제목·채널`);
    assert.match(t.source.channelUrl, /^https:\/\/www\.youtube\.com\/@/, `${t.id} 채널 주소`);
    assert.match(t.source.verifiedAt, /^\d{4}-\d{2}-\d{2}$/, `${t.id} verifiedAt`);
    if (t.basis) assert.match(t.basis.url, /^https:\/\//, `${t.id} basis url`);
    assert.ok(['before', 'after', 'anytime'].includes(t.moment), `${t.id} moment`);
    assert.ok(t.titleKo.trim().length >= 4 && t.titleKo.length <= 30, `${t.id} 제목 길이`);
    // 부위 ≥1 · 'other' 금지
    assert.ok(t.muscles.length >= 1, `${t.id} 부위 없음`);
    for (const m of t.muscles) assert.ok(MUSCLES.has(m), `${t.id} 부위 ${m}`);
    for (const id of t.exerciseIds ?? []) assert.ok(activeIds.has(id), `${t.id}: 활성 시드에 없는 종목 ${id}`);
    // 요점 2~5줄 · 줄마다 근거 · basis 근거는 basis 가 있을 때만
    assert.ok(t.pointsKo.length >= 2 && t.pointsKo.length <= 5, `${t.id} 요점 ${t.pointsKo.length}줄`);
    for (const p of t.pointsKo) {
      assert.ok(p.text.trim().length >= 8 && p.text.length <= 80, `${t.id} 요점 길이 「${p.text}」`);
      assert.ok(['desc', 'chapter', 'basis'].includes(p.from), `${t.id} 요점 근거 없음 「${p.text}」`);
      if (p.from === 'basis') assert.ok(t.basis, `${t.id}: basis 근거인데 basis 가 없다`);
      if (p.from === 'chapter') assert.ok(t.chapters?.length, `${t.id}: 챕터 근거인데 챕터가 없다`);
    }
    // 챕터 초 오름차순 · 정수 · 겹침 없음
    const secs = (t.chapters ?? []).map((c) => c.sec);
    for (let i = 0; i < secs.length; i++) {
      assert.ok(Number.isInteger(secs[i]) && secs[i]! >= 0, `${t.id} 챕터 초 ${secs[i]}`);
      if (i > 0) assert.ok(secs[i]! > secs[i - 1]!, `${t.id} 챕터 초 순서`);
    }
    for (const c of t.chapters ?? []) assert.ok(c.labelKo.trim().length >= 2, `${t.id} 챕터 이름`);
  }
});

test('source 키 순서가 점검 스크립트 정규식과 같다(videoId→title→channel→channelUrl→verifiedAt)', () => {
  const text = readFileSync(join(import.meta.dirname, '..', 'creatorTips.ts'), 'utf8');
  const declared = (text.match(/videoId:\s*'/g) ?? []).length;
  const parsed = [
    ...text.matchAll(
      /videoId:\s*'([A-Za-z0-9_-]{11})',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*channel:\s*'((?:[^'\\]|\\.)*)',\s*channelUrl:\s*'[^']*',\s*verifiedAt:\s*'\d{4}-\d{2}-\d{2}'/g,
    ),
  ].length;
  assert.equal(parsed, declared);
  assert.equal(declared, CREATOR_TIPS.length);
});

test('문구: 의료 단정·보장 없음 · 제목·요점·챕터에 채널명·실명 없음', () => {
  const names = Object.values(CHANNEL_NAMES_KO).flatMap((n) => [n, ...n.split(' ').filter((p) => p.length >= 2)]);
  for (const t of CREATOR_TIPS) {
    const parts = t.source.channel.split(/[\s_|]+/).filter((p) => p.length >= 2);
    for (const text of ownTexts(t)) {
      if (!text) continue;
      assert.equal(containsMedicalClaim(text), false, `${t.id} 의료 단정 「${text}」`);
      for (const w of TIP_FORBIDDEN) assert.ok(!text.includes(w), `${t.id}: 「${text}」 에 금지어 ${w}`);
      for (const p of parts) assert.ok(!text.includes(p), `${t.id}: 「${text}」 에 채널명 ${p}`);
      for (const n of names) assert.ok(!text.includes(n), `${t.id}: 「${text}」 에 이름 ${n}`);
    }
  }
  for (const t of TIP_TOPICS) {
    assert.equal(containsMedicalClaim(t.blurbKo), false, `${t.id} blurb`);
    for (const w of TIP_FORBIDDEN) assert.ok(!t.blurbKo.includes(w), `${t.id} blurb 금지어 ${w}`);
  }
});

test('출처 이름: 화면에 나오는 팁 채널은 모두 한국 이름 표에 있다', () => {
  for (const t of shown) assert.ok(CHANNEL_NAMES_KO[t.source.channel.trim()], `${t.id}: 한국 이름 없음 ${t.source.channel}`);
});

test('다운로드 경로 없음 — 팁 데이터·화면·점검 스크립트에 자막·영상 받기 코드가 없다(SRS-092)', () => {
  const root = join(import.meta.dirname, '../../../..');
  const files = [
    'core/src/domain/creatorTips.ts',
    'frontend/app/components/routines/CreatorTipSheet.tsx',
    'frontend/app/components/routines/RelatedTips.tsx',
    'scripts/check-creator-routines.mjs',
    'scripts/youtube-search.mjs',
    'scripts/youtube-describe.mjs',
  ];
  for (const f of files) {
    let text: string;
    try {
      text = readFileSync(join(root, f), 'utf8');
    } catch {
      continue; // 아직 없는 화면 파일(Phase 2 전)
    }
    for (const bad of ['timedtext', 'yt-dlp', 'youtube-dl', 'captions.download', 'ytdl', 'commentThreads']) {
      assert.ok(!text.includes(bad), `${f}: ${bad}`);
    }
  }
});

test('조회: draft·hidden 제외 · 팁 없는 주제 숨김 · id 로 찾기', () => {
  for (const t of TIP_TOPICS) for (const x of tipsFor(t.id)) assert.ok(!x.draft && !x.hidden);
  const visible = new Set(visibleTipTopics().map((t) => t.id));
  for (const t of TIP_TOPICS) assert.equal(visible.has(t.id), tipsFor(t.id).length > 0);
  assert.equal(tipById(shown[0]!.id), shown[0]);
  assert.equal(tipById('tip-없는-id'), null);
});

// [원본] 조건부 단언(if 안)이라 데이터가 바뀌면 검사 없이 통과했다 — 고정 기댓값으로(코드 리뷰 REV-089 M-7)
test('종목 상세 관련 팁: 지목 먼저 → 겹친 부위 수 → 데이터 순서 · limit · fullBody 만 겹침은 제외', () => {
  const ids = (xs: CreatorTip[]) => xs.map((x) => x.id);
  // 지목한 팁만(부위 없음) — 바벨 스쿼트를 지목한 팁 둘, 데이터 순서
  assert.deepEqual(ids(tipsForExercise('seed-barbell-squat', [], 3)), ['tip-squat-prep-warmup', 'tip-squat-form']);
  // 지목이 부위 겹침보다 앞
  assert.equal(tipsForExercise('seed-barbell-squat', ['chest', 'shoulders'], 3)[0]?.id, 'tip-squat-prep-warmup');
  // 부위만 — 모두 그 부위를 가진다 · 겹친 부위 수 내림차순
  const chest = tipsForExercise('seed-없는-종목', ['chest'], 10);
  assert.ok(chest.length >= 3);
  for (const t of chest) assert.ok(t.muscles.includes('chest'));
  const legs = tipsForExercise('seed-없는-종목', ['quads', 'glutes', 'hamstrings'], 10);
  assert.ok(legs.length >= 3);
  const overlap = (t: CreatorTip) => t.muscles.filter((m) => ['quads', 'glutes', 'hamstrings'].includes(m)).length;
  for (let i = 1; i < legs.length; i++) assert.ok(overlap(legs[i - 1]!) >= overlap(legs[i]!), '겹침 내림차순');
  assert.equal(overlap(legs[0]!), 3);
  // limit
  assert.equal(tipsForExercise('seed-없는-종목', ['chest'], 1).length, 1);
  assert.deepEqual(tipsForExercise('seed-없는-종목', ['chest'], 0), []);
  // fullBody 만으로는 붙지 않는다(러닝머신 같은 전신 종목)
  assert.deepEqual(tipsForExercise('seed-treadmill-running', ['fullBody'], 3), []);
  // [원본] draft 팁은 지목·부위가 맞아도 나오지 않는다
  // [원본] assert.ok(!tipsForExercise('seed-없는-종목', ['abs', 'back'], 10).some((t) => t.id === 'tip-bracing-breath'));
  // [개선 2026-11-09] 복압 호흡 팁은 사용자 검수로 공개 — 부위(복근·등)가 맞으면 붙는다
  assert.ok(tipsForExercise('seed-없는-종목', ['abs', 'back'], 10).some((t) => t.id === 'tip-bracing-breath'));
});

test('시작 전 팁: 지목×2+부위가 이기고 · 동점은 dayNum 으로 · 겹침이 없으면 fullBody 일반 팁 · 빈 루틴 null', () => {
  assert.equal(preWorkoutTip([], ['chest'], 100), null);
  // 벤치프레스 지목 팁 둘(지목 2 + 가슴 1 = 3)이 동점 — 짝수 날 앞 것, 홀수 날 뒤 것
  assert.equal(preWorkoutTip(['seed-barbell-bench-press'], ['chest'], 20000)?.id, 'tip-bench-press-fixes');
  assert.equal(preWorkoutTip(['seed-barbell-bench-press'], ['chest'], 20001)?.id, 'tip-bench-shoulder-grip');
  assert.equal(preWorkoutTip(['seed-barbell-bench-press'], ['chest'], 20000), preWorkoutTip(['seed-barbell-bench-press'], ['chest'], 20000));
  // 부위가 겹치는 before 팁이 있으면 fullBody 일반 팁(0.5)은 진다
  const sh = preWorkoutTip(['seed-없는-종목'], ['shoulders'], 3);
  assert.ok(sh && sh.moment === 'before' && !sh.muscles.includes('fullBody'));
  // 겹치는 before 팁이 없는 부위(종아리) → fullBody 일반 팁끼리 날마다 번갈아
  assert.equal(preWorkoutTip(['seed-없는-종목'], ['calves'], 0)?.id, 'tip-treadmill-warmup');
  assert.equal(preWorkoutTip(['seed-없는-종목'], ['calves'], 1)?.id, 'tip-dynamic-warmup-6min');
  // 이상한 날 번호 — NaN 은 0 과 같고, 음수·큰 수도 before 팁 하나
  assert.equal(preWorkoutTip(['seed-없는-종목'], ['calves'], Number.NaN), preWorkoutTip(['seed-없는-종목'], ['calves'], 0));
  for (const d of [-1, -12345, 1e12, 0.7]) assert.equal(preWorkoutTip(['seed-없는-종목'], ['calves'], d)?.moment, 'before');
});

test('원본 영상 주소: 시각이 양수면 &t=초s · 0·음수·NaN·없음은 처음부터 · 실수는 내림', () => {
  assert.equal(youtubeWatchUrl('zJgwAAM_tNY'), 'https://www.youtube.com/watch?v=zJgwAAM_tNY');
  assert.equal(youtubeWatchUrl('zJgwAAM_tNY', 0), 'https://www.youtube.com/watch?v=zJgwAAM_tNY');
  assert.equal(youtubeWatchUrl('zJgwAAM_tNY', -5), 'https://www.youtube.com/watch?v=zJgwAAM_tNY');
  assert.equal(youtubeWatchUrl('zJgwAAM_tNY', Number.NaN), 'https://www.youtube.com/watch?v=zJgwAAM_tNY');
  assert.equal(youtubeWatchUrl('zJgwAAM_tNY', 455.9), 'https://www.youtube.com/watch?v=zJgwAAM_tNY&t=455s');
  const tip = tipById('tip-neck-strength');
  assert.ok(tip);
  assert.equal(tipWatchUrl(tip, 600), 'https://www.youtube.com/watch?v=zJgwAAM_tNY&t=600s');
  assert.equal(chapterTimeLabel(0), '0:00');
  assert.equal(chapterTimeLabel(455), '7:35');
  assert.equal(chapterTimeLabel(3725), '1:02:05');
  assert.equal(chapterTimeLabel(Number.NaN), '0:00');
});
