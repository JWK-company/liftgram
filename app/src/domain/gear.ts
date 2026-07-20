// 착용장비 도메인 — 카테고리 사전·태그 정규화·링크 해석기·대가성 고지 판정. RN 비의존 순수 모듈.
// @plm SRS-037  착용장비 카테고리 수준 태그 · 정규화 · 쿠팡 링크 해석 · 고지 필요 판정
// @plm SAD-020  Phase 0 아키텍처 — 도메인 gear 모듈(정책성 규칙의 유일한 자동 회귀 계층)
//
// spec: .ouroboros/docs/spec/20260720_gear-domain_spec.md (rev3) — 정책 근거·전수 진리표·기대 판정표는 그쪽이 권위.
// 아래 주석과 spec이 어긋나면 spec을 따르고 주석을 고친다.
//
// 이 모듈은 앱에서 자동 테스트가 걸리는 유일한 계층이다(러너 glob = src/domain/__tests__/*.test.ts 1-depth).
// 따라서 제휴 정책·법정 고지에 관한 규칙을 전부 여기에 모아 테스트로 고정한다. UI에 흩뿌리지 말 것.
//
// gotcha: 이 파일에서 `new URL`을 절대 쓰지 않는다. 앱 런타임의 전역 URL은 RN 정규식 폴리필이라
// Node의 WHATWG URL과 의미가 다르다(throw 여부·소문자 정규화 여부). 안전이 걸린 판정을 엔진 차이가
// 있는 API로 구현하면 Node 테스트가 초록인데 기기에서 다르게 동작한다. URL 조립·호스트 판정 모두 문자열 연산으로만 한다.

// 착용장비 카테고리 8종(ADR-027 D5). 브랜드·모델은 표현하지 않는다 —
// 로고 오인식 분쟁을 피하고, 쿠팡 오픈 API 키가 없는 Phase 0에서 모델 단위 상품 데이터를 확보할 수도 없다.
// domain/types.ts 의 EquipmentType(barbell/dumbbell/machine…)은 '운동 기구'로 이미 점유된 개념이라 섞지 않는다.
export const GEAR_CATEGORIES = Object.freeze([
  'wristWrap', 'strap', 'belt', 'kneeSleeve', 'gloves', 'shoes', 'chalk', 'armSleeve',
] as const);

export type GearCategory = (typeof GEAR_CATEGORIES)[number];

// 태그 원천. Phase 1의 비전 LLM 자동 감지가 사용자 지정 태그를 덮어쓰지 못하게 하는 장치(ADR-027 D7).
// Phase 0에서는 항상 'user'지만 형식을 지금 심어 둔다.
export type GearSource = 'user' | 'auto';

export interface GearTag {
  readonly category: GearCategory;
  readonly source: GearSource;
  // Phase 0 비입력·비렌더 — 외부(조작된 클라이언트·손상 데이터)에서 들어온 값을 보존·정제만 한다.
  // 렌더하면 30자 안에 브랜드명이 들어가 ADR-027 D5가 막으려던 표면이 그대로 복원된다.
  readonly note?: string;
}

// 타입 주석 없이 선언 — 리터럴 타입(8 / 30 / 200)을 보존한다.
export const MAX_GEAR_TAGS = GEAR_CATEGORIES.length;
export const MAX_GEAR_NOTE_LEN = 30;
// 손상·조작된 data.gear[] 가 수만 개일 때 피드 카드마다 전량 순회하는 비용 차단.
export const MAX_GEAR_INPUT_SCAN = 200;

// 법정 대가성 고지 문구. i18n 키를 만들지 않는다 — '도메인은 표시 문자열을 갖지 않는다'는 원칙의 의도적 예외다.
// 파트너스 가이드가 "추천·보증과 같은 언어로 기재"를 요구하고 위반 사례에 '영문·줄임말 기재'가 명시돼 있어,
// en 로케일 사용자에게 영문 고지가 렌더되면 그대로 위반이 된다. 로케일 무관 한국어 고정.
// 리팩터링으로 i18n에 끌려 들어가지 말 것.
export const AFFILIATE_DISCLOSURE_KO =
  '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.' as const;

