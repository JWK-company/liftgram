// 영상·글 → 루틴 초안(SPEC-054 · SRS-116) — 규칙 해석 테스트.
// 예문은 모두 직접 쓴 글이다(영상 원문 아님 · ADR-063). 「처방 패턴 표」는 SPEC-054 의 표와 같다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEED_EXERCISES } from '../../data/seed/exercises.seed';
import { seedIdOf } from '../nameKey';
import {
  buildImportDraft,
  buildMentionIndex,
  countReview,
  countUnresolved,
  dayHeaderOf,
  findMentions,
  findYoutubeLink,
  fuzzyMention,
  looksLikeScript,
  parseClock,
  readPrescription,
  splitImportLines,
  splitLinkAndText,
  stemWord,
  toJamo,
  wordsToDigits,
} from '../videoImport';

const idx = buildMentionIndex(
  SEED_EXERCISES.map((e) => ({
    id: seedIdOf(e.nameEn),
    nameKo: e.nameKo,
    nameEn: e.nameEn,
    aliases: e.aliases,
    equipment: e.equipment,
    family: e.family,
    isArchived: e.isArchived,
  })),
);
const name = (id: string | null | undefined) => (id ? idx.nameKo.get(id) : null);
const items = (input: Parameters<typeof buildImportDraft>[1]) => buildImportDraft(idx, input).days.flatMap((d) => d.items);
const names = (input: Parameters<typeof buildImportDraft>[1]) => items(input).map((i) => name(i.exerciseId));

test('시각 읽기 — m:ss · h:mm:ss · 틀린 값', () => {
  assert.equal(parseClock('1:02'), 62);
  assert.equal(parseClock('1:02:03'), 3723);
  assert.equal(parseClock('1:72'), null);
  assert.equal(parseClock('abc'), null);
});

test('스크립트 복사본 줄 나누기 — 시각 줄+글 줄 · 길이 줄·챕터 줄 버림 · 한 줄 형식', () => {
  const ls = splitImportLines('챕터 1: 시작\n0:03\n3초\n첫 줄\n0:10 둘째 줄\n\n1 minute, 2 seconds\n1:05\n셋째', 'script');
  assert.deepEqual(
    ls.map((l) => [l.sec, l.text]),
    [
      [3, '첫 줄'],
      [10, '둘째 줄'],
      [65, '셋째'],
    ],
  );
});

test('스크립트 형식 자동 감지 — 시각 줄 쌍 · 짧은 간격 한 줄 형식 · 설명란 챕터는 아님', () => {
  assert.equal(looksLikeScript('0:01\n가\n0:04\n나\n0:07\n다\n0:10\n라'), true);
  const oneLine = Array.from({ length: 10 }, (_, i) => `0:${String(i * 4).padStart(2, '0')} 말 ${i}`).join('\n');
  assert.equal(looksLikeScript(oneLine), true);
  assert.equal(looksLikeScript('0:00 Intro\n1:20 Incline Press\n4:05 Bench\n7:30 Fly\nBench 4x8'), false);
  assert.equal(looksLikeScript('그냥 글'), false);
});

test('유튜브 링크 — watch · youtu.be(si) · shorts · live · m. · music. · t= · 나머지 글', () => {
  const id = 'AbCdEfGhIj0';
  for (const u of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?feature=share&v=${id}&list=PL1`,
    `https://youtu.be/${id}?si=xyz123`,
    `https://youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}?si=a`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
  ]) {
    assert.equal(findYoutubeLink(`보세요 ${u} 좋아요`)?.videoId, id, u);
  }
  assert.equal(findYoutubeLink(`https://youtu.be/${id}?t=90`)?.startSec, 90);
  assert.equal(findYoutubeLink(`https://www.youtube.com/watch?v=${id}&t=1m30s`)?.startSec, 90);
  const s = splitLinkAndText(`https://youtu.be/${id}?si=q 벤치 4x8`);
  assert.equal(s.link?.videoId, id);
  assert.equal(s.text, '벤치 4x8');
  assert.equal(splitLinkAndText(`https://youtu.be/${id}`).text, null);
  assert.equal(findYoutubeLink('https://example.com/watch?v=AbCdEfGhIj0'), null);
});

