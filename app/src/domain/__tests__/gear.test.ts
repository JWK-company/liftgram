// 착용장비 도메인 순수 테스트 (SRS-037) — npm test. RN 불필요.
// spec: .ouroboros/docs/spec/20260720_gear-domain_spec.md (rev3) — T1~T20 전 그룹 필수.
// 모든 test 이름은 'T{n} ' 접두로 시작한다 — 러너에 그룹 개념이 없어 커버리지를 기계 확인할 유일한 수단이다.
//   npm test 2>&1 | grep -oE 'T[0-9]+ ' | sort -uV | wc -l
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GEAR_CATEGORIES,
  MAX_GEAR_TAGS,
  MAX_GEAR_NOTE_LEN,
  MAX_GEAR_BRAND_LEN,
  MAX_GEAR_INPUT_SCAN,
  AFFILIATE_DISCLOSURE_KO,
  isGearCategory,
  gearLabelKey,
  normalizeGearTags,
  requiresAffiliateDisclosure,
  resolveGearLink,
  type GearCategory,
  type GearAffiliateConfig,
} from '../gear';
import * as domain from '../index';
import { ko } from '../../i18n/locales/ko';
import { en } from '../../i18n/locales/en';

const DEEP = 'https://link.coupang.com/a/abc';
const BAD = 'https://evil.com/x';

// cfg 는 불투명 JSON 취급이라 테스트는 의도적으로 타입을 우회해 이상 입력을 넣는다.
const cfg = (v: unknown): GearAffiliateConfig | null | undefined => v as GearAffiliateConfig;
const shown = { disclosureRendered: true };
const hidden = { disclosureRendered: false };

// 검증 대상 함수는 URL 파싱을 쓰지 않지만, 테스트 내부의 new URL 은 Node 전용 검증 도구라 무방하다.
function searchUrlOf(c: GearCategory): string {
  const r = resolveGearLink(c, undefined, hidden);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.kind, 'search');
  return r.ok ? r.url : '';
}

// ── T1 카테고리 상수 ──────────────────────────────────────────────
test('T1 카테고리 상수: 8종·순서·동결·상한값', () => {
  assert.deepEqual([...GEAR_CATEGORIES], [
    'wristWrap', 'strap', 'belt', 'kneeSleeve', 'gloves', 'shoes', 'chalk', 'armSleeve',
  ]);
  assert.equal(GEAR_CATEGORIES.length, 8);
  assert.equal(new Set(GEAR_CATEGORIES).size, 8, '중복 카테고리 없음');
  assert.equal(Object.isFrozen(GEAR_CATEGORIES), true);
  assert.equal(MAX_GEAR_TAGS, GEAR_CATEGORIES.length);
  assert.equal(MAX_GEAR_NOTE_LEN, 30);
  assert.equal(MAX_GEAR_INPUT_SCAN, 200);
  // 법정 고지 문구 전문 스냅샷 — 카피가 아니라 규제 상수다(spec §고지 문구 소유권).
  // 기각 목록 8의 '라벨 스냅샷 기각'은 카피 다듬기 대상인 카테고리 라벨 16문자열에만 적용되며 이 문장은 예외다.
  // 부분문자열 검사로 되돌리지 말 것 — '쿠팡 파트너스'만 남기면 공정위 심사지침이 요구하는
  // 경제적 대가 명시부('수수료를 제공받습니다')가 통째로 사라져도 초록이 된다. 변경은 법무 확인 후에만.
  assert.equal(
    AFFILIATE_DISCLOSURE_KO,
    '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
    '법정 고지 문구 전문',
  );
});

// ── T2 isGearCategory ────────────────────────────────────────────
test('T2 isGearCategory: 양성 8종 / 음성 전량 거부', () => {
  for (const c of GEAR_CATEGORIES) assert.equal(isGearCategory(c), true, c);
  const negatives: unknown[] = [
    'Belt', 'belt ', '', '__proto__', 'constructor', 'toString', 'valueOf',
    null, undefined, 3, {}, [], true, Symbol.iterator,
  ];
  for (const v of negatives) assert.equal(isGearCategory(v), false, String(v));
});

// ── T3 gearLabelKey ──────────────────────────────────────────────
test('T3 gearLabelKey: 8종 전수 gear.cat.{c}', () => {
  for (const c of GEAR_CATEGORIES) assert.equal(gearLabelKey(c), `gear.cat.${c}`);
});

