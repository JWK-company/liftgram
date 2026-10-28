// @plm SRS-091 SRS-092  크리에이터 루틴 데이터 무결성 · 출처 규칙 · 다운로드 경로 없음 (spec 20261028_creator-routines rev1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_EXERCISES } from '../../data/seed/exercises.seed';
import {
  CREATOR_ROUTINES,
  CREATOR_TOPICS,
  EXCLUDED_CHANNELS,
  creatorRoutineNotes,
  creatorRoutinesFor,
  visibleCreatorTopics,
  youtubeWatchUrl,
} from '../creatorRoutines';
import { containsMedicalClaim } from '../wellness';

const slugId = (en: string) => `seed-${en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
const activeIds = new Set(SEED_EXERCISES.filter((e) => !e.isArchived).map((e) => slugId(e.nameEn)));

test('주제 3개 · 주제마다 서로 다른 채널 버전 ≥2(draft 포함 전체 기준)', () => {
  assert.equal(CREATOR_TOPICS.length, 3);
  for (const t of CREATOR_TOPICS) {
    const channels = new Set(CREATOR_ROUTINES.filter((r) => r.topicId === t.id && !r.hidden).map((r) => r.source.channel));
    assert.ok(channels.size >= 2, `${t.id}: 채널 ${channels.size}개`);
  }
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

test('화면 노출: draft·hidden 은 빠지고, 버전 없는 주제는 숨는다', () => {
  for (const t of CREATOR_TOPICS) {
    for (const r of creatorRoutinesFor(t.id)) assert.ok(!r.draft && !r.hidden);
  }
  const visible = new Set(visibleCreatorTopics().map((t) => t.id));
  for (const t of CREATOR_TOPICS) assert.equal(visible.has(t.id), creatorRoutinesFor(t.id).length > 0);
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