test('수 낱말 — 단위 앞만 숫자로', () => {
  assert.match(wordsToDigits('four sets of ten reps'), /4 sets of 10 reps/);
  assert.match(wordsToDigits('다섯 세트 열두 개'), /5세트 12개/);
  assert.match(wordsToDigits('three by ten'), /3 by 10/);
  assert.equal(wordsToDigits('one more thing'), 'one more thing');
  assert.equal(wordsToDigits('테스트 세트'), '테스트 세트');
});

// ── 처방 패턴 표(SPEC-054) ─────────────────────────────────────────────
type Want = Partial<{ sets: number; repsMin: number; repsMax: number; restSec: number; rounds: number; notes: string[] }>;
const TABLE: [string, Want][] = [
  // 세트·횟수(범위)
  ['4x8-10', { sets: 4, repsMin: 8, repsMax: 10 }],
  ['4 × 8~10', { sets: 4, repsMin: 8, repsMax: 10 }],
  ['3 by 10', { sets: 3, repsMin: 10, repsMax: 10 }],
  ['4 sets of 8 to 12', { sets: 4, repsMin: 8, repsMax: 12 }],
  ['3 sets x 15 reps', { sets: 3, repsMin: 15, repsMax: 15 }],
  ['3세트 12회', { sets: 3, repsMin: 12, repsMax: 12 }],
  ['12회 3세트', { sets: 3, repsMin: 12, repsMax: 12 }],
  ['4세트 8에서 12개', { sets: 4, repsMin: 8, repsMax: 12 }],
  // 리뷰 T6·T10 — 단독 a dozen · half a dozen · 휴식 분:초
  ['a dozen', { repsMin: 12, repsMax: 12 }],
  ['half a dozen reps', { repsMin: 6, repsMax: 6 }],
  ['rest 1:30', { restSec: 90 }],
  ['휴식 2:00', { restSec: 120 }],
  // 수 낱말
  ['네 세트 열 개씩', { sets: 4, repsMin: 10, repsMax: 10 }],
  ['four sets of ten', { sets: 4, repsMin: 10, repsMax: 10 }],
  ['두세 세트', { sets: 3 }],
  ['서너 세트', { sets: 4 }],
  ['한 10개 정도', { repsMin: 10, repsMax: 10 }],
  ['a couple of sets', { sets: 2 }],
  ['a dozen reps', { repsMin: 12, repsMax: 12 }],
  // 세트 범위
  ['3-4 sets', { sets: 4, notes: ['3~4세트'] }],
  // 피라미드
  ['12-10-8', { sets: 3, repsMin: 8, repsMax: 12, notes: ['피라미드 12·10·8'] }],
  ['20/15/10', { sets: 3, repsMin: 10, repsMax: 20, notes: ['피라미드 20·15·10'] }],
  ['(15,12,10,8)', { sets: 4, repsMin: 8, repsMax: 15, notes: ['피라미드 15·12·10·8'] }],
  // 워밍업
  ['워밍업 2세트 뒤 작업 3세트', { sets: 3, notes: ['워밍업 2세트 따로'] }],
  ['2 warm-up sets then 3 sets of 5', { sets: 3, repsMin: 5, notes: ['워밍업 2세트 따로'] }],
  // 한쪽씩
  ['한쪽 10개씩 3세트', { sets: 3, repsMin: 10, notes: ['한쪽씩'] }],
  ['10 each side', { repsMin: 10, notes: ['한쪽씩'] }],
  // 시간형
  ['30초 플랭크 3세트', { sets: 3, notes: ['30초 유지'] }],
  ['3x60s', { sets: 3, notes: ['60초 유지'] }],
  ['1분 버티기', { notes: ['1분 유지'] }],
  // 휴식
  ['rest 90 sec', { restSec: 90 }],
  ['90s rest', { restSec: 90 }],
  ['세트 사이 2분 휴식', { restSec: 120 }],
  ['1분 30초 쉬고', { restSec: 90 }],
  // 라운드
  ['3 rounds', { rounds: 3 }],
  ['3라운드', { rounds: 3 }],
  // 메모만
  ['3 sets to failure, RPE 9', { sets: 3, notes: ['실패 지점까지', 'RPE 9'] }],
  ['마지막은 드롭세트', { notes: ['드롭세트'] }],
  ['superset with curls, 2 RIR', { notes: ['슈퍼세트', 'RIR 2'] }],
  ['AMRAP', { notes: ['실패 지점까지'] }],
];
// 버려야 하는 숫자
const IGNORE: [string, Want][] = [
  ['100kg 5회', { repsMin: 5 }],
  ['225 for 5', { repsMin: 5 }],
  ['140x5', { repsMin: 5 }], // 무게×횟수
  ['60에 10개', { repsMin: 10 }],
  ['75% x 5', { repsMin: 5 }],
  ['3x5 @ 100kg', { sets: 3, repsMin: 5 }],
  ['두 번째 세트', {}],
  ['3세트째', {}],
  ['set 2', {}],
  ['마지막 세트', {}],
  ['3-1-1-0', { notes: ['템포 3-1-1-0'] }],
  ['tempo 3010', { notes: ['템포 3-0-1-0'] }],
  ['1 2 3 4 5', {}],
  ['10% off code', {}],
  ['2024', {}],
  ['1:23', {}],
  ['30초 버티기', { notes: ['30초 유지'] }], // 휴식 낱말 없음 → 휴식 아님
  ['20x5', { repsMin: 5 }], // 세트 10 넘음 → 무게×횟수
];