// ── T4 i18n 파리티·값 ────────────────────────────────────────────
test('T4 i18n: ko/en 8키 파리티 · 비어있지 않음 · 언어 오배치 방어', () => {
  for (const c of GEAR_CATEGORIES) {
    const k = gearLabelKey(c);
    assert.ok(k in ko, `ko 누락: ${k}`);
    assert.ok(k in en, `en 누락: ${k}`);
    const kv = ko[k];
    const ev = (en as Record<string, string>)[k];
    assert.equal(typeof kv, 'string');
    assert.ok(kv.trim().length > 0, `ko 빈 라벨: ${k}`);
    assert.equal(typeof ev, 'string');
    assert.ok(ev.trim().length > 0, `en 빈 라벨: ${k}`);
    // ko/en 스왑·미번역 검출
    assert.equal(/[가-힣]/.test(kv), true, `ko 라벨에 한글 없음: ${k}`);
    assert.equal(/[가-힣]/.test(ev), false, `en 라벨에 한글 혼입: ${k}`);
  }
  // 법정 고지 문구는 도메인 상수가 단독 소유한다(로케일 무관 한국어 고정 — spec §고지 문구 소유권).
  // 키 이름만 검사하면 'post.affiliateNotice' 같은 리포 관례식 이름으로 우회되고, ko만 검사하면
  // 정작 막으려던 위반(en 로케일 사용자에게 영문 고지 렌더 → 파트너스 '영문 기재' 위반 사례)을 놓친다.
  // 따라서 ko/en 양쪽의 **값**을 전수 검사한다.
  for (const [name, table] of [['ko', ko], ['en', en]] as const) {
    const entries = Object.entries(table as Record<string, string>);
    assert.equal(entries.some(([k]) => k.startsWith('gear.disclosure')), false, `${name}: 고지 키 금지`);
    for (const [k, v] of entries) {
      assert.notEqual(v, AFFILIATE_DISCLOSURE_KO, `${name}.${k}: 고지 문구 중복 소유`);
      assert.equal(
        /쿠팡\s*파트너스|coupang\s*partners|affiliate/i.test(v),
        false,
        `${name}.${k}: 대가성 고지 문구가 i18n에 유입`,
      );
    }
  }
});

// ── T5 비배열 입력 ───────────────────────────────────────────────
test('T5 비배열 입력: 전부 빈 배열 · 무예외', () => {
  const inputs: unknown[] = [null, undefined, '', 0, {}, 'belt', true, NaN, Symbol('x')];
  for (const v of inputs) assert.deepEqual(normalizeGearTags(v), []);
});

// ── T6 이형 원소 ─────────────────────────────────────────────────
test('T6 이형 원소: 유효 1건만 남고 무예외', () => {
  const r = normalizeGearTags([
    null, undefined, [], [['belt']], 'belt', 42, false, NaN, () => {},
    { category: 'belt', source: 'user' },
  ]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], { category: 'belt', source: 'user' });
});

// ── T7 화이트리스트 ──────────────────────────────────────────────
test('T7 화이트리스트: Belt·__proto__·toString·미지 문자열 폐기', () => {
  const r = normalizeGearTags([
    { category: 'Belt', source: 'user' },
    { category: '__proto__', source: 'user' },
    { category: 'toString', source: 'user' },
    { category: 'dumbbell', source: 'user' },
    { category: 42, source: 'user' },
    { category: 'chalk', source: 'user' },
  ]);
  assert.deepEqual(r, [{ category: 'chalk', source: 'user' }]);
});

// ── T8 출력 형태 ─────────────────────────────────────────────────
test('T8 출력 형태: 새 리터럴 · 화이트리스트 밖 키 폐기 · 프로토타입 정상', () => {
  // ADR-027 D5 개정(2026-07-20): brand·brandSource 는 이제 화이트리스트 '안'이다.
  // 개정 전 이 테스트는 brand 폐기를 정답으로 고정하고 있었다 — 실측(브랜드 오단정 0건)으로 근거가 반박돼 뒤집는다.
  const r = normalizeGearTags([
    { category: 'belt', source: 'user', extra: 1, brand: 'SBD', url: 'https://x' },
  ]);
  assert.equal(r.length, 1);
  assert.deepEqual(Object.keys(r[0]), ['category', 'source', 'brand', 'brandSource']);
  assert.equal(r[0].brand, 'SBD');
  assert.equal(r[0].brandSource, 'user', 'brandSource 부재 시 user로 수렴');
  assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
  // 화이트리스트 밖 키(extra·url)는 여전히 폐기된다
  assert.equal((r[0] as Record<string, unknown>).extra, undefined);
  assert.equal((r[0] as Record<string, unknown>).url, undefined);
  // JSON 데이터 키로 실린 __proto__ 가 결과에 흘러들지 않는다
  const polluted = JSON.parse('[{"category":"belt","source":"user","__proto__":{"bad":1}}]');
  const p = normalizeGearTags(polluted);
  assert.deepEqual(Object.keys(p[0]), ['category', 'source']);
  assert.equal((p[0] as Record<string, unknown>).bad, undefined);
  assert.equal(({} as Record<string, unknown>).bad, undefined, '전역 프로토타입 미오염');
});

// ── T9 source 수렴 ───────────────────────────────────────────────
test('T9 source: 무효값은 user로 수렴 · 유효한 auto는 보존', () => {
  const cases: unknown[] = [undefined, 'USER', 'Auto', null, 3, {}, ''];
  for (const s of cases) {
    const r = normalizeGearTags([{ category: 'belt', source: s }]);
    assert.equal(r[0].source, 'user', `source=${String(s)}`);
  }
  assert.equal(normalizeGearTags([{ category: 'belt', source: 'auto' }])[0].source, 'auto');
  assert.equal(normalizeGearTags([{ category: 'belt', source: 'user' }])[0].source, 'user');
});

