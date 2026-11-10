// @plm SRS-091 SRS-092  크리에이터 루틴 데이터 무결성 · 출처 규칙 · 다운로드 경로 없음 (spec 20261028_creator-routines rev1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_EXERCISES } from '../../data/seed/exercises.seed';
import {
  CREATOR_ROUTINES,
  CHANNEL_NAMES_KO,
  CREATOR_TOPICS,
  EXCLUDED_CHANNELS,
  creatorChannelLabel,
  creatorRoutineNotes,
  creatorRoutinesFor,
  visibleCreatorSections,
  visibleCreatorTopics,
  youtubeWatchUrl,
} from '../creatorRoutines';
import { containsMedicalClaim } from '../wellness';

const slugId = (en: string) => `seed-${en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
const activeIds = new Set(SEED_EXERCISES.filter((e) => !e.isArchived).map((e) => slugId(e.nameEn)));

// [원본] 주제 3개 · 주제마다 서로 다른 채널 버전 ≥2
// [원본] 프로 주제 8개 · 이름이 모두 「프로의 …」
test('프로 주제 8개 + 초보자 주제 3개 · 주제마다 서로 다른 채널 버전 ≥2 · 이름이 「프로의 …」 또는 「초보자 …」', () => {
  assert.equal(CREATOR_TOPICS.length, 11);
  assert.equal(CREATOR_TOPICS.filter((t) => t.nameKo.startsWith('프로의 ')).length, 8);
  assert.equal(CREATOR_TOPICS.filter((t) => t.nameKo.startsWith('초보자 ')).length, 3);
  for (const t of CREATOR_TOPICS) assert.match(t.nameKo, /^(프로의|초보자) /, t.id);
  for (const t of CREATOR_TOPICS) {
    const channels = new Set(CREATOR_ROUTINES.filter((r) => r.topicId === t.id && !r.hidden).map((r) => r.source.channel));
    assert.ok(channels.size >= 2, `${t.id}: 채널 ${channels.size}개`);
  }
});

test('영상 하나는 한 버전에만 · 저장 이름이 겹치지 않는다', () => {
  const shown = CREATOR_ROUTINES.filter((r) => !r.hidden && !r.draft);
  assert.equal(new Set(shown.map((r) => r.source.videoId)).size, shown.length);
  assert.equal(new Set(shown.map((r) => r.labelKo)).size, shown.length);
});

test('버전 데이터: 종목 실존·처방 범위·하루 안 중복 없음·출처 필드', () => {
  const ids = new Set<string>();
  for (const r of CREATOR_ROUTINES) {
    assert.ok(!ids.has(r.id), `id 중복 ${r.id}`);
    ids.add(r.id);
    assert.match(r.source.videoId, /^[A-Za-z0-9_-]{11}$/, `${r.id} videoId`);
    assert.ok(r.source.title.trim() && r.source.channel.trim(), `${r.id} 제목·채널`);
    assert.match(r.source.channelUrl, /^https:\/\/www\.youtube\.com\/@/, `${r.id} 채널 주소`);
    assert.match(r.source.verifiedAt, /^\d{4}-\d{2}-\d{2}$/, `${r.id} verifiedAt`);
    assert.ok(r.days.length >= 1, `${r.id} 일 없음`);
    if (r.basis) assert.match(r.basis.url, /^https:\/\//, `${r.id} basis url`);
    for (const d of r.days) {
      const seen = new Set<string>();
      assert.ok(d.items.length >= 1, `${r.id}/${d.nameKo} 종목 없음`);
      for (const it of d.items) {
        assert.ok(activeIds.has(it.exerciseId), `${r.id}/${d.nameKo}: 활성 시드에 없는 종목 ${it.exerciseId}`);
        assert.ok(!seen.has(it.exerciseId), `${r.id}/${d.nameKo}: 같은 종목 두 번 ${it.exerciseId}`);
        seen.add(it.exerciseId);
        assert.ok(Number.isInteger(it.sets) && it.sets >= 1 && it.sets <= 10, `${r.id} ${it.exerciseId} sets`);
        assert.ok(it.repsMin >= 1 && it.repsMin <= it.repsMax && it.repsMax <= 50, `${r.id} ${it.exerciseId} reps`);
        assert.ok(['video', 'default'].includes(it.src.sets) && ['video', 'default'].includes(it.src.reps));
      }
    }
  }
});

test('이름·요약에 채널명(실명)이 없다 · 의료 단정 없음 · 제외 채널 없음 (qa H-2·M-5)', () => {
  for (const r of CREATOR_ROUTINES) {
    const own = [r.labelKo, r.summaryKo, ...r.days.map((d) => d.nameKo), ...r.days.flatMap((d) => d.items.map((i) => i.noteKo ?? ''))];
    // 채널명에서 이름 덩어리(공백·밑줄·영문 구분) — 「제로범TV _김영범」 → 제로범TV · 김영범
    const parts = r.source.channel.split(/[\s_|]+/).filter((p) => p.length >= 2);
    for (const text of own) {
      for (const p of parts) assert.ok(!text.includes(p), `${r.id}: 「${text}」 에 채널명 ${p}`);
    }
    assert.equal(containsMedicalClaim(r.summaryKo), false, `${r.id} summary 의료 단정`);
    for (const x of EXCLUDED_CHANNELS) {
      assert.ok(!r.source.channel.includes(x) && !r.source.title.includes(x), `${r.id}: 제외 채널 ${x}`);
    }
  }
  for (const t of CREATOR_TOPICS) {
    assert.equal(containsMedicalClaim(t.blurbKo), false, `${t.id} blurb 의료 단정`);
  }
});

test('초보자 주제에 황철순 영상이 있다 — 사용자 지시(2026-11-06)', () => {
  const part = creatorRoutinesFor('beginner-part');
  assert.ok(part.some((r) => r.source.channel === 'CHUL SOON HWANG'));
  assert.equal(creatorChannelLabel('CHUL SOON HWANG'), '황철순(CHUL SOON HWANG)');
});

test('출처 이름: 화면에 나오는 채널 모두 한국 이름이 있고 「이름(채널명)」 형태 · 루틴 이름에는 쓰지 않는다', () => {
  assert.equal(creatorChannelLabel('Chris Bumstead'), '크리스 범스테드(Chris Bumstead)');
  assert.equal(creatorChannelLabel('Allright24_박재훈'), '박재훈(Allright24_박재훈)');
  assert.equal(creatorChannelLabel('강경원'), '강경원');
  assert.equal(creatorChannelLabel('없는 채널 '), '없는 채널');
  // 저장 메모는 「이름(채널명)」으로 시작한다 — 채널 원문의 앞뒤 공백은 뺀다
  const padded = CREATOR_ROUTINES.find((x) => x.source.channel === ' Allright24_박재훈');
  assert.ok(padded, '앞 공백이 있는 채널 행이 있어야 한다');
  assert.ok(creatorRoutineNotes(padded).startsWith('출처: 박재훈(Allright24_박재훈) 「'));
  // 이름 조각(성만·이름만)도 루틴 이름·요약에 쓰지 않는다
  const names = Object.values(CHANNEL_NAMES_KO).flatMap((n) => [n, ...n.split(' ').filter((p) => p.length >= 2)]);
  for (const r of CREATOR_ROUTINES.filter((x) => !x.hidden && !x.draft)) {
    assert.ok(CHANNEL_NAMES_KO[r.source.channel.trim()], `${r.id}: 한국 이름 없음 ${r.source.channel}`);
    for (const text of [r.labelKo, r.summaryKo, ...r.days.map((d) => d.nameKo), ...r.days.flatMap((d) => d.items.map((i) => i.noteKo ?? ''))]) {
      for (const n of names) assert.ok(!text.includes(n), `${r.id}: 「${text}」 에 이름 ${n}`);
    }
  }
});

test('화면 노출: draft·hidden 은 빠지고, 버전 없는 주제는 숨는다', () => {
  for (const t of CREATOR_TOPICS) {
    for (const r of creatorRoutinesFor(t.id)) assert.ok(!r.draft && !r.hidden);
  }
  const visible = new Set(visibleCreatorTopics().map((t) => t.id));
  for (const t of CREATOR_TOPICS) assert.equal(visible.has(t.id), creatorRoutinesFor(t.id).length > 0);
});

test('운동 탭 분류: 프로 다음에 초보자, 주제가 빠짐없이 한 분류에만 들어간다', () => {
  const sections = visibleCreatorSections();
  assert.deepEqual(sections.map((s) => s.section), ['pro', 'beginner']);
  for (const t of sections[0]!.topics) assert.match(t.nameKo, /^프로의 /, t.id);
  for (const t of sections[1]!.topics) assert.match(t.nameKo, /^초보자 /, t.id);
  assert.deepEqual(
    sections.flatMap((s) => s.topics.map((t) => t.id)).sort(),
    visibleCreatorTopics().map((t) => t.id).sort(),
  );
});

test('저장 메모는 설명란이 아닌 근거와 기본값을 밝힌다', () => {
  const byComment = CREATOR_ROUTINES.find((x) => x.id === 'cr-bg-pt-chest-hcs');
  assert.ok(byComment);
  const n = creatorRoutineNotes(byComment);
  assert.match(n, /루틴 근거: 시청자가 댓글에 정리한 내용/);
  assert.match(n, /앱 기본값/);
  const byDescription = CREATOR_ROUTINES.find((x) => x.id === 'cr-bg-sp-upper3');
  assert.ok(byDescription);
  assert.ok(!creatorRoutineNotes(byDescription).includes('루틴 근거'));
});

test('원본 주소·메모 형식', () => {
  assert.equal(youtubeWatchUrl('bZbfXY0-BhA'), 'https://www.youtube.com/watch?v=bZbfXY0-BhA');
  const r = CREATOR_ROUTINES[0];
  const n = creatorRoutineNotes(r);
  assert.ok(n.includes(r.source.channel) && n.includes(r.source.title) && n.includes(youtubeWatchUrl(r.source.videoId)));
});

test('영상·자막 내려받기 경로가 코드에 없다 (SRS-092 · qa M-6)', () => {
  const root = join(import.meta.dirname, '../../../..');
  const files = [
    join(root, 'core/src/domain/creatorRoutines.ts'),
    join(root, 'scripts/check-creator-routines.mjs'),
    join(root, 'scripts/youtube-describe.mjs'),
    join(root, 'frontend/app/components/routines/CreatorRoutineSheet.tsx'),
  ];
  const banned = /ytdl|youtube-dl|yt-dlp|timedtext|captions\.download|\/captions\b|get_video_info/i;
  for (const f of files) {
    let src = '';
    try {
      src = readFileSync(f, 'utf8');
    } catch {
      continue; // 아직 없는 파일
    }
    // 주석 속 설명(「자막은 내려받지 않는다」)은 허용 — 코드 줄만 본다
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join('\n');
    assert.ok(!banned.test(code), `${f}: 다운로드 경로 의심`);
  }
  assert.ok(readdirSync(join(root, 'scripts')).length > 0);
});

test('보강(SPEC-047): 프로 전신·푸시·초보자 분할은 7개 이상 — 모든 주제가 7개 이상 화면에 있다', () => {
  for (const id of ['pro-full', 'pro-push', 'beginner-split'] as const) {
    assert.ok(creatorRoutinesFor(id).length >= 7, `${id}: ${creatorRoutinesFor(id).length}개`);
  }
  for (const t of CREATOR_TOPICS) assert.ok(creatorRoutinesFor(t.id).length >= 7, `${t.id}: ${creatorRoutinesFor(t.id).length}개`);
});

test('스크립트 보완(ADR-063): atSec 은 0 이상 정수 · scriptCheckedAt 은 날짜 형식', () => {
  for (const r of CREATOR_ROUTINES) {
    if (r.scriptCheckedAt !== undefined) assert.match(r.scriptCheckedAt, /^\d{4}-\d{2}-\d{2}$/, `${r.id} scriptCheckedAt`);
    for (const d of r.days)
      for (const it of d.items)
        if (it.atSec !== undefined)
          assert.ok(Number.isInteger(it.atSec) && it.atSec >= 0 && it.atSec < 6 * 3600, `${r.id} ${it.exerciseId} atSec ${it.atSec}`);
  }
});