test('처방 패턴 표 — 맞게 읽음', () => {
  for (const [text, want] of TABLE) check(text, want);
});
test('처방 패턴 표 — 버림', () => {
  for (const [text, want] of IGNORE) check(text, want, true);
});

function check(text: string, want: Want, strictOthers = false) {
  const p = readPrescription(text);
  for (const [k, v] of Object.entries(want)) {
    if (k === 'notes') assert.deepEqual(p.notes, v, `${text} → notes`);
    else assert.equal(p[k as keyof typeof p], v, `${text} → ${k}`);
  }
  if (strictOthers) {
    for (const k of ['sets', 'repsMin', 'restSec'] as const) {
      if (!(k in want)) assert.equal(p[k], undefined, `${text} → ${k} 는 없어야`);
    }
    if (!('notes' in want)) assert.deepEqual(p.notes, [], `${text} → 메모 없어야`);
  }
}

test('칸 신뢰도 — 숫자 패턴 2 · 말 숫자 1', () => {
  assert.equal(readPrescription('4x8').setsConf, 2);
  assert.equal(readPrescription('네 세트 여덟 개').setsConf, 1);
  assert.equal(readPrescription('5 sets').setsConf, 1);
});

test('영문 어간 — curls·presses·pressing·squatting·flyes·raises·raised', () => {
  assert.equal(stemWord('curls'), 'curl');
  assert.equal(stemWord('presses'), 'press');
  assert.equal(stemWord('pressing'), 'press');
  assert.equal(stemWord('squatting'), 'squat');
  assert.equal(stemWord('flyes'), 'fly');
  assert.equal(stemWord('raises'), 'raise');
  assert.equal(stemWord('raised'), 'raise');
  assert.equal(stemWord('press'), 'press');
});

test('종목 언급 — 긴 말 우선 · 낱말 경계 · 조사 · 「랙」 제외 · 위치', () => {
  const m = findMentions(idx, 'Incline dumbbell press then cable crossover');
  assert.equal(m.length, 2);
  assert.equal(name(m[0].ids[0]), '덤벨 인클라인 프레스');
  assert.ok(m[0].start < m[1].start);
  assert.equal(findMentions(idx, 'he likes to throw a ball narrowly').length, 0); // row ⊄ throw·narrow
  assert.equal(name(findMentions(idx, '오늘은 바벨 스쿼트를 합니다')[0]?.ids[0]), '바벨 스쿼트');
  assert.equal(findMentions(idx, '스쿼트 랙에 바를 걸고').filter((x) => name(x.ids[0])?.includes('스쿼트')).length, 0);
});

