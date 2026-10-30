// 오픈짐 대조 갭 보강 무결성 (SRS-094) — 새 106종목이 들어 있고, 기존 480행은 별칭 추가 말고는 한 글자도 바뀌지 않았다. @plm SRS-094
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CATALOG, CATALOG_FAMILIES } from '../../data/catalog/catalog.generated';
import { MIGRATION_OVERRIDES } from '../../data/catalog/catalogMigration.data';
import { FAMILY_ARCH } from '../../data/pictograms/render';
import { buildCatalogIndex } from '../catalogMigrationPlan';
import { buildExerciseSearchIndex, searchExercises } from '../exerciseSearch';
import { FINDER_TREE } from '../exerciseFinder';
import { normalizeNameKey } from '../nameKey';

// 대조 근거: .ouroboros/docs/spec/20261030_catalog-gap/(candidates.json · judgments/ · qa spec 반영)
const ADDED = [
  'seed-barbell-spider-curl', // 바벨 스파이더 컬
  'seed-cable-incline-curl', // 케이블 인클라인 컬
  'seed-cable-concentration-curl', // 케이블 컨센트레이션 컬
  'seed-dumbbell-drag-curl', // 덤벨 드래그 컬
  'seed-barbell-pin-press', // 바벨 핀 프레스
  'seed-barbell-incline-skull-crusher', // 바벨 인클라인 스컬크러셔
  'seed-ez-bar-incline-skull-crusher', // EZ바 인클라인 스컬크러셔
  'seed-dumbbell-incline-triceps-extension', // 덤벨 인클라인 트라이셉스 익스텐션
  'seed-smith-jm-press', // 스미스 JM 프레스
  'seed-bodyweight-triceps-extension', // 맨몸 트라이셉스 익스텐션
  'seed-dumbbell-curl-and-press', // 덤벨 컬 앤 프레스
  'seed-archer-pull-up', // 아처 풀업
  'seed-back-lever', // 백 레버
  'seed-band-bent-over-row', // 밴드 벤트오버 로우
  'seed-barbell-incline-bench-row', // 바벨 인클라인 로우
  'seed-cable-behind-the-neck-pulldown', // 케이블 비하인드 넥 랫풀다운
  'seed-cable-bent-over-row', // 케이블 벤트오버 로우
  'seed-cable-standing-row', // 케이블 스탠딩 로우
  'seed-dumbbell-rear-delt-row', // 덤벨 리어 델트 로우
  'seed-dumbbell-incline-shrug', // 덤벨 인클라인 슈러그
  'seed-ez-bar-pullover', // EZ바 풀오버
  'seed-one-arm-pull-up', // 원암 풀업
  'seed-straight-bar-dip', // 스트레이트 바 딥스
  'seed-dumbbell-incline-squeeze-press', // 덤벨 인클라인 스퀴즈 프레스
  'seed-dumbbell-floor-fly', // 덤벨 플로어 플라이
  'seed-pseudo-planche-push-up', // 슈도 플란체 푸시업
  'seed-scapular-push-up', // 스캐퓰러 푸시업
  'seed-landmine-squeeze-press', // 랜드마인 스퀴즈 프레스
  'seed-machine-incline-fly', // 머신 인클라인 플라이
  'seed-dumbbell-single-leg-deadlift', // 덤벨 싱글 레그 데드리프트
  'seed-single-leg-deadlift', // 싱글 레그 데드리프트
  'seed-kettlebell-single-leg-deadlift', // 케틀벨 싱글 레그 데드리프트
  'seed-dumbbell-b-stance-romanian-deadlift', // 덤벨 B스탠스 루마니안 데드리프트
  'seed-barbell-b-stance-romanian-deadlift', // 바벨 B스탠스 루마니안 데드리프트
  'seed-barbell-sumo-romanian-deadlift', // 바벨 스모 루마니안 데드리프트
  'seed-dumbbell-sumo-deadlift', // 덤벨 스모 데드리프트
  'seed-bodyweight-hip-thrust', // 맨몸 힙 쓰러스트
  'seed-hamstring-bridge', // 햄스트링 브릿지
  'seed-dumbbell-curtsy-lunge', // 덤벨 커시 런지
  'seed-barbell-jump-squat', // 바벨 점프 스쿼트
  'seed-cable-goblet-squat', // 케이블 고블릿 스쿼트
  'seed-skater-squat', // 스케이터 스쿼트
  'seed-kettlebell-reverse-lunge', // 케틀벨 리버스 런지
  'seed-kettlebell-step-up', // 케틀벨 스텝업
  'seed-bodyweight-step-up', // 맨몸 스텝업
  'seed-lateral-step-up', // 레터럴 스텝업
  'seed-smith-step-up', // 스미스 스텝업
  'seed-kneeling-hip-thrust', // 닐링 힙 쓰러스트
  'seed-band-kneeling-hip-thrust', // 밴드 닐링 힙 쓰러스트
  'seed-smith-kneeling-hip-thrust', // 스미스 닐링 힙 쓰러스트
  'seed-landmine-romanian-deadlift', // 랜드마인 루마니안 데드리프트
  'seed-landmine-single-leg-romanian-deadlift', // 랜드마인 싱글 레그 루마니안 데드리프트
  'seed-landmine-reverse-lunge', // 랜드마인 리버스 런지
  'seed-bodyweight-lunge', // 맨몸 런지
  'seed-bodyweight-split-squat', // 맨몸 스플릿 스쿼트
  'seed-reverse-hack-squat', // 리버스 핵 스쿼트
  'seed-smith-hack-squat', // 스미스 핵 스쿼트
  'seed-kneeling-leg-curl', // 닐링 레그 컬
  'seed-sliding-leg-curl', // 슬라이딩 레그 컬
  'seed-bench-reverse-hyperextension', // 벤치 리버스 하이퍼익스텐션
  'seed-shrimp-squat', // 쉬림프 스쿼트
  'seed-band-glute-bridge', // 밴드 글루트 브릿지
  'seed-smith-curtsy-lunge', // 스미스 커시 런지
  'seed-snatch-pull', // 바벨 스내치 풀
  'seed-tibialis-raise', // 티비알리스 레이즈
  'seed-snatch-balance', // 바벨 스내치 밸런스
  'seed-hack-calf-raise', // 핵 카프 레이즈
  'seed-smith-seated-calf-raise', // 스미스 시티드 카프 레이즈
  'seed-pogo-jump', // 포고 점프
  'seed-crab-walk', // 크랩 워크
  'seed-butt-kick', // 버트 킥
  'seed-plank-jack', // 플랭크 잭
  'seed-burpee-box-jump', // 버피 박스 점프
  'seed-dumbbell-clean-and-press', // 덤벨 클린 앤 프레스
  'seed-kettlebell-clean-and-press', // 케틀벨 클린 앤 프레스
  'seed-dumbbell-incline-rear-delt-fly', // 덤벨 인클라인 리어 델트 플라이
  'seed-dumbbell-side-lying-lateral-raise', // 덤벨 사이드 라잉 레터럴 레이즈
  'seed-dumbbell-side-lying-rear-delt-raise', // 덤벨 사이드 라잉 리어 델트 레이즈
  'seed-dumbbell-cuban-press', // 덤벨 쿠반 프레스
  'seed-dumbbell-z-press', // 덤벨 Z 프레스
  'seed-barbell-z-press', // 바벨 Z 프레스
  'seed-smith-behind-the-neck-press', // 스미스 비하인드 넥 프레스
  'seed-landmine-lateral-raise', // 랜드마인 레터럴 레이즈
  'seed-handstand-walk', // 핸드스탠드 워크
  'seed-wall-walk', // 월 워크
  'seed-neck-harness-extension', // 넥 하네스 익스텐션
  'seed-machine-neck-extension', // 머신 넥 익스텐션
  'seed-lying-neck-side-raise', // 라잉 넥 사이드 레이즈
  'seed-seated-knee-tuck', // 시티드 니업
  'seed-double-crunch', // 더블 크런치
  'seed-decline-bench-leg-raise', // 디클라인 레그 레이즈
  'seed-hanging-knees-to-elbows', // 행잉 니 투 엘보
  'seed-v-sit-hold', // V 싯 홀드
  'seed-inchworm', // 인치웜
  'seed-plank-hip-dip', // 플랭크 힙 딥
  'seed-side-plank-rotation', // 사이드 플랭크 로테이션
  'seed-bear-plank', // 베어 플랭크
  'seed-plank-pull-through', // 플랭크 풀 스루
  'seed-standing-knee-to-elbow', // 스탠딩 니 투 엘보
  'seed-45-degree-side-bend', // 45도 사이드 벤드
  'seed-dumbbell-windmill', // 덤벨 윈드밀
  'seed-dumbbell-woodchop', // 덤벨 우드촙
  'seed-cable-side-crunch', // 케이블 사이드 크런치
  'seed-ghd-sit-up', // GHD 싯업
  'seed-ab-coaster', // 앱 코스터
  'seed-stomach-vacuum', // 복부 배큠
];