// 넓은 string이 아니라 템플릿 리터럴로 좁힌다 — t()의 시그니처가 t(key: TransKey)이고
// TransKey = keyof typeof ko 라, 넓은 string이면 소비자가 as TransKey 캐스팅을 강요당하고
// 그 순간 ko.ts에 8키가 실재하는지에 대한 컴파일 검증이 전부 사라진다.
export type GearLabelKey = `gear.cat.${GearCategory}`;

// SRS-039 서버 설정 조회 응답 형태.
// 주의: 네트워크 JSON을 캐스팅해 들어오므로 이 타입은 런타임 보증이 아니다. data.gear[]와 같은 신뢰 수준으로 다룬다.
export interface GearAffiliateConfig {
  // 딥링크 사용 허가 스위치. === true 엄격 비교로만 읽는다('yes'·1·'true'는 전부 비활성).
  enabled: boolean;
  // 카테고리 → 파트너스 공식 링크 생성기/Deeplink API로 사전 생성된 딥링크(link.coupang.com/a/…).
  // 반드시 "검색 결과 URL을 원본으로 생성한" 딥링크만 주입한다 — 상품 상세(/vp/products/…) 딥링크는
  // ADR-027 D5(브랜드·모델 미특정)를 링크 계층에서 무력화한다. 단축 URL이라 목적지를 코드로 구분할 방법이
  // 원리적으로 없어 사람의 절차가 유일한 방어선이다(spec §links 정책).
  links?: Partial<Record<GearCategory, string>>;
}

export type GearLinkResult =
  | { ok: true; kind: 'deeplink' | 'search'; url: string }
  | { ok: false; blocked: 'disclosure-missing' | 'unknown-category' };

// 카테고리 → 쿠팡 검색어. 모듈 내부 전용.
// 이 사전은 운영정책 4.1 6) "검색 키워드가 관련성이 지나치게 떨어지는 상품과 연계하는 경우" 금지 조항의
// 유일한 가드레일이다. 변경 시 반드시 실제 쿠팡 검색 결과 관련성을 재확인할 것.
// (표시 라벨이 아니라 한국 서비스 질의용 정책 데이터이므로 i18n 대상이 아니다.)
const GEAR_SEARCH_QUERY: Record<GearCategory, string> = Object.freeze({
  wristWrap: '손목보호대 리스트랩',
  strap: '헬스 스트랩',
  belt: '리프팅 벨트',
  kneeSleeve: '무릎보호대 니슬리브',
  gloves: '헬스 장갑',
  shoes: '리프팅화',
  chalk: '리프팅 초크',
  // 무한정 '암슬리브'는 야구·사이클·자외선 차단 팔토시가 대량 유입되므로 도메인 한정어를 붙인다.
  armSleeve: '헬스 암슬리브',
});

// 제휴 딥링크로 허용하는 호스트. 정확 일치만 허용한다 — endsWith·indexOf·부분문자열 includes·정규식
// 부분 매칭은 금지다(evilcoupang.com · link.coupang.com.attacker.io 가 통과한다).
const ALLOWED_AFFILIATE_HOSTS: readonly string[] = Object.freeze([
  'link.coupang.com', 'www.coupang.com', 'coupang.com',
]);

export function isGearCategory(v: unknown): v is GearCategory {
  // 객체 키 조회로 구현하지 말 것 — 캐스팅된 'toString'·'constructor'·'__proto__'가 통과한다.
  return typeof v === 'string' && (GEAR_CATEGORIES as readonly string[]).includes(v);
}

export function gearLabelKey<C extends GearCategory>(c: C): `gear.cat.${C}` {
  return `gear.cat.${c}`;
}

// 검색어 조회 — 사전 직접 참조를 이 함수 하나로 모은다. export 하지 않는다(§고지 게이트 — URL 조각 비공개).
// 공개되면 `openURL('https://www.coupang.com/np/search?q=' + encodeURIComponent(gearSearchQuery(c)))` 한 줄로
// 내부 빌더와 문자까지 동일한 URL을 게이트 없이 만들 수 있다. T20이 이 심볼의 비공개를 회귀 고정한다.
function gearSearchQuery(c: GearCategory): string {
  return GEAR_SEARCH_QUERY[c];
}