test('모호한 말 — 처방·기구 단서 없으면 줄이 아니다', () => {
  assert.deepEqual(names({ text: '몸풀기 하고 시작해요\nfeel the stretch in your chest\n아놀드처럼 크게' }), []);
  assert.deepEqual(names({ text: '스트레칭 3세트' }).length, 1); // 처방이 붙으면 줄
});

test('영문 약어 — 대문자면 바로 · 소문자 일반 글이면 처방이 있어야', () => {
  assert.equal(names({ text: 'RDL 3x10' }).length, 1);
  assert.equal(names({ text: 'OHP 5x5\nRDL 3x8' }).length, 2);
});

test('기구 단서 — 조사가 붙어도 · family 형제가 있는데 단서가 없으면 확인 필요', () => {
  const db = items({ text: '덤벨로 벤치프레스 4x10' });
  assert.equal(db[0].status, 'auto');
  assert.match(name(db[0].exerciseId) ?? '', /덤벨/);
  const plain = items({ text: '벤치프레스 4x10' });
  assert.equal(plain[0].status, 'review');
  assert.ok(plain[0].candidates.length >= 2);
  assert.equal(name(plain[0].exerciseId), '바벨 벤치프레스'); // 첫 후보 = 맞은 말의 종목
  assert.equal(items({ text: '바벨 로우 4x8' })[0].status, 'auto'); // 이름에 기구가 있으면 확정
});

test('오타 허용 — 자모 거리 1 · 서로 가까운 말(인클라인/디클라인)은 믿지 않는다', () => {
  assert.equal(toJamo('벤치'), 'ㅂㅔㄴㅊㅣ');
  assert.equal(name(fuzzyMention(idx, '하이퍼익스텐숀')[0]), '하이퍼익스텐션');
  assert.deepEqual(fuzzyMention(idx, '인클라인바벨프래스').length <= 1, true);
  const it = items({ text: '하이퍼익스텐숀 3x15' });
  assert.equal(it[0].status === 'review' || it[0].status === 'auto', true);
});

test('설명란 — 챕터 줄 + 처방 목록이 같은 종목으로 합쳐진다 · 잡문 무시', () => {
  const it = items({
    description:
      'Chest day!\n0:00 Intro\n1:20 Incline Dumbbell Press\n4:05 Barbell Bench Press\n\nIncline DB Press 4x8-10\nBarbell Bench Press 3 x 6\nFollow me 2024 · 10% off code',
  });
  assert.deepEqual(
    it.map((i) => [name(i.exerciseId), i.sets, i.repsMin, i.repsMax, i.atSec, i.setsStated]),
    [
      ['덤벨 인클라인 프레스', 4, 8, 10, 80, true],
      ['바벨 벤치프레스', 3, 6, 6, 245, true],
    ],
  );
});

test('붙여 넣은 글(한국어 목록) — 순서·세트·휴식·횟수 미기재', () => {
  const it = items({ text: '1. 바벨 스쿼트 5세트 5회\n2. 바벨 로우 4x8 (휴식 90초)\n3. 덤벨 풀오버 3세트' });
  assert.equal(it.length, 3);
  assert.equal(it[1].restSec, 90);
  assert.equal(it[2].sets, 3);
  assert.equal(it[2].repsStated, false); // 횟수 미기재 → 기본 10 + 표시
  assert.equal(it[2].repsMin, 10);
});

test('스크립트(영어 말) — 줄 넘는 숫자 · 휴식 120초 · 근거 없는 한 번 언급은 「언급만」', () => {
  const d = buildImportDraft(idx, {
    script:
      "0:40\nwe're starting with incline dumbbell press\n0:44\nfour sets\n0:47\nof eight to ten reps\n2:10\nrest two minutes between sets\n3:30\nnext up flat bench press\n6:00\nthree sets of six",
  });
  const it = d.days.flatMap((x) => x.items);
  assert.equal(name(it[0].exerciseId), '덤벨 인클라인 프레스');
  assert.deepEqual([it[0].sets, it[0].repsMin, it[0].repsMax, it[0].restSec, it[0].atSec], [4, 8, 10, 120, 40]);
  assert.equal(it.length, 1);
  assert.equal(name(d.mentionedOnly[0]?.exerciseId), '바벨 벤치프레스'); // 3:30 → 6:00 은 20초 밖
});