// 같은 동작이라 새 종목 대신 기존 종목에 단 별칭(qa spec H-2·L-9·M-7) — 기존 행에 허용되는 유일한 변경
const ALIASES_ADDED: Record<string, string[]> = {
  'seed-incline-press': ["인클라인 클로즈그립 벤치프레스", "incline close grip bench press"],
  'seed-barbell-shrug': ["비하인드 백 슈러그", "바벨 비하인드 백 슈러그", "백 슈러그", "behind the back shrug"],
  'seed-shrug-smith': ["스미스 비하인드 백 슈러그", "스미스 백 슈러그", "smith behind the back shrug"],
  'seed-pull-up': ["L-싯 풀업", "엘싯 풀업", "l-sit pull-up"],
  'seed-deadlift-high-pull': ["스모 데드리프트 하이 풀", "바벨 스모 데드리프트 하이 풀", "스모 하이 풀", "SDHP", "sumo deadlift high pull"],
  'seed-hanging-knee-raise': ["행잉 오블리크 니 레이즈", "행잉 트위스트 니 레이즈", "hanging oblique knee raise"],
  'seed-chest-supported-row-dumbbell': ["인클라인 로우"],
};

// 갭 보강 직전(v0.55.0) 카탈로그 480행의 지문(별칭 포함) — 위 별칭을 빼면 이것과 같아야 한다.
const BEFORE_ROWS = 480;
const BEFORE_SHA1 = '71dec135f71d6b1edce476d00be3d98bb99d4f96';