// 검색 URL 조립 — 쿼리 키는 정확히 q 하나. 순수 문자열 결합(URL 파서 미사용).
// services/gymSearch.ts 의 gymMapsUrl() 선례를 따른다. export 하지 않는다(§고지 게이트 — URL 조각 비공개).
function coupangSearchUrl(c: GearCategory): string {
  return `https://www.coupang.com/np/search?q=${encodeURIComponent(gearSearchQuery(c))}`;
}

// 허용 호스트 판정 — URL 파싱을 쓰지 않는 엔진 비의존 순수 문자열 연산. 실패해도 예외를 던지지 않는다.
function isAllowedAffiliateUrl(u: unknown): u is string {
  if (typeof u !== 'string') return false;
  if (u.length === 0 || u.length > 2048) return false;
  // 공백·제어문자 포함 URL 거부.
  if (/[\u0000-\u0020\u007F]/.test(u) || /\s/.test(u)) return false;
  // userinfo 스푸핑(@) · 백슬래시 트릭 거부.
  if (u.includes('@') || u.includes('\\')) return false;
  if (u.slice(0, 8).toLowerCase() !== 'https://') return false;
  const rest = u.slice(8);
  const slash = rest.indexOf('/');
  if (slash < 0) return false; // 경로 없는 authority-only 거부
  const rawHost = rest.slice(0, slash);
  // 비-ASCII 호스트 전면 거부. 반드시 toLowerCase() **앞에서** 검사한다 —
  // 'K'(U+212A KELVIN SIGN).toLowerCase() === 'k' 라, 접은 뒤에 검사하면 허용 집합의 어떤 원소와도
  // 바이트가 다른 문자열(linK.coupang.com)이 '정확 일치'를 통과한다. 반환 URL이 비-ASCII 호스트를
  // 그대로 담게 되어 기기에서 Linking.openURL 이 조용히 무반응이 되는 경로이기도 하다.
  if (!/^[A-Za-z0-9.-]+$/.test(rawHost)) return false;
  // 대소문자는 비교 시점에만 정규화한다(반환 URL은 원문 그대로).
  // 트레일링 도트는 정규화하지 않는다 — coupang.com. 은 정확 일치에 실패해 거부된다.
  const host = rawHost.toLowerCase();
  // 아래 includes 는 배열 원소 === 비교이지 문자열 부분 매칭이 아니다.
  return ALLOWED_AFFILIATE_HOSTS.includes(host);
  // 경로·쿼리·프래그먼트는 검사하지 않는다 — 무가공 원칙.
}

// cfg 는 SRS-039 응답을 캐스팅해 들어오는 불투명 JSON이다. 어떤 형태 이상도 예외 없이 수렴시킨다.
function readLinkBag(cfg: unknown): Record<string, unknown> | undefined {
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) return undefined;
  const links = (cfg as Record<string, unknown>).links;
  if (links === null || typeof links !== 'object' || Array.isArray(links)) return undefined;
  return links as Record<string, unknown>;
}

// 값 조회는 own property 로만 한다 — 프로토타입 체인 조회 금지.
// bag[c] 브래킷 접근만 쓰면 links 가 체인에 딥링크를 갖고 있을 때(Object.assign(Object.create(defaults), resp) 같은
// 병합) 서버가 내려주지 않은 카테고리에서 제3자·미승인 링크가 살아난다. 호스트 검증은 통과하므로 아무 방어선에도 안 걸린다.
function readLink(bag: Record<string, unknown> | undefined, c: GearCategory): unknown {
  return bag !== undefined && Object.prototype.hasOwnProperty.call(bag, c) ? bag[c] : undefined;
}

function isAffiliateEnabled(cfg: unknown): boolean {
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) return false;
  return (cfg as Record<string, unknown>).enabled === true;
}

// GEAR_CATEGORIES 8종만 순회한다 — Object.keys(links) 순회는 거대 객체·프로토타입 오염 키에 노출된다.
function hasAnyAffiliateLink(cfg: unknown): boolean {
  const bag = readLinkBag(cfg);
  if (!bag) return false;
  for (const c of GEAR_CATEGORIES) {
    if (isAllowedAffiliateUrl(readLink(bag, c))) return true;
  }
  return false;
}