test('스크립트 — 숫자가 이름보다 먼저 · 줄을 넘는 이름', () => {
  const it = items({ script: '1:00\n이번엔 네 세트 할 건데요\n1:05\n레그 프레스\n2:00\n다음은 레그\n2:02\n익스텐션 세 세트' });
  assert.deepEqual(it.map((i) => [name(i.exerciseId), i.sets]), [
    ['레그 프레스', 4],
    ['레그 익스텐션', 3],
  ]);
});

test('스크립트(한국어 말) — 수 낱말 · 드롭세트 메모 · 정리 구간 버림', () => {
  const d = buildImportDraft(idx, {
    script:
      '0:30\n첫 번째는 바벨 스쿼트\n0:35\n다섯 세트 다섯 개씩\n7:00\n마지막 레그 익스텐션 세 세트 열다섯 개 드롭세트로\n9:50\n오늘 바벨 스쿼트 레그 익스텐션 했습니다\n10:00\n구독',
  });
  assert.deepEqual(d.days.flatMap((x) => x.items).map((i) => [name(i.exerciseId), i.sets, i.repsMin, i.noteKo]), [
    ['바벨 스쿼트', 5, 5, null],
    ['레그 익스텐션', 3, 15, '드롭세트'],
  ]);
  assert.equal(d.mentionedOnly.length, 0);
});

test('날 나누기 — Day 머리 · 1일차 · 요일 · 부위 데이 · 말 속 push 는 아님', () => {
  const d = buildImportDraft(idx, { text: 'Day 1\nBarbell Bench Press 5x5\nDay 2\nBarbell Squat 5x5\n' }).days;
  assert.deepEqual(
    d.map((x) => [x.nameKo, x.items.length]),
    [
      ['Day 1', 1],
      ['Day 2', 1],
    ],
  );
  assert.equal(dayHeaderOf('1일차'), '1일차');
  assert.equal(dayHeaderOf('월요일'), '월요일');
  assert.equal(dayHeaderOf('가슴·삼두 데이'), '가슴·삼두 데이');
  assert.equal(dayHeaderOf('Push Day'), 'Push Day');
  assert.equal(dayHeaderOf('push through the last rep'), null);
  assert.equal(dayHeaderOf('Day 1 of my bulk'), null);
  assert.equal(dayHeaderOf('Day 1 – Push'), 'Day 1 – Push');
  assert.equal(dayHeaderOf('Push Day', true), null); // 스크립트는 Day N 만
  assert.equal(dayHeaderOf('오늘은 정말 힘든 하루였다 그래도 열심히'), null);
});

test('Week 2 부터는 버린다', () => {
  const d = buildImportDraft(idx, { text: 'Week 1\nBarbell Squat 5x5\nWeek 2\nBarbell Squat 5x3' });
  assert.equal(d.days.flatMap((x) => x.items).length, 1);
  assert.equal(d.weeksDropped, true);
});

test('라운드 — 같은 날 빈 세트를 채운다', () => {
  const it = items({ text: '3 rounds\nBarbell Squat 10 reps\nPush-up 15 reps' });
  assert.deepEqual(it.map((i) => i.sets), [3, 3]);
});

test('같은 날 같은 종목 두 번 → 한 줄 + 「이어서」', () => {
  const it = items({ text: 'Barbell Bench Press 3x5\nBarbell Bench Press 2x10' });
  assert.equal(it.length, 1);
  assert.equal(it[0].noteKo, '이어서 2세트(10회)');
});

test('못 찾음 — 세트×횟수는 있는데 종목이 없는 줄은 검색어와 함께', () => {
  const d = buildImportDraft(idx, { text: 'Zottman Wobble Thing 3x12' });
  const it = d.days.flatMap((x) => x.items);
  assert.equal(it[0].status, 'none');
  assert.equal(it[0].query, 'Zottman Wobble Thing');
  assert.equal(countUnresolved(d), 1);
});