// ── T10 중복 병합 ────────────────────────────────────────────────
test('T10 중복 병합: user가 auto를 이기고 순서와 무관 · note 승계 · 최초 등장 순서', () => {
  const expected = { category: 'belt', source: 'user', note: '메모' };
  // 순서 무관 불변식 — auto 먼저든 user 먼저든 결과가 같다
  assert.deepEqual(
    normalizeGearTags([
      { category: 'belt', source: 'auto' },
      { category: 'belt', source: 'user', note: '메모' },
    ]),
    [expected],
  );
  assert.deepEqual(
    normalizeGearTags([
      { category: 'belt', source: 'user', note: '메모' },
      { category: 'belt', source: 'auto' },
    ]),
    [expected],
  );
  // note 승계 — 이긴 쪽에 note 가 없고 진 쪽에 있으면 물려받는다
  assert.deepEqual(
    normalizeGearTags([
      { category: 'belt', source: 'user' },
      { category: 'belt', source: 'auto', note: '자동메모' },
    ]),
    [{ category: 'belt', source: 'user', note: '자동메모' }],
  );
  // 규칙4+6(a) 결합 — 무효 source 는 user 로 수렴한 뒤 비교되므로 auto 를 이긴다(D7 취지의 보수적 선택)
  assert.deepEqual(
    normalizeGearTags([
      { category: 'belt', source: 'auto' },
      { category: 'belt', source: null, note: '메모' },
    ]),
    [expected],
  );
  // 같은 source 끼리는 먼저 온 것이 남는다
  assert.deepEqual(
    normalizeGearTags([
      { category: 'belt', source: 'auto', note: '첫' },
      { category: 'belt', source: 'auto', note: '둘' },
    ]),
    [{ category: 'belt', source: 'auto', note: '첫' }],
  );
  // [belt×6, strap, shoes] → 3개 · 최초 등장 순서 보존
  const many = normalizeGearTags([
    ...Array.from({ length: 6 }, () => ({ category: 'belt', source: 'user' })),
    { category: 'strap', source: 'user' },
    { category: 'shoes', source: 'user' },
  ]);
  assert.deepEqual(many.map((t) => t.category), ['belt', 'strap', 'shoes']);
});