// 고지 필요 판정. 불변식: 허용 호스트 딥링크가 하나라도 존재하면 enabled 값과 무관하게 고지가 필요하다.
// enabled 는 우리 쪽 내부 플래그일 뿐이고, 대가 발생 가능성은 쿠팡이 발급한 딥링크가 살아 있는지가 결정한다.
// 공정위 심사지침(2024-12-01)은 미래·조건부 대가도 공개 의무 대상으로 규정한다.
export function requiresAffiliateDisclosure(cfg?: GearAffiliateConfig | null): boolean {
  return isAffiliateEnabled(cfg) || hasAnyAffiliateLink(cfg);
}

// URL을 얻는 유일한 공개 경로. 고지 렌더 사실을 인자로 요구해 '라벨 없이 링크를 여는 경로'를 없앤다(ADR-027 D6).
// 검색어 사전·URL 조립기·호스트 판정은 전부 모듈 내부이며 export 하지 않는다 — 하나라도 공개하면
// 게이트를 우회해 같은 URL을 만들 수 있어 은닉의 실효가 사라진다.
// 계약: 어떤 입력에도 예외를 던지지 않는다.
export function resolveGearLink(
  c: GearCategory,
  cfg: GearAffiliateConfig | null | undefined,
  ctx: { disclosureRendered: boolean },
): GearLinkResult {
  if (!isGearCategory(c)) return { ok: false, blocked: 'unknown-category' };

  // 게이트가 딥링크·검색 양쪽보다 앞선다 — 고지가 필요한데 렌더되지 않았으면 아무것도 열리지 않는다.
  const rendered = (ctx as { disclosureRendered?: unknown } | null | undefined)?.disclosureRendered;
  if (requiresAffiliateDisclosure(cfg) && rendered !== true) {
    return { ok: false, blocked: 'disclosure-missing' };
  }

  // enabled 조건이 '비활성이면 추적 식별자 0개'를 보증한다. 비활성이면 links 가 있어도 검색 URL로 낙하한다.
  if (isAffiliateEnabled(cfg)) {
    const raw = readLink(readLinkBag(cfg), c);
    // 문자 단위 그대로 반환 — 파싱·재조립·파라미터 추가 어떤 가공도 하지 않는다.
    // 운영정책 4.1 1) 이 '광고의 링크·형태에 대한 별도의 조작 행위'를 A등급 제재로 금지한다.
    if (isAllowedAffiliateUrl(raw)) return { ok: true, kind: 'deeplink', url: raw };
  }

  return { ok: true, kind: 'search', url: coupangSearchUrl(c) };
}

// note 정제 — 제어문자·라인구분자 → 공백 치환 → 고립 서로게이트 제거 → 공백 접기 → trim → 코드포인트 절단 → 재trim.
// 코드유닛 slice면 이모지 서로게이트 페어가 반쪽만 남고, 그 lone surrogate가 직렬화되면 저장이 깨진다.
// 절단이 만드는 반쪽만 막는 것으로는 부족하다 — 입력(조작된 클라이언트·손상 데이터)에 이미 들어 있던
// 고립 서로게이트는 코드포인트 절단을 그대로 통과해 data.gear[].note 로 직렬화되고, Postgres jsonb 가
// 짝 없는 서로게이트 이스케이프를 거부해 게시 요청이 500으로 떨어진다(삼켜져 저장되면 렌더 시 U+FFFD 파손).
// 제거 단계는 반드시 공백 접기 **앞**에 둔다 — 뒤에 두면 'a <lone> b' 가 'a  b' 로 남아 멱등성이 깨진다.
// 정규식은 정상 페어를 먼저 소비해 보존하며 lookbehind를 쓰지 않는다(Hermes 미지원 대비 — 엔진 비의존 원칙).
// 마지막 재trim이 없으면 공백 경계 절단 시 후행 공백이 남아 멱등성이 깨진다(쓰기·읽기 양쪽에서 재사용하므로 필수).
function sanitizeNote(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const collapsed = v
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\uFEFF]/g, ' ')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (m) => (m.length === 2 ? m : ''))
    .replace(/\s+/g, ' ')
    .trim();
  const cut = Array.from(collapsed).slice(0, MAX_GEAR_NOTE_LEN).join('').trim();
  return cut.length > 0 ? cut : undefined;
}