test('못 찾음 — 아는 종목 바로 뒤의 모르는 종목 줄이 앞 종목에 흡수되지 않는다(리뷰 T1)', () => {
  const it = buildImportDraft(idx, { text: 'Barbell Squat 5x5\nZottman Wobble Thing 3x12' }).days.flatMap((x) => x.items);
  assert.equal(it.length, 2);
  assert.equal(it[0].exerciseId, 'seed-barbell-squat');
  assert.equal(it[0].sets, 5);
  assert.equal(it[1].status, 'none');
  assert.equal(it[1].query, 'Zottman Wobble Thing');
  // 이름 없는 처방 줄은 그대로 앞 종목에
  const b = buildImportDraft(idx, { text: 'Barbell Squat\n3 sets x 10 reps\nrest 90s' }).days.flatMap((x) => x.items);
  assert.equal(b.length, 1);
  assert.deepEqual([b[0].sets, b[0].repsMin, b[0].restSec], [3, 10, 90]);
});

test('근거 합치기 — 처방 줄 2개 이상인 설명란이 뼈대 · 스크립트는 시각·빈칸 · 뼈대 밖 종목은 「언급만」', () => {
  const d = buildImportDraft(idx, {
    script: '0:10\nlet us start with barbell squat\n0:14\nfive sets\n3:00\nnow leg extension\n3:04\nthree sets',
    description: 'Barbell Squat 4x8\nLeg Press 3x12',
  });
  const it = d.days.flatMap((x) => x.items);
  assert.deepEqual(it.map((i) => name(i.exerciseId)), ['바벨 스쿼트', '레그 프레스']);
  assert.deepEqual([it[0].sets, it[0].repsMin, it[0].atSec], [4, 8, 10]); // 형식 패턴(설명란)이 말 숫자를 이긴다 · 시각은 스크립트
  assert.equal(name(d.mentionedOnly[0]?.exerciseId), '레그 익스텐션');
});

test('붙여 넣은 글이 스크립트 형식이면 스크립트로 읽는다', () => {
  const d = buildImportDraft(idx, { text: '0:10\n바벨 스쿼트\n0:12\n다섯 세트\n0:20\n다섯 개\n0:30\n좋아요' });
  assert.equal(d.lines.script, 4);
  assert.equal(d.days[0]?.items[0]?.sets, 5);
});

// 메모 낱말 목록 — parse·draft 가 만드는 것뿐(원문 조각이 끼면 여기 안 맞는다)
const NOTE_WORD =
  /^(실패 지점까지|드롭세트|슈퍼세트|한쪽씩|워밍업 세트 따로|워밍업 \d세트 따로|\d+초 유지|\d+분 유지|\d+~\d+세트|피라미드 [\d·]+|템포 [\dx]-[\dx]-[\dx]-[\dx]|RPE \d+(\.5)?|RIR \d|이어서 \d+세트(\(\d+(~\d+)?회\))?)$/i;

test('메모는 해석값으로만 — 정해진 낱말 목록 밖의 글이 없다(속성)', () => {
  const inputs = [
    '덤벨 인클라인 프레스 4x8 마지막 세트는 실패 지점까지 쭉 밀어 주세요 RPE 9',
    'Barbell Squat 3 sets to failure with a pause at the bottom, tempo 3010',
    '1. 바벨 로우 12-10-8 등 근육을 쥐어짜는 느낌으로 · 드롭세트 한 번',
    'Barbell Bench Press 3x5\nBarbell Bench Press 2x10 each side superset',
  ];
  let seen = 0;
  for (const raw of inputs) {
    for (const it of buildImportDraft(idx, { text: raw }).days.flatMap((x) => x.items)) {
      for (const part of (it.noteKo ?? '').split(' · ').filter(Boolean)) {
        assert.match(part, NOTE_WORD, part);
        seen += 1;
      }
    }
  }
  assert.ok(seen >= 5);
});

test('확인 필요 수·빈 입력', () => {
  assert.ok(countReview(buildImportDraft(idx, { text: '벤치프레스 4x10' })) >= 1);
  assert.deepEqual(buildImportDraft(idx, {}).days, []);
  assert.deepEqual(buildImportDraft(idx, { text: '   ' }).days, []);
});

// ── 코드 리뷰(Phase 1) 회귀 ─────────────────────────────────────────────
const rowsOf = (input: Parameters<typeof buildImportDraft>[1]) =>
  buildImportDraft(idx, input).days.flatMap((x) => x.items);