// 같은 동작인데 기록 칸(그립)이 다른 이름 — 통합(보관) 행이 「이 별칭 = 대상 + 그립 close」를 함축한다(qa code M-1 · 클로즈그립 풀다운 선례)
const MERGED = 'seed-barbell-incline-close-grip-bench-press';

const byId = new Map(CATALOG.map((r) => [r.id, r]));

test('새 106종목이 활성 근력 종목으로 있다(사진 없이 픽토그램 · status=new)', () => {
  assert.equal(ADDED.length, 106);
  assert.equal(new Set(ADDED).size, ADDED.length);
  for (const id of ADDED) {
    const r = byId.get(id);
    assert.ok(r, `없음: ${id}`);
    assert.equal(r.status, 'new', id);
    assert.equal(r.isArchived, false, id);
    assert.equal(r.kind, null, `${id}: 근력이어야 한다`);
    assert.equal(r.media, 'gen', id);
  }
});

test('기존 480행은 별칭 추가 말고 바뀌지 않았다 — 새 행은 끝에만 붙는다', () => {
  const before = CATALOG.slice(0, BEFORE_ROWS).map((r) => {
    const add = new Set(ALIASES_ADDED[r.id] ?? []);
    if (!add.size) return r;
    const ko = r.aliasesKo.filter((a) => !add.has(a));
    const en = r.aliasesEn.filter((a) => !add.has(a));
    assert.equal(r.aliasesKo.length + r.aliasesEn.length - ko.length - en.length, add.size, `${r.id}: 더한 별칭이 다 있어야 한다`);
    return { ...r, aliasesKo: ko, aliasesEn: en };
  });
  const sha = createHash('sha1').update(JSON.stringify(before)).digest('hex');
  assert.equal(sha, BEFORE_SHA1);
  assert.deepEqual(CATALOG.slice(BEFORE_ROWS).map((r) => r.id), [...ADDED, MERGED]);
});

test('「인클라인 클로즈그립 벤치프레스」 = 바벨 인클라인 프레스 + 그립 close(보관 행 · 함축 축)', () => {
  const m = byId.get(MERGED)!;
  assert.equal(m.isArchived, true);
  assert.equal(m.mergeInto, 'seed-incline-press');
  assert.deepEqual(m.impliedAxes, { grip: 'close' });
  assert.ok(byId.get('seed-incline-press')!.aliasesKo.includes(m.nameKo), '옛 이름이 대상 별칭이어야 함축이 걸린다');
});