// 출력은 항상 새 리터럴로 구성한다 — 입력 객체를 반환·스프레드하지 않는다.
// 그래야 brand·url·데이터 키로 실린 __proto__ 같은 그 외 모든 키가 폐기된다.
function makeTag(category: GearCategory, source: GearSource, note: string | undefined): GearTag {
  return note !== undefined ? { category, source, note } : { category, source };
}

// 순서 무관 우선순위 병합 — user가 auto를 항상 이기고, 같은 source끼리는 먼저 온 것이 남는다.
// 이긴 쪽에 note가 없고 진 쪽에 있으면 승계한다(이름값 하는 '병합').
// 위치 기반 '먼저 온 것 유지'로 구현하면 Phase 1에서 자동 감지 결과를 앞에 붙이는 파이프라인에서
// 사용자가 직접 고른 태그와 메모가 조용히 사라진다(ADR-027 D7 위반).
function mergeTag(prev: GearTag, next: GearTag): GearTag {
  const winner = prev.source === 'user' || next.source !== 'user' ? prev : next;
  const loser = winner === prev ? next : prev;
  const note = winner.note !== undefined ? winner.note : loser.note;
  return makeTag(winner.category, winner.source, note);
}

// 서버 Post.data 는 @IsObject() 만 걸린 불투명 Json 필드라 어떤 형태든 들어올 수 있다.
// 이 함수가 사실상 유일한 방어선이므로 여기서 던지면 방어선이 아니라 장애 증폭기가 된다.
// 적용 순서(구현 재량 없음): ① 스캔 절단 → ② 원소 필터·정제 → ③ 중복 병합 → ④ 개수 상한.
export function normalizeGearTags(input: unknown): GearTag[] {
  if (!Array.isArray(input)) return [];

  // 스캔 절단은 화이트리스트 필터·병합보다 먼저 일어나며 결과에 영향을 준다(의미론이지 성능 최적화가 아니다).
  // 창 밖 원소는 조용히 폐기한다 — 정상 경로에서는 8건 이하라 도달 불가.
  const scanLen = input.length > MAX_GEAR_INPUT_SCAN ? MAX_GEAR_INPUT_SCAN : input.length;

  const order: GearCategory[] = [];
  const byCategory = new Map<GearCategory, GearTag>();

  for (let i = 0; i < scanLen; i += 1) {
    const el: unknown = input[i];
    // typeof null === 'object' 라 '객체가 아니면 폐기'를 문자 그대로 구현하면
    // 다음 줄 el.category 접근에서 TypeError가 나고 피드 전체 렌더가 날아간다.
    if (el === null || typeof el !== 'object' || Array.isArray(el)) continue;

    const rec = el as Record<string, unknown>;
    const category = rec.category;
    if (!isGearCategory(category)) continue;

    // 없음·오타·null·비문자열은 'user'로 수렴한다. 유효하면 임의로 바꾸지 않는다(ADR-027 D7).
    const source: GearSource = rec.source === 'auto' ? 'auto' : 'user';
    const tag = makeTag(category, source, sanitizeNote(rec.note));

    const prev = byCategory.get(category);
    if (prev === undefined) {
      order.push(category);
      byCategory.set(category, tag);
    } else {
      byCategory.set(category, mergeTag(prev, tag));
    }
  }

  // 출력 위치는 각 카테고리의 최초 등장 순서를 따른다.
  const out: GearTag[] = [];
  for (const c of order) {
    const tag = byCategory.get(c);
    if (tag !== undefined) out.push(tag);
  }

  // 화이트리스트 8종 + 중복 병합을 거치므로 현재는 도달 불가능한 방어선이다.
  // 카테고리가 늘고 상한이 별도 값으로 고정되는 미래를 대비해 순서(마지막 적용)를 지킨다.
  return out.length > MAX_GEAR_TAGS ? out.slice(0, MAX_GEAR_TAGS) : out;
}