test('리뷰 C3 — 짧은 한글 말이 긴 말을 가리지 않고, 낱말 중간·띄어쓰기를 건너 잇지 않는다', () => {
  assert.equal(rowsOf({ text: '딥 스쿼트 4x8' })[0].exerciseId, 'seed-barbell-squat');
  const r = rowsOf({ text: '레프트 사이드 먼저 3x10' });
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'none');
});

test('리뷰 C7 — 「벤치에서」는 위치 표현 · 이웃 언급의 기구 단서를 빌리지 않는다', () => {
  const r = rowsOf({ text: '벤치에서 덤벨 컬 3x10' });
  assert.equal(r.length, 1);
  assert.equal(r[0].exerciseId, 'seed-dumbbell-curl');
});

test('리뷰 C10 — 어간은 두 번 적용해도 같다(good mornings)', () => {
  assert.equal(stemWord(stemWord('mornings')), stemWord('morning'));
  assert.ok(rowsOf({ text: 'good mornings 3x10' })[0].exerciseId);
});

test('리뷰 C4 — 언급 앞 처방(「4x8 Bench Press」「1. 4세트 벤치프레스」)', () => {
  const r = rowsOf({ text: '4x8 Bench Press\n3x10 Squat\n3x12 Lat Pulldown' });
  assert.deepEqual(r.map((x) => [x.sets, x.repsMin]), [[4, 8], [3, 10], [3, 12]]);
  assert.equal(rowsOf({ text: '1. 4세트 벤치프레스' })[0].sets, 4);
});

test('리뷰 C6 — 대문자 SS(슈퍼세트) · 스크립트의 대문자 약어', () => {
  assert.equal(rowsOf({ text: '바벨컬 SS 해머컬 3x12' })[0].noteKo, '슈퍼세트');
  const s = rowsOf({ script: '0:05\nRDL 좋아요\n0:15\nRDL 다시\n0:25\nRDL 또' });
  assert.equal(s.length, 1);
});

test('리뷰 C2·C9 — 끝 10% 재언급의 처방은 앞 줄로 · 이어지지 않은 60초 안 반복도 근거', () => {
  const r = rowsOf({
    script: '0:00\n오늘은 스쿼트 레그 프레스 레그 컬\n1:00\n스쿼트 5세트 5회\n3:00\n레그 프레스 4세트 10회\n9:30\n마지막 레그 컬 3세트 15회\n10:00\n끝',
  });
  const curl = r.find((x) => x.exerciseId?.includes('leg-curl'));
  assert.ok(curl);
  assert.deepEqual([curl.sets, curl.repsMin], [3, 15]);
  const d = buildImportDraft(idx, { script: '0:10\n스쿼트\n0:20\n벤치프레스\n0:30\n스쿼트' });
  assert.equal(d.days.flatMap((x) => x.items)[0].exerciseId, 'seed-barbell-squat');
  assert.ok(d.mentionedOnly.some((x) => x.exerciseId === 'seed-barbell-bench-press'));
});

test('리뷰 C5·C8·C11 — 가장 가까운 휴식 · 「한 세트에」·「두 번」 · 템포·날짜 오인 없음', () => {
  const a = readPrescription('플랭크 3세트 30초 버티고 60초 휴식');
  assert.equal(a.restSec, 60);
  assert.equal(readPrescription('한 세트에 10개씩 3세트').sets, 3);
  for (const t of ['일주일에 두 번', '한 번 더', '3번 종목', 'interest 30 sec', 'rest-pause 15초']) {
    const p = readPrescription(t);
    assert.equal(p.repsMin, undefined, t);
    assert.equal(p.restSec, undefined, t);
  }
  assert.deepEqual([readPrescription('5-5-5-5-5').sets, readPrescription('5-5-5-5-5').repsMin], [5, 5]);
  assert.deepEqual(readPrescription('5-5-5-5-5').notes, []);
  assert.equal(readPrescription('11/10/25 업데이트').sets, undefined);
  assert.equal(readPrescription('세 분 모두 휴식 5분').restSec, 300);
});