test('이름·별칭은 활성 종목끼리 겹치지 않는다(공백·대소문자 무시)', () => {
  const owner = new Map<string, string>();
  for (const r of CATALOG.filter((x) => !x.isArchived))
    for (const k of [r.nameKo, r.nameEn, ...r.aliasesKo, ...r.aliasesEn].map(normalizeNameKey)) {
      const prev = owner.get(k);
      assert.ok(!prev || prev === r.id, `「${k}」: ${prev} ↔ ${r.id}`);
      owner.set(k, r.id);
    }
});

test('기구 바꾸기·기록 이관의 형제 맵: family × 기구 = 종목 하나(qa spec H-1 — 마지막 행이 앞 종목을 밀어내지 않게)', () => {
  const idx = buildCatalogIndex(CATALOG, CATALOG_FAMILIES, MIGRATION_OVERRIDES);
  const seen = new Map<string, string>();
  for (const r of CATALOG) {
    if (r.isArchived || r.kind === 'cardio') continue;
    const k = `${r.family}|${r.equipment}`;
    assert.ok(!seen.has(k), `${k}: ${seen.get(k)} ↔ ${r.id}`);
    seen.set(k, r.id);
    assert.equal(idx.sibling.get(r.family)?.get(r.equipment), r.id, k);
  }
});

test('새 종목의 family 는 원형을 갖고, 머신 적재 축이 있으면 기본 적재 방식도 있다', () => {
  const fam = new Map(CATALOG_FAMILIES.map((f) => [f.family, f]));
  for (const id of ADDED) {
    const r = byId.get(id)!;
    assert.ok(FAMILY_ARCH[r.family], `${id}: 원형 없는 family ${r.family}`);
    const f = fam.get(r.family);
    assert.ok(f?.equipments.includes(r.equipment), `${id}: ${r.family} 허용 기구에 ${r.equipment} 없음`);
    if (f?.load) assert.ok(f.loadDefault, `${r.family}: load_default 없음`);
  }
  // 반대 동작을 그리던 원형은 전용 원형으로(qa spec M-5)
  assert.equal(FAMILY_ARCH.tibialis_raise, 'tibialis_raise');
  assert.equal(FAMILY_ARCH.back_lever, 'back_lever');
  assert.equal(FAMILY_ARCH.vacuum, 'vacuum');
});

test('스무고개 트리가 있는 부위의 새 근력 종목은 세부 질문에 들어 있다', () => {
  for (const id of ADDED) {
    const r = byId.get(id)!;
    const subs = FINDER_TREE[r.primaryMuscles[0] as keyof typeof FINDER_TREE];
    if (!subs) continue;
    assert.ok(subs.some((s) => s.ids.includes(id)), `${id}: ${r.primaryMuscles[0]} 세부 질문에 없음`);
  }
});

test('검색 첫 결과 — 새 종목은 찾히고, 기존 흔한 질의의 첫 자리는 빼앗기지 않는다(qa spec M-7)', () => {
  const list = CATALOG.filter((r) => !r.isArchived).map((r) => ({
    id: r.id, nameKo: r.nameKo, nameEn: r.nameEn, aliases: [...r.aliasesKo, ...r.aliasesEn],
    family: r.family, equipment: r.equipment, similar: r.similar, isArchived: r.isArchived,
  }));
  const index = buildExerciseSearchIndex(list);
  const name = new Map(list.map((e) => [e.id, e.nameKo]));
  const first = (q: string) => name.get(searchExercises(index, q).hits[0]?.id ?? '');
  const table: [string, string][] = [
    ['싱글 레그 데드', '싱글 레그 데드리프트'],
    ['티비', '티비알리스 레이즈'],
    ['배큠', '복부 배큠'],
    ['핀 프레스', '바벨 핀 프레스'],
    ['SDHP', '바벨 데드리프트 하이 풀'],
    ['비하인드 백 슈러그', '바벨 슈러그'],
    ['인클라인 로우', '덤벨 체스트 서포티드 로우'],
    ['triceps press', '덤벨 오버헤드 트라이셉스 익스텐션'],
    ['스텝업', '덤벨 스텝업'],
    ['런지', '덤벨 런지'],
    ['플랭크', '플랭크'],
    ['풀업', '풀업'],
    ['슈러그', '바벨 슈러그'],
    ['bench press', '바벨 벤치프레스'],
  ];
  const bad = table.filter(([q, want]) => first(q) !== want).map(([q, want]) => `「${q}」 → ${first(q)} (기대 ${want})`);
  assert.deepEqual(bad, []);
});