// ── T11 note 정제 ────────────────────────────────────────────────
test('T11 note 정제: 코드포인트 절단 · 제어문자 · 공백 접기 · 키 제거', () => {
  // 길이 상한(코드포인트 기준)
  const long = normalizeGearTags([{ category: 'belt', source: 'user', note: 'a'.repeat(40) }]);
  assert.equal(long[0].note?.length, MAX_GEAR_NOTE_LEN);
  // 이모지 절단에 고립 서로게이트가 남지 않는다 — 40개(=코드유닛 80)를 넣어 실제로 경계에서 잘리게 한다.
  // 코드유닛 slice(0,30)였다면 30번째 유닛이 서로게이트 페어 한가운데라 반쪽이 남는다.
  const emoji = normalizeGearTags([{ category: 'belt', source: 'user', note: '💪'.repeat(40) }]);
  const n = emoji[0].note as string;
  assert.equal([...n].length, MAX_GEAR_NOTE_LEN, '코드포인트 기준 절단');
  assert.equal(n.length, MAX_GEAR_NOTE_LEN * 2, '서로게이트 페어가 온전히 보존됨');
  assert.equal(/[\uD800-\uDFFF]/.test(n.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')), false, '고립 서로게이트 없음');
  assert.equal([...n].join(''), n);
  // 상한 미만이면 그대로 보존한다
  const short = normalizeGearTags([{ category: 'belt', source: 'user', note: '💪'.repeat(20) }]);
  assert.equal([...(short[0].note as string)].length, 20);
  // 비문자열·공백만 → 키 자체 부재
  for (const v of [42, null, {}, [], '   ', '\u0000\u0000', undefined]) {
    assert.deepEqual(
      normalizeGearTags([{ category: 'belt', source: 'user', note: v }]),
      [{ category: 'belt', source: 'user' }],
      `note=${String(v)}`,
    );
  }
  // 제어문자·라인구분자·NBSP
  const ctrl = (s: string) => normalizeGearTags([{ category: 'belt', source: 'user', note: s }])[0].note;
  assert.equal(ctrl('앞\u0000중\n간\t뒤'), '앞 중 간 뒤');
  assert.equal(ctrl('a\u2028b'), 'a b');
  assert.equal(ctrl('x\u00a0\u00a0y'), 'x y');
  assert.equal(ctrl('\uFEFF테스트\uFEFF'), '테스트');
  // 절단 경계에서 후행 공백이 남지 않는다(멱등 불변식의 전제)
  const boundary = ctrl(`${'가'.repeat(29)} 나머지`) as string;
  assert.equal(boundary, boundary.trim());
  // 입력에 원래 들어 있던 고립 서로게이트도 제거한다 — 직렬화 시 Postgres jsonb 거부(게시 500)·U+FFFD 파손의 원인.
  // (절단이 만드는 반쪽은 위 이모지 케이스가, 입력 유래는 아래가 고정한다)
  assert.equal(ctrl('a\uD83Db'), 'ab', '선행 서로게이트 단독 제거');
  assert.equal(ctrl('a\uDCAAb'), 'ab', '후행 서로게이트 단독 제거');
  assert.equal(ctrl('a \uD800 b'), 'a b', '제거 후 연속 공백이 남지 않는다(멱등 전제 — 제거는 공백 접기보다 먼저)');
  assert.equal(ctrl('\uD83D'), undefined, '전부 제거되면 note 키 자체 부재');
  assert.equal(ctrl('a💪b\uD83D'), 'a💪b', '정상 페어는 보존하고 짝 없는 것만 제거');
  const loneOut = ctrl('x\uD83D') as string;
  assert.equal(/[\uD800-\uDFFF]/.test(loneOut.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')), false, '출력에 고립 서로게이트 없음');
});

// ── T12 경계 보존·순서·멱등·불변 ─────────────────────────────────
test('T12 8종 전량 보존 · 최초 등장 순서 · 멱등 · 입력 불변', () => {
  const shuffled: GearCategory[] = [
    'chalk', 'belt', 'armSleeve', 'wristWrap', 'shoes', 'gloves', 'kneeSleeve', 'strap',
  ];
  const input = shuffled.map((c) => ({ category: c, source: 'user' as const }));
  const snapshot = JSON.parse(JSON.stringify(input));
  const r = normalizeGearTags(input);
  assert.equal(r.length, 8, '상한이 정상 데이터를 자르지 않는다');
  assert.deepEqual(r.map((t) => t.category), shuffled);
  assert.deepEqual(input, snapshot, '입력 배열·원소가 호출 전후 불변');

  const samples: unknown[] = [
    input,
    [{ category: 'belt', source: 'auto', note: '  여러  공백  ' }, { category: 'belt', source: 'user' }],
    [null, { category: 'strap', source: 'x' }, 'junk', { category: 'strap', source: 'auto' }],
    [{ category: 'chalk', source: 'user', note: '💪'.repeat(25) }],
    // 고립 서로게이트 유입 — 정제가 공백을 남기면 2회차에서 접혀 멱등성이 깨진다
    [{ category: 'gloves', source: 'user', note: 'a \uD800 b\uDCAA' }],
  ];
  for (const s of samples) {
    assert.deepEqual(normalizeGearTags(normalizeGearTags(s)), normalizeGearTags(s), '멱등');
  }
});

// ── T13 검색어 사전 (URL 경유로만 관측) ──────────────────────────
test('T13 검색어 사전: 8종 전수 · 비어있지 않음 · 중복 없음', () => {
  const queries = GEAR_CATEGORIES.map((c) => new URL(searchUrlOf(c)).searchParams.get('q'));
  assert.deepEqual(queries, [
    '손목보호대 리스트랩', '헬스 스트랩', '리프팅 벨트', '무릎보호대 니슬리브',
    '헬스 장갑', '리프팅화', '리프팅 초크', '헬스 암슬리브',
  ]);
  for (const q of queries) assert.ok(q && q.trim().length > 0);
  assert.equal(new Set(queries).size, 8, '검색어 중복 없음');
});

// ── T14 순수 검색 URL(제휴 비활성) ───────────────────────────────
test('T14 제휴 비활성: 쿼리 키가 q 하나뿐인 순수 검색 URL · 결정성', () => {
  const expected = [
    '손목보호대 리스트랩', '헬스 스트랩', '리프팅 벨트', '무릎보호대 니슬리브',
    '헬스 장갑', '리프팅화', '리프팅 초크', '헬스 암슬리브',
  ];
  GEAR_CATEGORIES.forEach((c, i) => {
    const url = searchUrlOf(c);
    const u = new URL(url);
    assert.equal(u.origin, 'https://www.coupang.com');
    assert.equal(u.pathname, '/np/search');
    // 키 집합 동일성 — 부분 검사 금지(추적 파라미터 0개 보증)
    assert.deepEqual([...u.searchParams.keys()], ['q'], c);
    assert.equal(u.searchParams.get('q'), expected[i]);
    // 한글이 raw 로 남지 않는다(전부 percent-encoded)
    assert.equal(/[가-힣]/.test(url), false, c);
    // 결정성 — 2회 호출 동일
    assert.equal(searchUrlOf(c), url);
  });
  // note 가 달라도 URL 은 동일하다(§note 정책 3 — note 는 검색어·링크 조립 어디에도 반영되지 않는다).
  // resolveGearLink 가 note 를 인자로 받지 않으므로 정규화 결과를 경유해 고정한다.
  // f(x) === f(x) 형태의 항등식으로 되돌리지 말 것 — 그러면 note 를 검색어에 섞는 개정을 검출하지 못한다.
  const a = normalizeGearTags([{ category: 'belt', source: 'user', note: '브랜드A 벨트' }]);
  const b = normalizeGearTags([{ category: 'belt', source: 'user', note: '전혀 다른 메모' }]);
  assert.notDeepEqual(a[0].note, b[0].note, 'note 는 실제로 서로 다르다(항등식 방지)');
  assert.equal(searchUrlOf(a[0].category), searchUrlOf(b[0].category));
  assert.equal(
    searchUrlOf('belt').includes(encodeURIComponent('브랜드A')),
    false,
    'note 가 q 에 유입되지 않는다(ADR-027 D5 · 운영정책 4.1 6)',
  );
});

// ── T15 고지 판정 (진리표 2열) ───────────────────────────────────
test('T15 requiresAffiliateDisclosure: 진리표 전건 · 딥링크 존재 시 enabled 무관 true', () => {
  const F: unknown[] = [
    undefined, null, {}, { enabled: false }, { enabled: 'yes' }, { enabled: 1 }, { enabled: 'true' },
    { enabled: false, links: { belt: BAD } },
    { enabled: false, links: {} },
    [], 'x', 0, true, NaN,
  ];
  for (const v of F) assert.equal(requiresAffiliateDisclosure(cfg(v)), false, JSON.stringify(v) ?? String(v));

  const T: unknown[] = [
    { enabled: true },
    { enabled: true, links: {} },
    { enabled: true, links: { belt: BAD } },
    { enabled: true, links: { belt: 123 } },
    { enabled: false, links: { belt: DEEP } }, // rev3 정정 — rev2 는 false 였다
    { enabled: true, links: { belt: DEEP } },
    // 교차 카테고리 — 불변식은 "어느 카테고리든 딥링크가 하나라도 있으면" 이다.
    // hasAnyAffiliateLink 를 '요청 카테고리만 보면 된다'로 단순화하는 리팩터링을 여기서 잡는다.
    { enabled: false, links: { shoes: DEEP } },
    { enabled: false, links: { shoes: DEEP, belt: BAD } },
  ];
  for (const v of T) assert.equal(requiresAffiliateDisclosure(cfg(v)), true, JSON.stringify(v));
});

// ── T16 고지 게이트 × 딥링크 (핵심) ──────────────────────────────
test('T16 고지 게이트: 라벨 없으면 차단 · 비활성이면 딥링크 무시 · 정리 A 기계 검증', () => {
  // ① 비활성 + 딥링크 + 라벨 없음 → 차단 (rev2 는 여기서 딥링크를 열었다)
  assert.deepEqual(
    resolveGearLink('belt', cfg({ enabled: false, links: { belt: DEEP } }), hidden),
    { ok: false, blocked: 'disclosure-missing' },
  );
  // ② 같은 cfg + 라벨 있음 → 열리되 딥링크가 아니라 검색 URL (정리 B)
  const r2 = resolveGearLink('belt', cfg({ enabled: false, links: { belt: DEEP } }), shown);
  assert.equal(r2.ok, true);
  assert.equal(r2.ok && r2.kind, 'search');
  assert.notEqual(r2.ok && r2.url, DEEP);
  assert.deepEqual(r2.ok ? [...new URL(r2.url).searchParams.keys()] : null, ['q']);
  // ③ 활성 + 딥링크 + 라벨 있음 → 딥링크를 문자 단위 그대로
  const r3 = resolveGearLink('belt', cfg({ enabled: true, links: { belt: DEEP } }), shown);
  assert.equal(r3.ok && r3.kind, 'deeplink');
  assert.equal(r3.ok && r3.url, DEEP);
  // 딥링크가 있어도 게이트가 우선한다
  assert.deepEqual(
    resolveGearLink('belt', cfg({ enabled: true, links: { belt: DEEP } }), hidden),
    { ok: false, blocked: 'disclosure-missing' },
  );
  // 교차 카테고리 — 다른 카테고리의 딥링크도 고지를 요구하고, 없으면 belt 조회까지 막힌다
  assert.deepEqual(
    resolveGearLink('belt', cfg({ enabled: false, links: { shoes: DEEP } }), hidden),
    { ok: false, blocked: 'disclosure-missing' },
    '교차 카테고리 딥링크도 고지 게이트를 발동시킨다',
  );
  // 미지 카테고리(캐스팅 우회)
  assert.deepEqual(
    resolveGearLink('dumbbell' as GearCategory, cfg({ enabled: true }), shown),
    { ok: false, blocked: 'unknown-category' },
  );
  // 단계 순서 — 1단계 카테고리 판정이 2단계 고지 게이트보다 앞선다.
  // 고지 게이트가 발동하는 조건(enabled:true + 라벨 없음)에서 확인해야 순서가 관측된다.
  assert.deepEqual(
    resolveGearLink('dumbbell' as GearCategory, cfg({ enabled: true }), hidden),
    { ok: false, blocked: 'unknown-category' },
    '미지 카테고리 판정이 고지 게이트보다 먼저다',
  );
  assert.deepEqual(
    resolveGearLink('__proto__' as GearCategory, undefined, shown),
    { ok: false, blocked: 'unknown-category' },
  );

  // 요청 카테고리 ↔ 사용 딥링크 결속 — 활성 상태에서 '다른 카테고리의 딥링크'가 절대 대체되지 않는다.
  // 이 assert 가 없으면 bag[c] 를 bag['shoes'] 나 Object.values(bag)[0] 로 바꿔도 전건 초록이라,
  // 사용자가 벨트 태그를 눌렀는데 신발 딥링크로 나가는 오배송이 검출되지 않는다.
  // (교차 케이스가 enabled:false 에만 있으면 정리 B 때문에 어차피 search 라 결속을 전혀 고정하지 못한다.)
  const cross = cfg({ enabled: true, links: { shoes: DEEP } });
  const missBelt = resolveGearLink('belt', cross, shown);
  assert.equal(missBelt.ok && missBelt.kind, 'search', '링크 없는 카테고리는 딥링크로 대체되지 않는다');
  assert.equal(missBelt.ok && missBelt.url, searchUrlOf('belt'), '자기 카테고리의 검색 URL이어야 한다');
  const hitShoes = resolveGearLink('shoes', cross, shown);
  assert.equal(hitShoes.ok && hitShoes.kind, 'deeplink');
  assert.equal(hitShoes.ok && hitShoes.url, DEEP);
  // 8종 전수 — 링크가 있는 카테고리만 deeplink 이고 나머지는 전부 자기 검색 URL
  for (const c of GEAR_CATEGORIES) {
    const r = resolveGearLink(c, cross, shown);
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.kind, c === 'shoes' ? 'deeplink' : 'search', c);
    if (c !== 'shoes') assert.equal(r.ok && r.url, searchUrlOf(c), c);
  }

  // 정리 A 기계 검증 — kind==='deeplink' 가 나오는 칸은 정확히 하나여야 한다
  const configs: unknown[] = [
    undefined, null, {}, { enabled: false }, { enabled: 'yes' },
    { enabled: true }, { enabled: true, links: {} },
    { enabled: true, links: { belt: BAD } }, { enabled: true, links: { belt: 123 } },
    { enabled: false, links: { belt: DEEP } }, { enabled: false, links: { belt: BAD } },
    { enabled: true, links: { belt: DEEP } },
    [], 'x', 0, true,
  ];
  let deeplinkCount = 0;
  for (const v of configs) {
    for (const ctx of [hidden, shown]) {
      const r = resolveGearLink('belt', cfg(v), ctx);
      if (r.ok && r.kind === 'deeplink') {
        deeplinkCount += 1;
        assert.equal(requiresAffiliateDisclosure(cfg(v)), true, '정리 A: 고지 필요');
        assert.equal(ctx.disclosureRendered, true, '정리 A: 고지 렌더됨');
      }
      if (!r.ok) assert.equal(r.blocked, 'disclosure-missing');
    }
  }
  assert.equal(deeplinkCount, 1, 'kind:deeplink 는 정확히 한 조합에서만 나온다');
});

// ── T17 허용 호스트 판정(엔진 비의존) ────────────────────────────
test('T17 허용 호스트: 정확 일치만 통과 · suffix 매칭 회귀 방지', () => {
  const via = (raw: unknown) =>
    resolveGearLink('belt', cfg({ enabled: true, links: { belt: raw } }), shown);

  const allow = [
    'https://link.coupang.com/a/abc',
    'https://www.coupang.com/np/search?q=%EB%B2%A8%ED%8A%B8',
    'https://coupang.com/a/x',
    'HTTPS://LINK.COUPANG.COM/a/abc',
  ];
  for (const u of allow) {
    const r = via(u);
    assert.equal(r.ok && r.kind, 'deeplink', u);
    assert.equal(r.ok && r.url, u, '원문 그대로 반환');
  }

  const deny: unknown[] = [
    'https://evilcoupang.com/a/x',            // suffix 매칭 금지의 증인
    'https://link.coupang.com.attacker.io/a/x',
    'https://link.coupang.com@evil.com/a/x',  // userinfo 스푸핑
    'https://link.coupang.com',               // 경로 없음
    'https://link.coupang.com:8443/a/x',      // 포트
    'https://coupang.com./a/x',               // 트레일링 도트
    'http://link.coupang.com/a/x',            // https 아님
    '//link.coupang.com/a/x',                 // 스킴 없음
    'javascript:alert(1)',
    '  https://link.coupang.com/a/x',         // 선행 공백
    'https://link.coupang.com/a/x\nX',        // 제어문자
    'https://link.coupang.com\\@evil.com/x',  // 백슬래시 트릭
    // 비-ASCII 호스트 — 'K'(U+212A KELVIN SIGN)는 toLowerCase() 가 ASCII 'k'로 접어 버려
    // 허용 집합의 어떤 원소와도 바이트가 다른 문자열이 '정확 일치'를 통과하던 경로. 검사는 접기 전에 해야 한다.
    'https://lin\u212A.coupang.com/a/x',
    'not a url', 123, null, {}, [], '', `https://link.coupang.com/${'a'.repeat(2100)}`,
  ];
  for (const u of deny) {
    const r = via(u);
    assert.equal(r.ok && r.kind, 'search', String(u));
  }
});

// ── T18 cfg 이상 입력·무예외 ─────────────────────────────────────
test('T18 cfg 이상 입력: 전부 무예외로 수렴', () => {
  const linkVals: unknown[] = [123, null, {}, [], true, undefined, NaN];
  for (const v of linkVals) {
    const r = resolveGearLink('belt', cfg({ enabled: true, links: { belt: v } }), shown);
    assert.equal(r.ok && r.kind, 'search', String(v));
  }
  const bagVals: unknown[] = ['abc', null, [], 42, true];
  for (const v of bagVals) {
    const r = resolveGearLink('belt', cfg({ enabled: true, links: v }), shown);
    assert.equal(r.ok && r.kind, 'search', String(v));
    assert.equal(requiresAffiliateDisclosure(cfg({ enabled: true, links: v })), true);
  }
  const cfgVals: unknown[] = [[], 'x', 0, true, NaN, Symbol('s')];
  for (const v of cfgVals) {
    const r = resolveGearLink('belt', cfg(v), shown);
    assert.equal(r.ok && r.kind, 'search', String(v));
    assert.equal(requiresAffiliateDisclosure(cfg(v)), false);
  }
  // 프로토타입 체인 조회 금지 — links 의 상속 값은 딥링크로 채택하지 않는다.
  // (SRS-039 클라이언트가 Object.assign(Object.create(defaults), resp) 로 병합하면
  //  서버가 내려주지 않은 카테고리에서 개발 기본값 딥링크가 살아나는 경로였다)
  const inherited = Object.create({ belt: DEEP }) as Record<string, unknown>;
  assert.equal((inherited as { belt?: string }).belt, DEEP, '전제: 체인으로는 읽힌다');
  const rInherited = resolveGearLink('belt', cfg({ enabled: true, links: inherited }), shown);
  assert.equal(rInherited.ok && rInherited.kind, 'search', '상속된 딥링크는 무시하고 검색 URL로 폴백');
  assert.equal(requiresAffiliateDisclosure(cfg({ enabled: false, links: inherited })), false, '상속 값은 고지 트리거가 아니다');

  // ctx 자체가 이상해도 던지지 않는다
  assert.equal(resolveGearLink('belt', undefined, undefined as never).ok, true);
  assert.equal(resolveGearLink('belt', cfg({ enabled: true }), undefined as never).ok, false);
});

// ── T19 스캔 절단 ────────────────────────────────────────────────
test('T19 MAX_GEAR_INPUT_SCAN: 스캔 절단이 병합보다 먼저 · 경계값 · 무예외', () => {
  // ① 창 밖(index 205)의 shoes 는 결과에 없다
  const a: unknown[] = Array.from({ length: 210 }, () => ({ category: 'belt', source: 'auto' }));
  a[205] = { category: 'shoes', source: 'user' };
  const ra = normalizeGearTags(a);
  assert.deepEqual(ra.map((t) => t.category), ['belt']);

  // ② 200개 뒤의 user 태그는 auto 를 이기지 못한다(절단이 병합보다 먼저임을 관측)
  const b: unknown[] = [
    ...Array.from({ length: MAX_GEAR_INPUT_SCAN }, () => ({ category: 'belt', source: 'auto' })),
    { category: 'belt', source: 'user', note: '메모' },
  ];
  assert.deepEqual(normalizeGearTags(b), [{ category: 'belt', source: 'auto' }]);

  // ③ 경계값 — 정확히 200번째는 살아남고 201번째는 폐기
  const c200: unknown[] = Array.from({ length: MAX_GEAR_INPUT_SCAN }, () => ({ category: 'belt', source: 'auto' }));
  c200[MAX_GEAR_INPUT_SCAN - 1] = { category: 'chalk', source: 'user' };
  assert.deepEqual(normalizeGearTags(c200).map((t) => t.category), ['belt', 'chalk']);

  const c201: unknown[] = Array.from({ length: MAX_GEAR_INPUT_SCAN + 1 }, () => ({ category: 'belt', source: 'auto' }));
  c201[MAX_GEAR_INPUT_SCAN] = { category: 'chalk', source: 'user' };
  assert.deepEqual(normalizeGearTags(c201).map((t) => t.category), ['belt']);

  // ④ 길이 300 무예외 · 상한 이하 · 멱등
  const big: unknown[] = Array.from({ length: 300 }, (_, i) => ({
    category: GEAR_CATEGORIES[i % GEAR_CATEGORIES.length], source: 'user',
  }));
  const rb = normalizeGearTags(big);
  assert.ok(rb.length <= MAX_GEAR_TAGS);
  assert.deepEqual(normalizeGearTags(rb), rb);
});

// ── T21 브랜드 (ADR-027 D5 개정판) ───────────────────────────────
test('T21 브랜드: 불변식 · 검색어 반영 · 미지정 시 회귀 없음', () => {
  // (1) 회귀 없음 — brand 미지정이면 URL이 개정 전과 문자 단위로 동일하다
  for (const c of GEAR_CATEGORIES) {
    const plain = resolveGearLink(c, undefined, hidden);
    const asTag = resolveGearLink({ category: c, source: 'user' }, undefined, hidden);
    assert.equal(plain.ok && plain.url, asTag.ok && asTag.url, `카테고리/태그 호출 동일: ${c}`);
  }

  // (2) brand 가 있으면 q 값에 반영된다 — 쿼리 키는 여전히 q 하나뿐(정리 B 불변)
  const r = resolveGearLink({ category: 'belt', source: 'user', brand: 'SBD', brandSource: 'user' }, undefined, hidden);
  assert.equal(r.ok && r.kind, 'search');
  const u = new URL(r.ok ? r.url : '');
  assert.deepEqual([...u.searchParams.keys()], ['q'], '추적 파라미터 0개 유지');
  assert.equal(u.searchParams.get('q'), 'SBD 리프팅 벨트', '브랜드 + 카테고리어');
  assert.notEqual(u.searchParams.get('q'), 'SBD', '카테고리어를 지우지 않는다(관련성 조항)');

  // (3) 딥링크는 brand 유무와 무관하게 무가공 통과 — 링크 조작 금지(운영정책 4.1)
  const cfgOn = cfg({ enabled: true, links: { belt: DEEP } });
  const d1 = resolveGearLink({ category: 'belt', source: 'user' }, cfgOn, shown);
  const d2 = resolveGearLink({ category: 'belt', source: 'user', brand: 'SBD', brandSource: 'user' }, cfgOn, shown);
  assert.equal(d1.ok && d1.url, DEEP);
  assert.equal(d2.ok && d2.url, DEEP, '브랜드가 있어도 딥링크는 문자 단위 그대로');

  // (4) 고지 게이트는 brand 와 무관하게 그대로 — 라벨 없으면 브랜드가 있어도 차단
  assert.deepEqual(
    resolveGearLink({ category: 'belt', source: 'user', brand: 'SBD', brandSource: 'user' }, cfgOn, hidden),
    { ok: false, blocked: 'disclosure-missing' },
  );

  // (5) brand ⟺ brandSource 동시 존재 불변식
  const onlySource = normalizeGearTags([{ category: 'belt', source: 'user', brandSource: 'auto' }]);
  assert.deepEqual(Object.keys(onlySource[0]), ['category', 'source'], 'brand 없는 brandSource 는 제거');
  const onlyBrand = normalizeGearTags([{ category: 'belt', source: 'user', brand: 'SBD' }]);
  assert.equal(onlyBrand[0].brandSource, 'user', 'brandSource 없으면 user로 수렴');

  // (6) brandSource 는 source 와 별개 축이다 — 태그는 user 인데 브랜드만 auto 일 수 있다
  const mixed = normalizeGearTags([
    { category: 'belt', source: 'user', brand: 'SBD', brandSource: 'auto' },
  ]);
  assert.equal(mixed[0].source, 'user');
  assert.equal(mixed[0].brandSource, 'auto', '확인을 거쳐도 auto 원천 표시는 지워지지 않는다');

  // (7) brand 정제 — note 와 같은 규칙, 상한만 다름
  const long = normalizeGearTags([{ category: 'belt', source: 'user', brand: 'A'.repeat(60) }]);
  assert.equal([...(long[0].brand as string)].length, MAX_GEAR_BRAND_LEN);
  for (const bad of [42, null, {}, [], '   ', '\u0000\u0000']) {
    const t = normalizeGearTags([{ category: 'belt', source: 'user', brand: bad }]);
    assert.deepEqual(Object.keys(t[0]), ['category', 'source'], `무효 brand 제거: ${String(bad)}`);
  }
  assert.equal(
    normalizeGearTags([{ category: 'belt', source: 'user', brand: ' S\u0000B D ' }])[0].brand,
    'S B D', '제어문자 → 공백 · 공백 접기 · trim',
  );

  // (8) 병합 시 brand 는 brandSource 와 쌍으로 승계된다
  const merged = normalizeGearTags([
    { category: 'belt', source: 'user' },
    { category: 'belt', source: 'auto', brand: 'SBD', brandSource: 'auto' },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'user', 'user 태그가 이긴다(D7)');
  assert.equal(merged[0].brand, 'SBD', '진 쪽의 brand 를 승계');
  assert.equal(merged[0].brandSource, 'auto', 'brandSource 도 쌍으로 승계 — 값만 오고 출처가 갈리면 안 된다');

  // (9) 멱등
  const sample = [{ category: 'belt', source: 'user', brand: '  SBD  ', brandSource: 'auto' }];
  assert.deepEqual(normalizeGearTags(normalizeGearTags(sample)), normalizeGearTags(sample));

  // (10) 미지 카테고리 태그도 차단된다(태그 경로에서도 1단계가 먼저)
  assert.deepEqual(
    resolveGearLink({ category: 'dumbbell', source: 'user', brand: 'X' } as never, undefined, shown),
    { ok: false, blocked: 'unknown-category' },
  );
});

// ── T20 배럴 스모크 ──────────────────────────────────────────────
test('T20 배럴: 런타임 심볼 재수출 · 내부 함수 비공개 회귀 방지', () => {
  const runtimeSymbols = [
    'GEAR_CATEGORIES', 'MAX_GEAR_TAGS', 'MAX_GEAR_NOTE_LEN', 'MAX_GEAR_INPUT_SCAN',
    'AFFILIATE_DISCLOSURE_KO', 'isGearCategory', 'gearLabelKey', 'normalizeGearTags',
    'requiresAffiliateDisclosure', 'resolveGearLink',
  ];
  for (const s of runtimeSymbols) assert.ok(s in domain, `배럴 누락: ${s}`);
  // URL 조각은 어떤 것도 공개되지 않는다 — 공개되면 고지 게이트를 우회해 같은 URL을 만들 수 있다
  assert.equal('gearSearchQuery' in domain, false);
  assert.equal('coupangSearchUrl' in domain, false);
  assert.equal('isAllowedAffiliateUrl' in domain, false);
  assert.equal('GEAR_SEARCH_QUERY' in domain, false);
  assert.equal('hasAnyAffiliateLink' in domain, false);
  // 허용 호스트 집합도 같은 급이다 — 공개되면 소비자가 자체 호스트 검증을 만들어 게이트 밖에서 링크를 연다
  assert.equal('ALLOWED_AFFILIATE_HOSTS' in domain, false);
  assert.equal('readLink' in domain, false);
});
