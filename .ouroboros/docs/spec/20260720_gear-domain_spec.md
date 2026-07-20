# SRS-037 착용장비 도메인 모듈 — spec

- **등급**: Task (신규 2 · 수정 3 = 5파일, 단일 관심사, RN 비의존 순수 로직)
- **추적(implements)**: SRS-037 · SAD-020
- **전제 결정**: ADR-027 (D2 제휴 파라미터 없이 출발 · D5 카테고리 수준 태그 · D6 고지 라벨 강제 · D7 source 보존)
- **autorun**: RM-016 큐 1/6
- **개정**: rev3 (2026-07-20) — 2사이클 리뷰(4관점) 반영. **핵심 정정 = `enabled:false` + `links` 조합에서 고지 없이 딥링크가 열리던 rev2 구멍을 이중 방어로 봉쇄**(고지 판정에 "딥링크 존재" OR 추가 + 딥링크 사용 단계에 `enabled===true` 요구). 부수 = 허용 호스트 정확 일치·엔진 비의존 판정 · `resolveGearLink` 무예외 계약 · `kind` 판별 필드 · `gearSearchQuery` 내부화 · ko/en 라벨 16문자열 확정 · 테스트 16→20그룹
- **rev2 → rev3 변경 한 줄**: *"제휴 딥링크는 고지가 실제로 렌더된 활성 상태에서만 반환된다"* 를 타입·알고리즘·테스트 세 층에서 동시에 고정했다.

## 목표

착용장비 Phase 0 기능군의 최하부에 RN 비의존 순수 도메인 모듈 `app/src/domain/gear.ts`를 신설한다.
이 리포에서 자동 회귀가 실제로 걸리는 유일한 계층이므로(`npm test` glob = `src/domain/__tests__/*.test.ts` 1-depth 고정),
정책성 규칙(카테고리 화이트리스트 · 링크 조립 · 고지 판정 · 정규화)을 **전부 여기에 모아** 테스트로 고정한다.
후속 SRS-038·040·041·042가 이 모듈을 그대로 소비한다.

Phase 0의 실제 동작은 **제휴 비활성 = 추적 파라미터 0개인 순수 쿠팡 검색 URL**이며 rev1과 동일하다.
rev2가 바꾼 것은 "활성화되는 순간 코드 변경 없이 프로덕션으로 나가는" 미래 경로의 **형태**다(§상위 아티팩트 개정 필요 참조).
rev3이 바꾼 것은 그 미래 경로의 **안전 조건**이다 — rev2는 "링크가 없어도 활성이면 고지한다"는 한 방향만 막고
그 반대편("링크는 있는데 비활성")을 열어 두어, 서버 env 롤아웃 순서 하나로 고지 없는 제휴 링크가 프로덕션에 나갈 수 있었다.

## 최상위 안전 정리 (rev3 — 이 문서의 모든 규칙이 지키는 명제)

> **정리 A**: `resolveGearLink`가 `kind:'deeplink'`를 반환하는 것은
> `requiresAffiliateDisclosure(cfg) === true` **이고** `ctx.disclosureRendered === true` 일 때뿐이다.
> 즉 **고지 없이 제휴 딥링크가 열리는 경로가 코드상 존재하지 않는다.**
>
> **정리 B**: `cfg?.enabled !== true` 이면 반환 URL은 언제나 추적 식별자 0개의 순수 검색 URL이다
> (`links`의 존재·내용과 무관하게 전면 무시).

정리 A는 §고지 게이트의 2·3단계와 `requiresAffiliateDisclosure`의 OR 확장이 함께 보증하고, 정리 B는 3단계의 `enabled===true` 조건이 보증한다.
두 정리는 T15·T16이 전수 조합으로 고정한다. **이후 어떤 개정도 이 두 정리를 약화시켜서는 안 된다.**

## 공개 API 설계

```ts
export const GEAR_CATEGORIES = Object.freeze([
  'wristWrap', 'strap', 'belt', 'kneeSleeve', 'gloves', 'shoes', 'chalk', 'armSleeve',
] as const);
export type GearCategory = (typeof GEAR_CATEGORIES)[number];
export type GearSource = 'user' | 'auto';

export interface GearTag {
  readonly category: GearCategory;
  readonly source: GearSource;
  readonly note?: string;   // Phase 0 비입력·비렌더 — 보존 전용(§note 정책)
}

// 타입 주석 없이 선언 — 리터럴 타입(8 / 30 / 200) 보존
export const MAX_GEAR_TAGS = GEAR_CATEGORIES.length;  // 8
export const MAX_GEAR_NOTE_LEN = 30;
export const MAX_GEAR_INPUT_SCAN = 200;               // 손상 입력 순회 비용 상한

// 대가성 고지 문구 — i18n 대상 아님. 로케일 무관 항상 한국어(§고지 문구 소유권)
export const AFFILIATE_DISCLOSURE_KO =
  '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.' as const;

export type GearLabelKey = `gear.cat.${GearCategory}`;

// SRS-039 서버 설정 조회 응답 형태.
// 주의: 네트워크 JSON을 캐스팅해 들어오므로 이 타입은 런타임 보증이 아니다(§cfg 입력 계약).
export interface GearAffiliateConfig {
  enabled: boolean;                               // 제휴 매체 활성 = 딥링크 사용 허가 스위치
  // 카테고리 → 파트너스 공식 링크 생성기/Deeplink API로 사전 생성된 딥링크(link.coupang.com/a/…).
  // 주입 값은 반드시 "검색 결과 URL을 원본으로 생성한" 딥링크여야 한다 — 상품 상세 딥링크는
  // ADR-027 D5(브랜드·모델 미특정)를 링크 계층에서 무력화한다(§links 정책). 코드는 이를 검증할 수 없다.
  links?: Partial<Record<GearCategory, string>>;
}

export type GearLinkResult =
  | { ok: true; kind: 'deeplink' | 'search'; url: string }
  | { ok: false; blocked: 'disclosure-missing' | 'unknown-category' };

export function isGearCategory(v: unknown): v is GearCategory;
export function gearLabelKey<C extends GearCategory>(c: C): `gear.cat.${C}`;
export function normalizeGearTags(input: unknown): GearTag[];
export function requiresAffiliateDisclosure(cfg?: GearAffiliateConfig | null): boolean;
export function resolveGearLink(
  c: GearCategory,
  cfg: GearAffiliateConfig | null | undefined,
  ctx: { disclosureRendered: boolean },
): GearLinkResult;

// 모듈 내부(export 하지 않음) — URL·검색어를 만드는 어떤 조각도 공개하지 않는다
// const GEAR_SEARCH_QUERY: Record<GearCategory, string>;
// const ALLOWED_AFFILIATE_HOSTS: readonly string[];
// function gearSearchQuery(c: GearCategory): string;
// function coupangSearchUrl(c: GearCategory): string;
// function isAllowedAffiliateUrl(u: unknown): u is string;
// function hasAnyAffiliateLink(cfg: unknown): boolean;
```

`gearLabelKey`의 반환형을 넓은 `string`이 아니라 템플릿 리터럴로 좁히는 이유: `t()`의 시그니처가
`t(key: TransKey)`이고 `TransKey = keyof typeof ko`(ko.ts 말미)라, 넓은 `string`이면 소비자가
`as TransKey` 캐스팅을 강요당하고 그 순간 ko.ts에 8키가 실재하는지에 대한 컴파일 검증이 전부 사라진다.
리터럴 유니온이면 **대입 가능성 자체가 키 존재 증명**이 되어 SRS-040 호출 지점에서 누락이 즉시 잡힌다.

- **구현 형태 고정**: 본문은 ``return `gear.cat.${c}`;`` 한 줄이다. TS 버전에 따라 제네릭 `C`의 템플릿 리터럴 추론이
  `string`으로 내려가면 ``as `gear.cat.${C}` `` 캐스트만 붙인다. **반환 타입을 넓은 `string`으로 되돌리지 않는다.**
  이 함수의 계약은 테스트가 아니라 **typecheck가 지키는 유일한 항목**이다(테스트 파일은 tsconfig exclude 대상).
- **상수 선언 관례 각주**: `types.ts`의 `ALL_*: MuscleGroup[]`(비-const assertion) 관례가 아니라
  `machineVariants.ts`·`variants.ts`의 `GRIP_KEYS = [...] as const` 관례를 따른다. 이유 ①카테고리 유니온을 배열에서
  파생해 증감 시 자동 동기 ②`GEAR_CATEGORIES.length`가 리터럴 `8`로 유지되어 `MAX_GEAR_TAGS` 상수식이 성립
  ③화이트리스트가 정책 데이터라 런타임 변조를 막기 위해 `Object.freeze`. (freeze는 이 모듈이 도입하는 신규 패턴 — 근거를 남겨 후속 리팩터링이 관례 위반으로 되돌리지 않게 한다.)
- **`gearSearchQuery`는 rev3에서 내부로 내렸다**(rev2까지 공개 export). 근거는 §고지 게이트의 "URL 조각 비공개" 절.

### 상한값 확정

| 상수 | 값 | 근거 |
|------|-----|------|
| `MAX_GEAR_TAGS` | `GEAR_CATEGORIES.length` (8) | 중복 카테고리가 이미 병합되므로 상한의 실질 방어 가치는 카테고리 수를 넘을 수 없다. 6으로 두면 파워리프팅 세션의 정상 조합(벨트·리스트랩·니슬리브·스트랩·초크·리프팅화 + 장갑/암슬리브 = 7~8종)이 **조용히 절단**되고, 읽기 경로에서도 같은 함수를 재사용하므로 이미 저장된 게시물이 렌더될 때마다 태그가 사라진다. 상수식으로 두어 카테고리 증감 시 자동 동기. 피드 밀도 제어(ADR-027 D4 취지)는 도메인 폐기가 아니라 **SRS-040의 접힘 요약칩 UI**가 담당한다(SRS-040 수용 기준 1에 이미 명시) |
| `MAX_GEAR_NOTE_LEN` | 30 | **저장 페이로드 상한**. Phase 0에서 note는 렌더되지 않으므로 "칩 1줄 표시 한도"는 근거가 아니다. 렌더가 도입되면 표시 폭 기준으로 재산정 대상 |
| `MAX_GEAR_INPUT_SCAN` | 200 | 손상·조작된 `data.gear[]`가 수만 개일 때 피드 카드마다 전량 순회하는 비용 차단 |

### 검색어 사전 (카테고리 → 한국어 검색어)

`const GEAR_SEARCH_QUERY: Record<GearCategory, string>` 로 **정확한 Record 타입**을 명시해 선언한다
(부분 맵·switch default 금지 — 카테고리 누락이 typecheck로 잡혀야 한다). 객체는 `Object.freeze` 한다. **모듈 내부에 둔다.**

| category | 검색어 |
|---|---|
| wristWrap | 손목보호대 리스트랩 |
| strap | 헬스 스트랩 |
| belt | 리프팅 벨트 |
| kneeSleeve | 무릎보호대 니슬리브 |
| gloves | 헬스 장갑 |
| shoes | 리프팅화 |
| chalk | 리프팅 초크 |
| armSleeve | **헬스 암슬리브** |

- `armSleeve`는 도메인 한정어를 붙인다 — 무한정 `암슬리브`는 야구·사이클·자외선 차단 팔토시가 대량 유입될 개연성이 높다.
- 사전 조회는 **`isGearCategory`를 통과한 값으로만** 수행한다. 타입은 런타임 보증이 아니고 입력이 불투명 JSON에서 오므로, 캐스팅된 `'toString'`·`'constructor'`·`'__proto__'` 같은 값이 객체 조회로 들어가면 함수·객체가 반환된다. `isGearCategory`는 `typeof v === 'string' && (GEAR_CATEGORIES as readonly string[]).includes(v)`로 정의한다(객체 키 조회 금지).
- 이 사전은 운영정책 4.1 6) *"검색 키워드가 관련성이 지나치게 떨어지는 상품과 연계하는 경우"* 금지 조항의 **유일한 가드레일**이다.
  `gear.ts`의 사전 위에 그 사실과 "변경 시 쿠팡 검색 결과 재확인 필수"를 주석으로 남긴다.
- 8개 검색어의 실제 결과 관련성 육안 확인은 **SRS-040(사용자 노출) 선행 체크리스트**로 올린다. 도메인 구현 태스크의 완료 조건이 아니다.

### 카테고리 라벨 문자열 확정 (ko.ts · en.ts 값 16개)

rev2는 "플랫 키 8개 추가"만 지시하고 **값**을 비워 두어 autorun 무인 실행에서 사용자 노출 문자열이 구현자 재량이 됐다.
검색어 8개는 표로 못박았으면서 정작 사용자 눈에 보이는 칩 라벨은 비어 있었다. rev3에서 16개를 확정한다.

| category | i18n 키 | ko 값 | en 값 |
|---|---|---|---|
| wristWrap | `gear.cat.wristWrap` | `리스트랩` | `Wrist wraps` |
| strap | `gear.cat.strap` | `스트랩` | `Lifting straps` |
| belt | `gear.cat.belt` | `리프팅벨트` | `Lifting belt` |
| kneeSleeve | `gear.cat.kneeSleeve` | `니슬리브` | `Knee sleeves` |
| gloves | `gear.cat.gloves` | `헬스장갑` | `Gloves` |
| shoes | `gear.cat.shoes` | `리프팅화` | `Lifting shoes` |
| chalk | `gear.cat.chalk` | `초크` | `Chalk` |
| armSleeve | `gear.cat.armSleeve` | `암슬리브` | `Arm sleeves` |

- **라벨↔검색어 톤 일치가 요건이다.** 각 ko 라벨은 대응 검색어의 핵심 토큰과 일치한다(`헬스장갑`↔`헬스 장갑`, `니슬리브`↔`무릎보호대 니슬리브` …).
  라벨을 `글러브`로 뽑아 놓고 검색어가 `헬스 장갑`이면 사용자가 탭했을 때 기대와 다른 결과 화면을 본다 — 운영정책 4.1 6) 관련성 조항의 인지적 대응물이다.
- 삽입 위치: ko.ts·en.ts 모두 `"feed.importRoutineOpen"` 다음, `"group.create"` 앞(기존 알파벳 정렬 관례). 따옴표 스타일은 파일 관례대로 `"키": "값",`.
- 라벨 문구 자체는 **이 표가 권위**다. 테스트는 문구를 스냅샷으로 잠그지 않는다(§기각 목록 7).

### 링크 조립 — 임의 파라미터 부착 금지

**불변식: 어떤 경우에도 쿠팡 URL에 임의 쿼리 파라미터를 덧붙이지 않는다.**

- 검색 URL(모듈 내부 `coupangSearchUrl`): `` `https://www.coupang.com/np/search?q=${encodeURIComponent(gearSearchQuery(c))}` ``
  — 쿼리 키는 **정확히 `q` 하나**. 순수 문자열 결합으로 만든다(URL 파서 미사용). `gymMapsUrl()`(services/gymSearch.ts:139) 순수 함수 선례를 따른다.
- 제휴 링크: `cfg.links[c]`에 담긴 **사전 생성 딥링크를 문자 단위로 그대로 반환**한다. 파싱·재조립·파라미터 추가 어떤 가공도 하지 않는다.
- **불변식(rev3 · 정리 B)**: `cfg?.enabled !== true` 이면 `links`는 **전면 무시**한다. 비활성 상태에서 반환되는 URL은 언제나 추적 식별자 0개의 순수 검색 URL이다.
- 허용 호스트 밖이거나 형태가 이상하면 **검색 URL로 폴백**하되, 결과에 `kind:'search'`가 실려 폴백이 조용하지 않게 한다(§`kind` 판별 필드).

rev1의 `&lptag={tag}` 방식은 **폐기**한다. 근거는 이 프로젝트 자신의 조사 보고서
(`.ouroboros/docs/research/20260720_coupang-partners-policy_research.md`)다.

- §3 — 공식 링크 생성 경로는 (a) 웹 링크 생성기/간편링크, (b) Deeplink API 두 가지뿐이고 파라미터 규격은 비공개다.
- §3·§4 — 운영정책 4.1 1) 기술적 금지 행위: *"자사가 전송하는 광고의 링크, 형태, 갱신주기 및 이에 포함된 정보에 대한 별도의 조작 행위"* 금지. 제재 등급 **A**(1회 최근 14일 수익금 몰수 / 2회 계정 해지 + 연관 계정 확산).
- 부록 확인불가표 — *"수동 `lptag` 파라미터 부착 허용 여부: **확인 불가 / 불허 추정**"*.
- `lptag`라는 파라미터명은 어느 1차 출처에도 없다. 파트너스의 추적 단위는 딥링크 URL이고 채널 구분은 Deeplink API의 `subId` 인자(사전 등록 10개 한도, 미등록 값은 정산 제외 — 보고서 B6)다.

rev1의 방어("최종승인 시점에 재확인 / Phase 0에서는 실행되지 않으므로 오류가 노출되지 않는다")는 성립하지 않는다 —
ADR-027 D2·SAD-020이 *"파트너스 승인 후 코드 변경 없이 서버 env 주입만으로 활성화되며 앱 재배포가 필요 없다"*를
명시적 약속으로 못박았으므로, **재확인 시점에 코드를 고칠 기회가 설계상 없다**. 실패는 조용하다(수수료 0원인데 고지 라벨만 노출)
또는 치명적이다(링크 조작 판정 = A등급). 또한 문자열 태그 하나로는 보고서가 *"선택이 아니라 필수"*로 결론낸
Phase 0-b 전환 경로(A3 = 카테고리별 수동 딥링크 주입)에 값을 넣을 자리가 아예 없다.

### 허용 호스트 판정 — 정확 일치 · 엔진 비의존 (rev3 신설)

rev2는 "허용 호스트: link.coupang.com · www.coupang.com · coupang.com, https: 한정"까지만 적고
**비교 방식**을 비워 두었다. autorun 구현자가 자연스럽게 택할 `hostname.endsWith('coupang.com')`은
`evilcoupang.com`·`notcoupang.com`을 통과시키고, `href.includes('coupang.com')`이면 `https://attacker.io/?r=coupang.com`까지 통과한다.
방어 목적은 명시했는데 방어 강도를 명시하지 않은 상태였다.

또한 판정을 `new URL()`에 맡기면 **Node 테스트가 프로덕션 동작을 증명하지 못한다.**
이 리포는 `app/src` 전체에서 `new URL`을 한 번도 쓰지 않고 URL 폴리필 패키지도 없다.
기기의 전역 `URL`은 RN 0.85의 정규식 기반 구현(`Libraries/Blob/URL.js`, `setUpXHR.js`가 `polyfillGlobal('URL', …)`로 무조건 덮어씀)이라
Node의 WHATWG URL과 의미가 다르다 — 잘못된 입력에 throw하지 않고, `hostname`/`protocol`을 정규화 없이 정규식 매칭 결과 그대로 돌려준다.
**안전이 걸린 판정을 엔진 차이가 있는 API로 구현하게 두면 안 된다.**

`isAllowedAffiliateUrl(u: unknown): u is string` 은 **URL 파싱을 쓰지 않고** 순수 문자열 연산으로만 판정한다:

```
1. typeof u === 'string' 이 아니면            → false      (숫자·객체·null·배열 방어)
2. u.length === 0 또는 u.length > 2048 이면   → false
3. /[\u0000-\u0020\u007F]/.test(u) || /\s/.test(u)  → false      (공백·제어문자 포함 URL 거부)
4. u.includes('@') || u.includes('\\') 이면   → false      (userinfo 스푸핑 · 백슬래시 트릭)
5. head = u.slice(0, 8).toLowerCase();  head !== 'https://' → false
6. rest = u.slice(8);  i = rest.indexOf('/');  i < 0 → false   (경로 없는 authority-only 거부)
   host = rest.slice(0, i).toLowerCase()
7. ALLOWED_AFFILIATE_HOSTS.includes(host) 이면 true, 아니면 false
   ALLOWED_AFFILIATE_HOSTS = Object.freeze(['link.coupang.com','www.coupang.com','coupang.com'])
8. 경로·쿼리·프래그먼트는 검사하지 않는다 — 무가공 원칙(§링크 조립)
```

- **정확 일치만 허용한다.** `endsWith`·`indexOf`·`includes(부분문자열)`·정규식 부분 매칭 **금지**(금지 항목으로 명문화).
  7단계의 `includes`는 배열 원소 `===` 비교이지 문자열 부분 매칭이 아니다.
- 대소문자는 **비교 시점에만** `toLowerCase()`로 정규화한다(순수 문자열 연산 → 엔진 비의존성 유지). 반환 URL은 원문 그대로다.
- **트레일링 도트는 정규화하지 않는다** — `coupang.com.`은 정확 일치에 실패해 거부된다(§기각 목록 2).
- 포트(`link.coupang.com:8443`)는 host에 `:`가 포함되어 정확 일치에 실패 → 거부.
- 판정에 실패해도 예외를 던지지 않고 `false`만 반환한다(§cfg 입력 계약).

기대 판정표(T17이 전건 고정):

| 입력 | 판정 | 이유 |
|---|---|---|
| `https://link.coupang.com/a/abc` | 허용 | 정확 일치 |
| `https://www.coupang.com/np/search?q=%EB%B2%A8%ED%8A%B8` | 허용 | 정확 일치 |
| `HTTPS://LINK.COUPANG.COM/a/abc` | 허용 | 스킴·호스트 비교 시 소문자 정규화 |
| `https://evilcoupang.com/a/x` | 거부 | 정확 일치 실패(suffix 매칭 금지의 증인) |
| `https://link.coupang.com.attacker.io/a/x` | 거부 | 정확 일치 실패 |
| `https://link.coupang.com@evil.com/a/x` | 거부 | `@` 포함 |
| `https://link.coupang.com` | 거부 | 경로 없음 |
| `https://link.coupang.com:8443/a/x` | 거부 | host에 포트 |
| `https://coupang.com./a/x` | 거부 | 트레일링 도트 미정규화 |
| `http://link.coupang.com/a/x` | 거부 | https 아님 |
| `//link.coupang.com/a/x` | 거부 | 스킴 없음 |
| `javascript:alert(1)` | 거부 | 스킴 불일치 |
| `  https://link.coupang.com/a/x` | 거부 | 선행 공백(3단계) |
| `https://link.coupang.com/a/x\nX` | 거부 | 제어문자 |
| `'not a url'` · `123` · `null` · `{}` | 거부 | 3~5단계 / 1단계 |

### 고지 게이트 — URL 획득 경로를 하나로 고정

SAD-020 보안·정책 제약은 *"라벨 렌더 없이 링크를 여는 경로가 **코드상 존재하지 않도록** 판정 함수를
링크 열기 앞에 배치하고 테스트로 고정한다"*(ADR-027 D6)를 요구한다. rev1처럼 URL 빌더와 판정 함수를
독립 export 하면 `Linking.openURL(coupangSearchUrl(c))` 한 줄로 게이트를 우회할 수 있고,
UI 계층에는 자동 테스트가 아예 없으므로 그 우회는 영구히 검출되지 않는다.

따라서 **URL을 얻는 유일한 공개 경로가 고지 렌더 사실을 인자로 요구**하게 만든다.

```
resolveGearLink(c, cfg, ctx)
  0. 계약: 어떤 입력에도 예외를 던지지 않는다(§cfg 입력 계약)

  1. !isGearCategory(c)                                → { ok:false, blocked:'unknown-category' }

  2. requiresAffiliateDisclosure(cfg) && ctx?.disclosureRendered !== true
                                                       → { ok:false, blocked:'disclosure-missing' }
     // requiresAffiliateDisclosure = enabled===true  OR  허용호스트 딥링크 1개 이상 존재

  3. cfg?.enabled === true
     && (raw = cfg.links?.[c], isAllowedAffiliateUrl(raw))
                                                       → { ok:true, kind:'deeplink', url: raw }   // 문자 단위 그대로
     //  ↑ enabled 조건이 정리 B를 보증한다. 비활성이면 links가 있어도 4단계로 낙하한다.

  4. 그 외                                              → { ok:true, kind:'search', url: coupangSearchUrl(c) }
```

**rev2가 뚫려 있던 지점(리뷰어 3명 동일 지목 · CRITICAL)**: rev2의 3단계는 `cfg?.links?.[c]`만 보고 `enabled`를 검사하지 않았고,
2단계는 `enabled===true`일 때만 발동했다. 따라서 `{ enabled:false, links:{ belt:'https://link.coupang.com/a/abc' } }`가
2단계를 무사통과하고 3단계가 제휴 추적 딥링크를 **고지 라벨 0개로** 반환했다.
이 조합은 가정이 아니라 **가장 있을 법한 롤아웃 배치**다 — 딥링크를 미리 만들어 env에 넣어 두고 최종승인 후 스위치만 켜는 순서,
또는 `GEAR_AFFILIATE_ENABLED` 미설정·`'false'` 문자열·파싱 실패로 `enabled`가 false로 떨어지는 흔한 사고.
ADR-027 D2·SAD-020이 "코드 변경 없이 서버 env 주입만으로 활성화"를 약속했으므로 이 상태는 **배포 없이 즉시 프로덕션에 나간다**.
결과는 조사 보고서 §6이 *"최종승인 반려 사유 1순위"*로 지목한 경제적 이해관계 미표시이며, 구판 가이드 위반 사례의 제재는 *"서비스 해지 및 수익금 지급 중단"*이다.
더 나쁜 것은 rev2의 T16이 *"`links`가 있어도 `enabled:false`면 고지 불필요"*를 **정답으로 잠가** 회귀 테스트가 위반을 보증했다는 점이다.
rev3은 이중 방어(2단계 OR 확장 + 3단계 `enabled` 요구)로 봉쇄하고 T15·T16에서 해당 케이스를 뒤집는다.

**URL 조각 비공개**: `gearSearchQuery`·`coupangSearchUrl`·`isAllowedAffiliateUrl`·`GEAR_SEARCH_QUERY`를 모두 모듈 내부에 두고
`gear.ts`에서도 배럴에서도 export 하지 않는다. rev2는 `coupangSearchUrl`만 내리고 `gearSearchQuery`를 공개로 남겨 두었는데,
`Linking.openURL('https://www.coupang.com/np/search?q=' + encodeURIComponent(gearSearchQuery(c)))` 한 줄이면
내부 빌더와 **문자까지 동일한** URL을 게이트 없이 만들 수 있어 은닉의 실효가 절반만 남았다.
Phase 0 소비자(SRS-038 피커·040 칩·041 sanitizer·042 화면) 중 이 함수를 필요로 하는 곳도 없다.
따라서 **검색어·URL을 만드는 어떤 조각도 공개하지 않는다**를 계약으로 못박는다. 테스트도 `resolveGearLink` 경유로만 검증한다.

**소비자 계약(SRS-040)**
- `ok:false`면 `Linking.openURL`을 호출하지 않는다. `resolveGearLink` 외의 경로로 URL을 만들지 않는다.
- `ctx.disclosureRendered`는 **실제 렌더 사실**에서만 파생한다 — 고지 라벨 JSX를 감싸는 바로 그 조건식(또는 라벨 컴포넌트가 mount 시 set 하는 ref/state) 이외의 값을 넘기는 것을 금지한다.
- **금지 패턴(명시)**:
  ```tsx
  // 금지 — 게이트가 항진명제가 된다
  const needs = requiresAffiliateDisclosure(cfg);
  onPress={() => resolveGearLink(c, cfg, { disclosureRendered: needs })}
  ```
  ```tsx
  // 허용 — 렌더 조건 그 자체를 넘긴다
  const showDisclosure = requiresAffiliateDisclosure(cfg);
  return (<>
    {showDisclosure && <Text>{AFFILIATE_DISCLOSURE_KO}</Text>}
    <GearChip onPress={() => resolveGearLink(c, cfg, { disclosureRendered: showDisclosure })} />
  </>);
  ```
  두 코드는 형태가 비슷하지만 **라벨 JSX가 실제로 렌더되는 동일 조건식을 공유하느냐**가 다르다. 전자는 라벨 JSX를 지워도 링크가 열리고, 후자는 같이 꺼진다.
- 이 금지 패턴은 **SRS-040 코드 리뷰 필수 체크 항목**으로 승격한다(§상위 아티팩트 개정 필요).

**잔여 리스크(rev3 확장)**
1. `disclosureRendered`에 UI가 **거짓**을 넘기는 것은 타입이 막지 못한다. 다만 이는 누락(무의식적 사고)이 의도적 거짓으로 격상되는 것이고, 도메인 테스트가 계약을 고정한다.
2. **더 현실적인 구멍** — 소비자가 `requiresAffiliateDisclosure(cfg)`의 반환값을 그대로 `disclosureRendered`에 되먹이면 `blocked:'disclosure-missing'`이 **구조적으로 절대 발생하지 않는 항진명제**가 된다. 악의가 아니라 성실한 구현이 게이트를 무력화하며, 라벨 JSX를 실수로 지우거나 접힘 상태에서 렌더되지 않아도 링크는 그대로 열린다. 도메인 테스트는 "무엇을 인자로 넘겨야 하는가"를 고정하지 못하므로 **이 부분은 SAD-020의 '코드상 존재하지 않게' 요구를 완전히 충족하지 못한 잔여분**이다. 방어는 위 소비자 계약 문서화 + SRS-040 코드 리뷰 체크뿐이며, 이 한계를 은폐하지 않고 기록한다.
3. 딥링크가 만료·오기여도 검색 URL로 조용히 폴백된다 → `kind` 필드와 활성화 체크리스트로 관측 가능하게 만들었으나(아래), 관측 **주체**는 호출자다.

### `kind` 판별 필드 — 조용한 폴백을 관측 가능하게 (rev3 신설)

rev2의 성공 분기는 `{ok:true; url:string}` 하나뿐이라 호출자가 자신이 제휴 딥링크로 나갔는지 순수 검색으로 나갔는지 알 수 없었다.
파트너스 승인 후 운영자가 딥링크 코드를 한 글자만 잘못 넣어도 8종 전부가 조용히 검색 URL로 폴백해 **수수료가 영구히 0원**이 되는데,
`enabled:true`라 고지 라벨은 정상 노출된다 — spec이 §링크 조립에서 스스로 경계한 *"수수료 0원인데 고지 라벨만 노출"* 상태의 재현이다.

- 성공 분기를 `{ ok:true; kind:'deeplink'|'search'; url:string }`로 확장한다. 3단계 = `'deeplink'`, 4단계 = `'search'`.
- 이 필드는 rev1 사이클에서 기각된 `normalizeGearTagsDetailed`(별도 API 신설)와 성격이 다르다 — 기존 반환 객체에 판별 필드 1개를 얹는 것이고, **호출부가 확정되기 전인 지금이 유일하게 싼 시점**이다.
- SRS-039 클릭 집계에 `kind`를 함께 적재하면 Phase 0-b 전환(카테고리별 수동 딥링크 주입) 진척과 폴백률을 측정할 수 있다.
- 도메인 모듈 자체에는 로깅·텔레메트리를 넣지 않는다(순수성 유지 — §기각 목록 6).

### `cfg` 입력 계약 — 불투명 JSON 취급 · 무예외 (rev3 신설)

`cfg`는 SRS-039 응답을 `as GearAffiliateConfig`로 캐스팅해 들어오는 **불투명 JSON**이며, `data.gear[]`와 정확히 같은 신뢰 수준이다.
rev2는 "제휴 설정은 인자로만 받는다"고만 적고 그 값의 **형태 검증**을 어디에도 두지 않았으며, 무예외 계약도 `normalizeGearTags`에만 걸려 있었다.

- **`resolveGearLink`·`requiresAffiliateDisclosure`도 예외를 절대 던지지 않는다.** `cfg`의 어떤 형태 이상도 검색 URL 폴백(또는 `false`)으로 수렴한다.
- `cfg`가 `null`·`undefined`·배열·문자열·숫자·불리언이어도 안전하다. `enabled`는 `=== true` 엄격 비교로만 읽는다(`'yes'`·`1`·`'true'`는 전부 비활성).
- `links` 읽기는 다음 순서로만 한다:
  ```
  const links = (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) ? (cfg as any).links : undefined;
  const bag  = (links && typeof links === 'object' && !Array.isArray(links)) ? links : undefined;
  const raw  = bag ? bag[c] : undefined;          // c 는 isGearCategory 통과값에 한정
  // 이후 isAllowedAffiliateUrl(raw) 가 typeof 검사를 포함해 판정
  ```
- `raw`가 숫자·객체·`null`·배열이어도 `isAllowedAffiliateUrl` 1단계가 `false`를 돌려주므로 폴백이다.
  **rev2 상태에서 이 값이 비문자열이면 기기에서 크래시했다** — Node에서는 `new URL(123)`이 TypeError를 던져 try/catch 폴백으로 초록이지만,
  기기의 RN 폴리필 URL은 생성자가 `this._url.includes('#')`를 호출하다 TypeError를 던져 **장비 칩 탭이 그대로 크래시**한다.
  rev3은 URL 파싱 자체를 쓰지 않으므로 이 경로가 원천 소멸한다.
- `hasAnyAffiliateLink(cfg)`는 **`Object.keys(links)`를 순회하지 않는다.** `GEAR_CATEGORIES` 8종만 순회해 `isAllowedAffiliateUrl(bag[k])`가
  하나라도 true인지 본다(거대 객체·프로토타입 오염 키 순회 차단).

### 고지 판정 트리거 = 활성 **또는** 딥링크 존재 (rev3 개정)

```ts
requiresAffiliateDisclosure(cfg) === (cfg?.enabled === true) || hasAnyAffiliateLink(cfg)
```

**불변식: 허용 호스트 딥링크가 하나라도 존재하면 `enabled` 값과 무관하게 고지가 필요하다.**

- rev2는 트리거를 `partnerTag 존재 → enabled`로 **옮기면서** "링크 존재"라는 신호를 판정에서 완전히 제거했다. 두 신호는 **OR여야지 대체 관계가 아니다.**
  `enabled`는 우리 쪽 내부 플래그일 뿐이고, 대가 발생 가능성은 쿠팡이 발급한 딥링크가 살아 있는지가 결정한다.
- 공정위 심사지침(2024-12-01 시행) — *"경제적 대가를 **미래·조건부**로 받는 경우에도 공개의무가 있다"*, *"조건부·불확정적 표현은 명확한 경제적 이해관계의 표시에 해당하지 않는다"*.
- 쿠팡 이용약관 제11조 4항 — *"상품 추천의 내용이 포함된 게시물을 게재할 경우"* 공개 의무. 가이드 — *"명확하게 **모든 게시물에** 대가성 문구를 게재"*.
- 즉 트리거는 "이 링크에 추적값이 붙었는가"가 아니라 "우리가 파트너스 매체로서 대가를 받을 수 있는 상태인가"다.
- **링크가 하나도 준비되지 않아도 `enabled=true`면 고지한다**(방향 1) **그리고 `enabled=false`여도 딥링크가 있으면 고지한다**(방향 2 — rev3 추가). rev2는 방향 1만 막았다.
- 고지가 필요한데 렌더되지 않았으면 `blocked:'disclosure-missing'`으로 **링크 자체를 막는다** — 딥링크든 검색 URL이든 열리지 않는다(2단계가 3·4단계보다 앞).

**전수 진리표 (T15·T16이 전건 고정 — 이 표가 계약의 권위)**

`DEEP = 'https://link.coupang.com/a/abc'`, `BAD = 'https://evil.com/x'`

| cfg | `requiresAffiliateDisclosure` | `disclosureRendered:false` | `disclosureRendered:true` |
|---|---|---|---|
| `undefined` / `null` | false | ok · `search` | ok · `search` |
| `{}` | false | ok · `search` | ok · `search` |
| `{enabled:false}` | false | ok · `search` | ok · `search` |
| `{enabled:'yes'}` | false | ok · `search` | ok · `search` |
| `{enabled:true}` | **true** | **blocked** `disclosure-missing` | ok · `search` |
| `{enabled:true, links:{}}` | **true** | **blocked** | ok · `search` |
| `{enabled:true, links:{belt:BAD}}` | **true** | **blocked** | ok · `search` (폴백) |
| `{enabled:true, links:{belt:123}}` | **true** | **blocked** | ok · `search` (폴백·무예외) |
| **`{enabled:false, links:{belt:DEEP}}`** | **true** ← rev3 정정 | **blocked** ← rev2는 딥링크를 열었음 | ok · **`search`** ← 딥링크 아님(정리 B) |
| `{enabled:false, links:{belt:BAD}}` | false | ok · `search` | ok · `search` |
| **`{enabled:true, links:{belt:DEEP}}`** | **true** | **blocked** | ok · **`deeplink`** · `url === DEEP` (문자 동일) |
| `cfg`가 `[]` · `'x'` · `0` · `true` | false | ok · `search` · 무예외 | ok · `search` · 무예외 |

표에서 `kind:'deeplink'`가 나오는 칸은 **정확히 한 칸**이다 — 정리 A의 기계적 증인이다.

### §links 정책 — D5(브랜드·모델 미특정)는 링크 목적지에도 적용된다 (rev3 신설)

파트너스 링크 생성기가 만드는 `link.coupang.com/a/…`는 **단축 URL이라 목적지가 URL 문자열에 드러나지 않는다.**
검색 결과 딥링크인지 특정 상품 상세(`/vp/products/{id}`) 딥링크인지 **코드로 구분할 방법이 원리적으로 없다**(조사 보고서 §3의 DeepLinkBody는 두 형태를 모두 지원).
rev2는 §note 정책에서 브랜드 특정 우회를 정성껏 차단해 놓고, 훨씬 직접적인 **링크 목적지** 경로는 비워 두었다.

실패 시나리오: Phase 0-b에서 운영자가 *"전환율 높은 특정 상품으로 보내는 게 낫다"*는 지극히 자연스러운 판단으로
`belt` 딥링크에 특정 브랜드 벨트 상품 상세 딥링크를 넣는다. 코드는 아무 경고 없이 통과시킨다. 그 순간
(a) "착용장비를 카테고리 수준으로만 표현한다"는 SRS-037 대전제와 ADR-027 D5(로고 오인식·브랜드 분쟁 회피)가 링크 계층에서 깨지고,
(b) 사용자 UGC(내 벨트 사진)에 플랫폼이 특정 브랜드 상품을 붙인 형태가 되어 운영정책 4.1 3) *"프로그램을 이용하여 인위적으로 특정 광고를 노출시키거나 노출을 유도하는 행위"*(A등급) 해석 위험이 생기며,
(c) 사용자가 실제 착용한 브랜드와 다른 브랜드로 보내면 표시광고법상 오인 유발이다. UGC 책임은 전부 회원사(우리)에게 있다(이용약관 제11조·제20조 4항).

**운영 규약(코드가 검증할 수 없으므로 사람의 절차가 유일한 방어선)**
1. `links`에 주입하는 딥링크는 **`https://www.coupang.com/np/search?q=…` 검색 결과 URL을 원본으로 생성한 것만** 허용한다(보고서 §3 — 검색 결과 URL의 딥링크화는 공식 지원).
2. **상품 상세(`/vp/products/…`)·기획전·골드박스 딥링크는 어떤 경우에도 주입하지 않는다.**
3. 주입 시 **원본 URL과 생성 딥링크를 쌍으로 기록**해 남기고, 원본의 `q` 값이 `GEAR_SEARCH_QUERY[category]`와 일치하는지 확인한다 — 운영정책 4.1 6) 관련성 가드레일을 딥링크 경로까지 연장하는 유일한 방법이다.
4. 이 제약의 근거를 `GearAffiliateConfig.links` 필드 주석에 남긴다(§공개 API 설계에 반영 완료).
5. SRS-039 구현자는 서버 env 스펙 작성 전에 이 소절을 반드시 읽는다.

### 고지 문구 소유권 — 도메인이 갖는 의도적 예외

`AFFILIATE_DISCLOSURE_KO` 상수를 `gear.ts`가 소유하고, **i18n 키를 만들지 않는다**(ko.ts·en.ts 어느 쪽에도 추가 금지).

- 파트너스 가이드 — *"경제적 이해관계는 추천·보증 내용과 **같은 언어**를 사용해 기재(한국어로 추천·보증을 하는 경우 동일하게 한국어로)"*.
- 구판 가이드 위반 사례에 *"**영문·줄임말로 기재**"*가 명시돼 있고 결과는 *"서비스 해지 및 수익금 지급 중단"*이다.
- 이 프로젝트의 관례(사용자 노출 문자열 = ko/en 쌍)를 그대로 따르면 en 로케일 사용자에게 한국어 쿠팡 추천 게시물이 **영문 고지**와 함께 렌더되어 위반 사례에 문자 그대로 해당한다.
- "도메인은 표시 문자열을 갖지 않는다"는 이 spec의 원칙에 대한 **의도적 예외**임을 코드 주석과 아래 주의사항 양쪽에 남긴다(나중에 리팩터링으로 i18n에 끌려 들어가지 않도록).
- **렌더 위치(rev3 구체화)**: SRS-040은 이 상수를 **게시물 카드의 첫 부분 — 작성자명 바로 아래, 캡션·이미지·장비 칩 영역보다 위**에 렌더한다. 본문보다 크거나 다른 색(ADR-027 D6).
  공정위 심사지침(2024-12-01)은 *"게시물의 제목 또는 첫 부분"* 표기를 요구하며 **끝부분 표기를 폐지**했다(보고서 §6).
  **장비 칩 영역 상단은 게시물 기준으로는 끝부분이므로 해당하지 않는다** — SAD-020의 *"접힘 여부와 무관하게 상단에 항상 노출"*이 "칩 영역의 상단"으로 오독되면 최종승인 반려 사유 1순위 항목에 그대로 걸린다.

### note 정책 — D5(브랜드·모델 미특정)의 예외가 아니다

`note`는 SRS-037 수용 기준 2("태그별 메모 길이 상한 강제")가 요구하는 필드라 타입에서 제거하지 않는다.
다만 소유자 부재를 방치하지 않기 위해 Phase 0 규약을 여기서 확정한다.

1. **입력 주체 없음** — SRS-038 GearTagPicker는 note를 입력받지 않는다. Phase 0에서 note는 항상 `undefined`이며, 정규화는 외부(조작된 클라이언트·손상 데이터)에서 들어온 값을 **보존·정제만** 한다.
2. **비렌더** — SRS-040 GearChips는 note를 렌더하지 않는다. 30자 상한은 길이 제한일 뿐 내용 제한이 아니라 브랜드·모델명이 충분히 들어가고, 그 문자열이 쿠팡 링크 칩 옆에 렌더되면 ADR-027 D5(로고 오인식 분쟁 회피)가 막으려던 표면이 그대로 복원된다. UGC의 법적 책임은 전부 회원사(우리)에게 있다(이용약관 제11조·제20조 4항).
3. **링크 무관** — note는 검색어·링크 조립 어디에도 반영되지 않는다(테스트로 고정 — 같은 카테고리는 note가 달라도 항상 동일 URL).
4. 렌더가 필요해지는 시점에 브랜드 억제 규칙(sanitize)·URL 링크화 금지·D5 관계를 함께 결정한다. **Phase 0에서는 도입하지 않는다** — 입력 경로가 없어 방어할 대상이 없고, 라틴 토큰 거부 류 규칙은 오탐이 크다.

## 작업 목록

- [ ] `app/src/domain/gear.ts` 신규 — 상수·타입·`isGearCategory`·`gearLabelKey`·`normalizeGearTags`·`requiresAffiliateDisclosure`·`resolveGearLink` + 내부 `GEAR_SEARCH_QUERY`·`ALLOWED_AFFILIATE_HOSTS`·`gearSearchQuery`·`coupangSearchUrl`·`isAllowedAffiliateUrl`·`hasAnyAffiliateLink`. 파일 헤더에 `// @plm SRS-037` 역링크
- [ ] `app/src/domain/index.ts` — `export * from './gear';` 추가 (알파벳 아닌 기존 나열 순서 관례 유지 → 말미 추가). 배럴 충돌 없음이 확인됨(`Gear*`·`GEAR_*`·`isGearCategory`·`normalizeGearTags`·`resolveGearLink`·`requiresAffiliateDisclosure`·`MAX_GEAR_*`·`AFFILIATE_DISCLOSURE_KO` 모두 app/src 전체에 기존 심볼 없음)
- [ ] `app/src/domain/__tests__/gear.test.ts` 신규 — node:test + assert/strict. §필수 테스트의 **20개 그룹 전건**. 모든 `test()` 이름은 `T{n} ` 접두로 시작
- [ ] `app/src/i18n/locales/ko.ts` — 플랫 키 **정확히 8개** 추가. 값은 §카테고리 라벨 문자열 확정 표의 **ko 열 그대로**. 삽입 위치는 `"feed.importRoutineOpen"` 다음 · `"group.create"` 앞
- [ ] `app/src/i18n/locales/en.ts` — 동일 8키 쌍 추가(`Record<TransKey, string>`이라 누락 시 typecheck 실패). 값은 표의 **en 열 그대로**. 동일 삽입 위치. **고지 문구 키는 추가하지 않는다**

## 정규화 규칙 (normalizeGearTags)

입력은 서버 `Post.data`에서 오는 **불투명 JSON**이라 어떤 형태든 올 수 있다(`@IsObject()`만 검증).
SAD-020이 *"정규화가 사실상 유일한 방어선"*이라 못박은 계층이므로, 여기서 던지면 방어선이 아니라 장애 증폭기가 된다.

**적용 순서 4단계(구현 재량 없음)**: `① 스캔 절단 → ② 원소 필터·정제 → ③ 중복 병합 → ④ 개수 상한`

0. **출력은 항상 `{ category, source }`(+조건부 `note`) 리터럴로 새로 구성한다.** 입력 객체를 반환하거나 스프레드하지 않는다 — 그 외 모든 키(`brand`·`url`·거대 문자열·데이터 키로 실린 `__proto__` 등)는 폐기된다. 입력 배열·입력 객체를 변형하지 않는다.
   - **허용 구현 형태(rev3 명시)**: `note !== undefined ? { category, source, note } : { category, source }` 2분기 리터럴,
     또는 `{ category, source, ...(note !== undefined ? { note } : {}) }`.
     순진한 `const t: GearTag = {category, source}; t.note = note;`는 `readonly note?` 위반으로 **typecheck가 깨진다**(프로덕션 코드라 완료 조건 직결).
     구현자가 이를 `as any`/`as GearTag`로 우회하면 규칙 0의 방어가 그 지점에서 증발하므로 형태를 여기서 못박는다.
     "입력 객체 스프레드 금지"는 유지하되 **자기가 만든 note 객체의 조건부 스프레드는 허용**이다(둘을 구분해 읽을 것).
1. `input`이 배열이 아니면 → `[]`. 배열이면 **앞 `MAX_GEAR_INPUT_SCAN`개만 스캔**한다.
   - 스캔 창 밖의 원소는 **조용히 폐기**한다(에러 아님). 정상 경로에서는 8건 이하이므로 도달 불가.
   - 이 컷은 손상·조작 입력의 **순회 비용 상한**이지 데이터 보존 규칙이 아니다. 조작된 페이로드가 앞에 쓰레기 200건을 채우고 뒤에 진짜 태그를 두면 결과가 빈 배열이 된다(정상 데이터에서는 발생 불가).
   - 스캔 절단은 **화이트리스트 필터·병합보다 먼저** 일어난다. 이 순서는 결과에 영향을 준다(200번째 이후의 user 태그가 사라져 auto가 승자가 되는 등) — 단순 성능 최적화가 아니라 **의미론**이므로 T19가 관측 가능한 형태로 고정한다.
2. 원소가 `typeof el === 'object' && el !== null && !Array.isArray(el)` 을 만족하지 않으면 → 폐기. (`typeof null === 'object'`라 "객체가 아니면 폐기"를 문자 그대로 구현하면 다음 줄 `el.category` 접근에서 TypeError가 난다 — 피드 전체 렌더가 날아간다.)
3. `category`가 `isGearCategory`를 통과하지 못하면 → 폐기.
4. `source`가 `'user'|'auto'`가 아니면(없음·오타·null·비문자열) → `'user'`로 수렴. **유효하면 임의 변경 금지**(D7).
5. `note`가 문자열이 아니면 → 키 제거. 문자열이면
   ① **제어문자·라인 구분자를 공백으로 치환한 뒤 연속 공백을 접는다** — 정확한 구현을 고정한다:
   ```js
   s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\uFEFF]/g, ' ').replace(/\s+/g, ' ')
   ```
   (C0 전체 + DEL·C1 + U+2028/2029 라인·문단 구분자 + U+FEFF. JS `\s`가 NBSP·U+2000~200A·U+3000 등을 이미 포함하므로 2단계로 충분하다.
   `/[\n\r]/g`만 치환하는 순진한 구현은 `\u0000`·`\b`(U+0008)·U+2028을 통과시켜 이후 note 렌더·CSV 내보내기 시점으로 문제를 이월한다.)
   → ② `trim` → ③ **코드포인트 단위** 절단 `Array.from(s).slice(0, MAX_GEAR_NOTE_LEN).join('')` → ④ 다시 `trim` → ⑤ 결과가 빈 문자열이면 **키 자체 제거**.
   - UTF-16 코드유닛 `slice(0,30)`이면 이모지 서로게이트 페어가 경계에서 반쪽만 남고, 그 lone surrogate가 `data.gear[].note`로 직렬화되어 Postgres `jsonb`에 거부되면 게시 요청이 500으로 떨어진다. 삼켜져 저장되더라도 렌더 시 U+FFFD로 깨진다.
   - ④의 재trim이 없으면 공백 경계 절단 시 후행 공백이 남아 **멱등성이 깨진다**(같은 함수를 쓰기·읽기 양쪽에서 재사용하므로 필수 불변식).
6. 같은 `category`가 중복되면 → **순서 무관 우선순위 병합**.
   (a) `source==='user'`가 `'auto'`를 항상 이긴다 (ADR-027 D7 — auto가 user를 덮지 않는다)
   (b) 같은 source끼리는 먼저 온 것을 남긴다
   (c) 이긴 쪽에 `note`가 없고 진 쪽에 있으면 `note`를 승계한다(이름값 하는 "병합"). **병합 결과도 반드시 규칙 0의 형태로 새 리터럴을 재구성**한다(기존 객체 변형 금지 — `readonly` 위반).
   (d) 출력 위치는 해당 category의 **최초 등장 순서**를 따른다
   - **(a)의 source 비교는 규칙 4 수렴 이후 값으로 한다(rev3 명시)** — 즉 무효·부재 source는 `'user'`로 간주되어 정당한 `'auto'`를 이긴다.
     `[{belt,auto},{belt,source:null,note:'메모'}]` → `{belt, source:'user', note:'메모'}`.
     손상된 원소가 멀쩡한 auto를 이기는 셈이지만, *"알 수 없는 출처는 사용자 소유로 간주"*가 D7 취지에 부합하는 보수적 선택이다. 사고가 아니라 결정임을 여기 남긴다(T10이 고정).
   - rev1의 "선순위 유지(먼저 온 것)"는 순수 위치 기반이라, Phase 1에서 자동 감지 결과를 앞에 붙이는 파이프라인(`[{belt,auto},{belt,user,note}]`)이면 사용자가 직접 고른 태그와 메모가 조용히 사라진다. SAD-020 미해결·후속이 *"source:'auto'가 기존 source:'user' 태그를 덮어쓰지 않는 병합 규칙을 domain/gear에 추가한다"*고 예고한 규칙을 지금 반대로 테스트에 잠그면 안 된다.
7. 위 전부가 끝난 뒤 배열이 `MAX_GEAR_TAGS`를 초과하면 → **앞의 `MAX_GEAR_TAGS`개만 남긴다(`slice(0, MAX_GEAR_TAGS)`)**.
   - **정직한 재서술(rev3)**: `MAX_GEAR_TAGS = GEAR_CATEGORIES.length`이고 화이트리스트 8종 + 중복 병합을 거치므로 **출력 길이가 8을 넘는 입력은 만들 수 없다.
     이 상한은 현재 도달 불가능한 방어선이며, 카테고리가 늘고 상한이 별도 값으로 고정되는 미래를 대비한 규칙이다.**
     (rev2가 근거로 적었던 *"먼저 자르면 `[belt×6, strap, shoes]`가 3개가 아니라 1개가 된다"*는 `MAX=6`일 때만 성립하는 stale한 문장이라 삭제했다.
     이 입력은 원소가 정확히 8개라 `MAX=8`에서는 `slice(0,8)`이 아무것도 자르지 않는다 — 상한을 앞에 적용하든 뒤에 적용하든 결과가 같아
     rev2의 T12 케이스는 순서 불변식을 **전혀 구분하지 못하는 무해통과 테스트**였다. 그 케이스는 T10(중복 병합)으로 이관했고, 그 자리에서는 여전히 유효하다.)
   - 그럼에도 **적용 순서는 지킨다** — 상한은 반드시 화이트리스트 필터·중복 병합이 끝난 뒤 마지막에 적용한다(미래의 상한 분리 시 즉시 유효해지도록).
   - 검증 공백을 은폐하지 않는다: SRS-037 수용 기준 2의 "개수 상한 강제"는 **도달 불가라 직접 증명할 수 없으며, T12의 경계 보존(8종 전량 무손실)으로 대체 검증**한다(§완료 조건 대응표에 명시).

**계약**
- **입력이 JSON 유래 순수 데이터(`JSON.parse` 산출물 또는 SRS-038 피커 리터럴)인 한 예외를 던지지 않는다.** 원소 단위 처리 실패는 전부 "폐기"로 수렴한다.
  (스스로 던지는 접근자·Proxy는 계약 범위 밖이다. 실제 입력원에는 존재하지 않으므로 **원소별 `try/catch` 남발은 금지** — 과방어가 폐기 사유를 삼켜 디버깅을 어렵게 만든다.)
- 출력은 입력의 **최초 등장 순서**를 보존한다.
- **멱등**이다 — `normalizeGearTags(normalizeGearTags(x))`와 `normalizeGearTags(x)`가 deep equal.

## 필수 테스트 (gear.test.ts — 20그룹 전건, 누락 시 미완료)

작업 목록이 "테스트 파일 신규" 한 줄뿐이면 autorun 무인 실행에서 회귀 집합이 구현자 재량이 된다.
이 모듈이 정책성 규칙의 **유일한** 자동 회귀 계층이므로 내용을 여기서 못박는다.

**파일 관례**
- 헤더 주석: `// 착용장비 도메인 순수 테스트 (SRS-037) — npm test. RN 불필요.` (gyms.test.ts·streak.test.ts·domain.test.ts 3파일이 모두 이 형식)
- `describe` 블록은 이 리포에 선례가 없다. **top-level `test()`만 사용**한다.
- **모든 `test()` 이름은 `T{n} ` 접두로 시작**한다 — 예: `test('T7 화이트리스트: Belt·__proto__·미지 문자열 폐기', …)`.
  러너는 그룹 개념을 모르고 리포 관례상 테스트명이 한국어 서술형이라, 접두 없이는 "T1~T20 전 그룹 포함"을 기계적으로 확인할 수단이 없다(`npm test 2>&1 | grep -oE 'T[0-9]+ ' | sort -u | wc -l`로 확인 가능해진다).
- 상수 선언: `const DEEP = 'https://link.coupang.com/a/abc';` `const BAD = 'https://evil.com/x';`
- **검증 대상 함수는 URL 파싱을 쓰지 않지만, 테스트 내부에서 `new URL`을 쓰는 것은 무방하다**(Node 전용 검증 도구).

| # | 그룹 | 고정 내용 |
|---|------|----------|
| T1 | 카테고리 상수 | 길이 8 · 값·순서 정확 일치 · 중복 없음 · `Object.isFrozen` · `MAX_GEAR_TAGS === GEAR_CATEGORIES.length` · `MAX_GEAR_NOTE_LEN === 30` · `MAX_GEAR_INPUT_SCAN === 200` |
| T2 | `isGearCategory` | 양성 8종 / 음성 `'Belt'`·`'belt '`·`''`·`'__proto__'`·`'constructor'`·`'toString'`·`null`·`undefined`·`3`·`{}`·`Symbol.iterator` 전부 false |
| T3 | `gearLabelKey` | 8종 전수 스냅샷(`gear.cat.{c}`) |
| T4 | i18n 파리티·값 | `import { ko } from '../../i18n/locales/ko'` · `en` 동일. 전수 루프로 ① `gearLabelKey(c) in ko` · `in en` ② `typeof ko[k] === 'string' && ko[k].trim().length > 0`(en 동일 — 빈 문자열·공백 라벨 차단) ③ **언어 오배치 방어**: `/[가-힣]/.test(ko[k]) === true` · `/[가-힣]/.test(en[k]) === false`(ko/en 스왑·미번역 검출). 문구 자체는 스냅샷하지 않는다(§기각 목록 7). ko/en은 RN 비의존 순수 객체이고 domain.test.ts가 `data/seed`를 import 하는 선례가 있어 러너 제약에 걸리지 않는다 |
| T5 | 비배열 입력 | `null`·`undefined`·`''`·`0`·`{}`·`'belt'`·`true` → `[]` (무예외) |
| T6 | 이형 원소 | `[null, undefined, [], [['belt']], 'belt', 42, false, NaN, () => {}, {category:'belt',source:'user'}]` → 길이 1, 무예외 |
| T7 | 화이트리스트 | `'Belt'`·`'__proto__'`·`'toString'`·미지 문자열 category 전부 폐기 |
| T8 | 출력 형태 | `{category:'belt',source:'user',extra:1,brand:'X'}` → `Object.keys(r[0])` 가 `['category','source']` · `Object.getPrototypeOf(r[0]) === Object.prototype` · JSON 리터럴 `__proto__` 키가 결과에 없음 |
| T9 | source 수렴 | 없음·오타·`null`·숫자 → `'user'` / 유효한 `'auto'`는 보존 |
| T10 | 중복 병합 | `[{belt,auto},{belt,user,note:'메모'}]` **와** `[{belt,user,note:'메모'},{belt,auto}]` 둘 다 → `{belt, source:'user', note:'메모'}` (순서 무관 불변식) · note 승계 케이스 · **규칙4+6(a) 결합**: `[{belt,auto},{belt,source:null,note:'메모'}]` → `{belt, source:'user', note:'메모'}` · **`[belt×6, strap, shoes]` → 3개**(T12에서 이관 — 병합 검증으로서는 유효) · 최초 등장 순서 보존 |
| T11 | note 정제 | `'a'.repeat(40)` → 길이 30 · `'💪'.repeat(20)` 절단 결과에 고립 서로게이트 없음(`/[\uD800-\uDFFF]/` 미매칭 + `[...s].join('') === s`) · 비문자열/공백만 → 키 자체 부재(`deepEqual`로 키 존재까지) · **제어문자 명시 케이스**: `'앞\u0000중\n간\t뒤'` → `'앞 중 간 뒤'`, `'a\u2028b'` → `'a b'`, `'x\u00a0\u00a0y'` → `'x y'`(NBSP 연속 → 단일 일반 공백) · 절단 경계에서 후행 공백 미잔존 |
| T12 | 경계 보존·순서·멱등 | **8종 전량(순서 섞어) 입력 → 길이 8·전건 보존·최초 등장 순서 일치**(상한이 정상 데이터를 자르지 않음을 고정 — 무해통과였던 rev2 케이스 대체) · 대표 이형 입력 3~4건에 대해 `normalize(normalize(x))` deepEqual `normalize(x)` · 입력 배열/원소가 호출 전후 불변(`deepEqual`로 원본 스냅샷 비교) |
| T13 | 검색어 사전 | **`resolveGearLink(c, undefined, {disclosureRendered:false})`가 준 URL에서** `new URL(url).searchParams.get('q')`를 꺼내 8종 전수 스냅샷(사전은 비공개이므로 URL 경유로만 검증) · 전부 비어있지 않음 · 값 중복 없음 |
| T14 | 순수 검색 URL(제휴 비활성) | `resolveGearLink(c, undefined, {disclosureRendered:false})` → `ok:true` · **`kind === 'search'`**. `new URL(url)`로 `origin === 'https://www.coupang.com'` · `pathname === '/np/search'` · **`[...u.searchParams.keys()]`가 정확히 `['q']`** 를 8종 전부에 대해 assert(키 집합 동일성 — 부분 검사 금지) · `searchParams.get('q') === (T13 스냅샷 값)` 8종 전수(직접 비교) · **한글이 raw로 남지 않음**: `url.includes('손목') === false` 등 별도 assert · 2회 호출 동일(결정성) · note가 달라도 URL 동일 |
| T15 | 고지 판정(`requiresAffiliateDisclosure`) | §전수 진리표 2열을 그대로 전건 assert. 특히 **`{enabled:false, links:{belt:DEEP}}` → `true`**(rev3 정정 — rev2는 false였다) · `{enabled:false, links:{belt:BAD}}` → `false` · `{enabled:'yes'}`·`{}`·`undefined`·`null`·`[]`·`'x'`·`0` → `false` · `{enabled:true}`(links 없음) → `true` |
| T16 | **고지 게이트 × 딥링크 (핵심)** | §전수 진리표 3·4열을 그대로 전건 assert. 필수 3건: ① `resolveGearLink('belt', {enabled:false, links:{belt:DEEP}}, {disclosureRendered:false})` → **`{ok:false, blocked:'disclosure-missing'}`** ② 같은 cfg + `{disclosureRendered:true}` → `ok:true` · **`kind==='search'`** · `url !== DEEP` · `[...new URL(url).searchParams.keys()]`가 `['q']` ③ `{enabled:true, links:{belt:DEEP}}` + `{disclosureRendered:true}` → `ok:true` · `kind==='deeplink'` · **`url === DEEP`(문자 단위 동일)**. 추가: `{enabled:true, links:{belt:DEEP}}` + `false` → `blocked:'disclosure-missing'`(딥링크가 있어도 게이트 우선) · 미지 카테고리(캐스팅 우회) → `{ok:false, blocked:'unknown-category'}` · **정리 A 기계 검증**: 진리표 전 조합을 루프 돌며 `kind==='deeplink'`인 경우 반드시 `requiresAffiliateDisclosure(cfg) && ctx.disclosureRendered` |
| T17 | 허용 호스트 판정(엔진 비의존) | §허용 호스트 판정의 **기대 판정표 15행 전건**을 `resolveGearLink('belt', {enabled:true, links:{belt: 입력}}, {disclosureRendered:true})` 경유로 검증 — 허용이면 `kind==='deeplink'` · `url === 입력`, 거부면 `kind==='search'`. `evilcoupang.com`·`link.coupang.com.attacker.io`가 **반드시 거부**됨(suffix 매칭 회귀 방지) · 대문자 호스트는 **허용** · 트레일링 도트·포트·`@`·경로없음·`http:`·`javascript:`·선행 공백은 거부 |
| T18 | cfg 이상 입력·무예외 | `{enabled:true, links:{belt:123}}`·`{belt:null}`·`{belt:{}}`·`{belt:[]}` · `links`가 `'abc'`·`null`·`[]`·`42` · `cfg` 자체가 `[]`·`'x'`·`0`·`true`·`NaN` — 전부 **무예외**로 `ok:true`·`kind==='search'` (또는 `enabled` 미충족 시 그에 맞는 값). `requiresAffiliateDisclosure`도 동일 입력에서 무예외 |
| T19 | `MAX_GEAR_INPUT_SCAN` 스캔 절단 | ① `Array(210).fill({category:'belt',source:'auto'})`의 index 205에만 `{category:'shoes',source:'user'}`를 심은 입력 → 결과에 `shoes`가 **없다** ② `[...Array(200)].map(()=>({category:'belt',source:'auto'}))` 뒤에 `{category:'belt',source:'user',note:'메모'}`를 붙인 입력 → 결과가 `{belt, source:'auto'}`이고 note 없음(**스캔 절단이 병합보다 먼저**임을 관측 가능하게 고정) ③ 경계값: 정확히 200개의 마지막 원소는 살아남고 201번째는 폐기 ④ 길이 300 입력이 무예외 · 반환 길이 ≤ `MAX_GEAR_TAGS` · 멱등 |
| T20 | 배럴 스모크 | `import * as domain from '../index'` 후 **런타임 값 심볼만** `in domain` 확인 — `GEAR_CATEGORIES`·`MAX_GEAR_TAGS`·`MAX_GEAR_NOTE_LEN`·`MAX_GEAR_INPUT_SCAN`·`AFFILIATE_DISCLOSURE_KO`·`isGearCategory`·`gearLabelKey`·`normalizeGearTags`·`requiresAffiliateDisclosure`·`resolveGearLink` 10개. **타입 전용 export(`GearCategory`·`GearSource`·`GearTag`·`GearLabelKey`·`GearAffiliateConfig`·`GearLinkResult`)는 런타임에 존재하지 않으므로 대상이 아니다** — 타입 재수출 검증은 프로덕션 코드의 typecheck가 담당한다. 추가로 `'gearSearchQuery' in domain === false`·`'coupangSearchUrl' in domain === false`(내부화 회귀 방지). 배럴 누락과 RN 의존 유입을 동시에 방어 |

## 주의사항

- **`EquipmentType`과 절대 섞지 말 것** — `domain/types.ts`의 `EquipmentType`(barbell/dumbbell/machine/…)은 "운동 기구"로 이미 점유돼 있다. 착용장비는 `gear` 네임스페이스로 완전 분리(타입·상수·i18n 키). 용어 혼동이 누적되면 되돌리기 어렵다
- **도메인 모듈은 `new URL`을 사용하지 않는다(gotcha)** — 앱 런타임의 전역 `URL`은 RN 정규식 폴리필(`setUpXHR.js`가 `polyfillGlobal('URL', …)`)이라 Node의 WHATWG URL과 의미가 다르다(throw 여부·소문자 정규화 여부). 파싱 결과에 정책 안전이 걸린 코드를 엔진 차이가 있는 API로 구현하면 **Node 테스트가 초록인데 기기에서 다르게 동작**한다. 검색 URL 조립도 문자열 결합, 호스트 판정도 문자열 연산으로만 한다. (테스트 파일 안에서 `new URL`을 검증 도구로 쓰는 것은 Node 전용이라 무방)
- **표시 문자열은 i18n 키로, 단 두 가지는 예외** — `domain/labels.ts`(MUSCLE_LABELS·EQUIPMENT_LABELS)·`variants.ts`(GRIP_LABELS)라는 **도메인 보유 ko/en 맵 선례가 실재**하므로 "도메인은 문자열을 갖지 않는다"는 이 리포의 규칙이 아니다. gear 라벨은 ko/en 번들 일원화와 en 사용자 대응을 위해 **i18n 키 방식을 택한다**. 예외 2개: ① `GEAR_SEARCH_QUERY`의 한국어 — 표시 라벨이 아니라 쿠팡(한국 서비스) 질의용 **정책 데이터**라 언어 무관 고정, ② `AFFILIATE_DISCLOSURE_KO` — 법정 고지 문구라 로케일 무관 한국어 고정(§고지 문구 소유권)
- **카테고리 목록은 되돌리기 어렵다** — 이미 저장된 게시물의 태그가 화이트리스트 밖으로 밀리면 조용히 사라진다. 8종은 ADR-027 D5로 확정된 값이며 임의 증감 금지
- **제휴 설정은 인자로만 받는다** — 모듈이 env·전역·플랫폼 상태를 읽지 않는다. `EXPO_PUBLIC_*` 참조 금지(웹 번들에 평문으로 굳음). 공급은 SRS-039 서버 설정 조회
- **읽기 경로도 반드시 정규화를 거친다** — `normalizeGearTags`의 반환형이 입력과 같은 `GearTag[]`라 "정규화되지 않은 데이터"를 컴파일러가 구분해 주지 못한다. SRS-040이 `(post.data as {gear?: GearTag[]}).gear`를 정규화 없이 바로 map 하면 typecheck는 통과하고 미지 카테고리가 그대로 흘러든다. 브랜딩 타입까지 도입하지는 않되(과설계), `GearTag` 필드를 `readonly`로 두고 **정규화는 항상 새 객체를 만든다**는 규약과 SRS-040 계약으로 방어한다
- **테스트 파일은 typecheck 대상이 아니다** — `app/tsconfig.json`의 exclude에 `src/**/__tests__/**`가 실재하고 러너는 tsx(타입 소거만)다. 따라서 ① 모든 검증은 **런타임 assert**로 작성하고 타입 수준 단언은 검증으로 치지 않는다 ② 불량 입력은 `as any` 캐스트 없이 그대로 넘겨도 된다. 완료 조건의 typecheck 항목이 커버하는 범위는 **프로덕션 코드**(gear.ts·index.ts·ko.ts·en.ts)뿐이다
- 기준선: `npm test` **83 pass / 0 fail**, `npm run typecheck` clean. 새 실패는 전부 이번 변경 탓

## 상위 아티팩트 개정 필요 (SRS-039 착수 전 선행)

rev2/rev3의 API 형태는 **Phase 0 실동작을 바꾸지 않지만**(제휴 비활성 → 순수 검색 URL로 동일), 상위 아티팩트의 서술과 어긋난다.
spec만 고치면 불일치가 남으므로 아래를 명시적 후속으로 올린다. **SRS-037 구현 자체는 이 개정을 기다리지 않는다**(큐 진행 가능).

| 아티팩트 | 현재 서술 | 필요한 개정 |
|---|---|---|
| ADR-027 D2 | *"링크 빌더는 partnerTag 를 선택적 인자로 받아 값이 주입될 때만 추적 파라미터를 붙이는 구조"* | 추적 파라미터 조립 → **사전 생성 딥링크 주입**으로 변경. 근거 = 자체 조사 보고서(수동 파라미터 부착 = 불허 추정, 운영정책 4.1 1) 링크 조작 금지). ADR-027 재검토 조건 중 *"약관·운영정책 개정 시 국소 재검토"* 경로에 해당 |
| **SAD-020 (rev3 추가 — 누락돼 있었음)** | 세 곳이 rev2/rev3과 정면 충돌: ①컴포넌트 축소 목록 *"빌더는 partnerTag 를 선택적 인자로 받아 값이 주입될 때만 추적 파라미터를 덧붙인다"* ②DisclosureGuard *"partnerTag 주입 즉시 라벨이 카드 상단에 강제 노출되고"* ③보안·정책 제약 *"파트너 태그 값을 런타임에 받아 링크 빌더 인자로 넘긴다 … 서버 env 주입만으로 추적 파라미터가 활성화되며"* | ①→ 사전 생성 딥링크 무가공 반환 + 허용 호스트 정확 일치 폴백 ②→ 트리거를 **`enabled` 또는 딥링크 존재**로, 위치를 **게시물 첫 부분**(작성자명 아래)으로 ③→ *"서버가 사전 생성 딥링크를 내려주며 앱은 조립하지 않는다"*. **SAD-020은 G2 게이트 대상이고 SRS-037 코드가 `realizes`로 직결**되므로 비워 두면 "승인된 설계와 코드가 다른데 기록이 없는" 상태가 된다 |
| SRS-037 수용 기준 4 | *"partnerTag 없이 조립한 URL에는 어떤 추적 파라미터도 포함되지 않는다. partnerTag 가 주어지면 그때만 추적 파라미터가 부가된다"* | 전단은 유지(rev3에서 오히려 강화). **후단은 삭제** — rev3에 partnerTag도 파라미터 부가 동작도 존재하지 않아 영구히 충족 불가능한 요구가 된다. 대체: *"제휴 활성 시에는 사전 생성 딥링크를 무가공으로 반환하며, 앱이 URL에 파라미터를 조립하는 동작은 존재하지 않는다"* |
| SRS-037 수용 기준 5 | *"고지 라벨 필요 판정 함수가 partnerTag 가 주어지면 true"* | 트리거를 **제휴 매체 활성(`enabled`) 또는 허용 호스트 딥링크 존재**로 교체. 링크 준비 여부와 무관하게 고지(공정위 심사지침 미래·조건부 대가 공개의무 / 쿠팡 약관 제11조 4항) |
| SRS-037 수용 기준 1 · doc 3문단 | AC1 *"라벨 문자열 자체는 도메인이 갖지 않고 키만 노출한다"* · doc 3문단 전체가 partnerTag 서사 | **AC1은 카테고리 라벨에 한정하며 법정 고지 문구(`AFFILIATE_DISCLOSURE_KO`)는 명시적 예외**임을 요구 원문 쪽에 남긴다(나중에 리팩터링이 i18n으로 되돌리지 않도록). doc 3문단은 딥링크 주입 서사로 갱신 |
| SRS-039 수용 기준 3 | *"제휴 설정 조회 엔드포인트가 서버 env 의 파트너 값을 읽어 활성 여부와 태그를 반환"* | 응답을 `{ enabled: boolean, links?: { [category]: deeplinkUrl } }` 두 필드로 규정. `partnerTag`는 파트너스에 존재하지 않는 조어이므로(실존 식별자 = AF ID · 채널 아이디(subId) · 딥링크 코드) 서버 구현자가 무엇을 넣을지 판단할 근거가 없다. 추가: **클릭 이벤트에 `kind`를 함께 적재**해 딥링크/검색 폴백률을 관측 가능하게 한다. **§활성화 게이트 체크리스트를 SRS-039 spec에 복사**한다(`enabled`를 켜는 주체가 SRS-039 서버 env이므로) |
| SRS-040 (신규 후속) | — | ① 고지 라벨 렌더 **위치**(게시물 첫 부분 · 작성자명 아래 · 칩 영역보다 위)를 수용 기준으로 승격 ② `disclosureRendered` 되먹임 금지 패턴을 **코드 리뷰 필수 체크 항목**으로 등록 ③ 8개 검색어 결과 관련성 육안 확인을 선행 체크리스트로 등록 |

### 활성화 게이트 (릴리스 체크리스트 — 전 항목 충족 전에는 `enabled=true`를 어떤 환경에도 주입하지 않는다)

rev2는 *"딥링크는 공식 링크 생성기 산출물만 주입한다"* 한 조건뿐이었는데, 이 조건은 **매체 등록 없이도 충족된다**
(딥링크는 파트너스 계정만 있으면 웹 링크 생성기로 즉시 만들 수 있다 — 보고서 B5, 항목당 ~1분).
운영정책 4.1 1)은 *"쿠팡 파트너스에 등록되지 않은 미디어에 광고를 노출시키는 행위"*를 **A등급**으로 금지한다.
*"env 스위치 하나가 정책 위반과 준수를 가르는데 그 스위치를 켜는 조건이 문서화되어 있지 않다"* — lptag를 폐기한 것과 동일한 논리가 여기에도 적용된다.
게다가 공지 188의 제보 포상금(건당 5만원)이 가동 중이라 경쟁 파트너의 신고 유인이 실재하고, 제재는 연관 계정 전체로 확산된다.

1. [ ] 파트너스 가입 완료 (보고서 B1)
2. [ ] **[내 정보 관리 > 계정 관리]의 모바일 앱 목록에 본 앱이 등록되고 승인**됨 (B3 — 앱스토어 실제 출시 · 활동 스크린샷 전제)
3. [ ] 회원제 앱이므로 **심사용 테스트 ID/PW 제출 완료** (운영정책 2.1, B4)
4. [ ] 딥링크는 파트너스 **공식 링크 생성기/간편링크 산출물**이며, **원본이 검색 결과 URL**이다(§links 정책 — 상품 상세·기획전·골드박스 금지)
5. [ ] 원본 URL의 `q` 값이 `GEAR_SEARCH_QUERY[category]`와 일치함을 확인하고 **원본↔딥링크 쌍을 기록**했다
6. [ ] 주입 값이 **소문자 `https://` 스킴 + 허용 호스트 + 경로 포함** 형태 그대로다(앞뒤 공백·개행 없음 — §허용 호스트 판정)
7. [ ] **주입 직후 8개 카테고리 전부에 대해 `resolveGearLink(c, cfg, {disclosureRendered:true})`가 `kind==='deeplink'`를 돌려주는지 1회 확인**했다(하나라도 `'search'`면 그 카테고리는 조용히 폴백 중 = 수수료 0원인데 고지만 노출되는 상태)
8. [ ] 고지 라벨이 SRS-040에 **실제 구현·렌더 검증 완료**되었고 위치가 게시물 첫 부분이다
9. [ ] (권장) UI 사전 협의 메일 발송 (B9 — 태그 UI의 커버형/가림 해석 리스크)

## 코드 영향 범위

신규 모듈이라 역방향 의존이 없다. `domain/index.ts` 배럴에만 얹히므로 기존 화면·데이터 계층에 영향 0.
i18n은 키 **추가**만 하므로 가산적(기존 키 불변).

## 작업 범위 (수정 대상 파일)

```
app/src/domain/gear.ts                  (신규)
app/src/domain/__tests__/gear.test.ts   (신규)
app/src/domain/index.ts                 (1줄 추가)
app/src/i18n/locales/ko.ts              (8키 추가)
app/src/i18n/locales/en.ts              (8키 추가)
```

## 완료 조건

- `cd app && npm run typecheck` → 0 error (프로덕션 코드 기준 — `__tests__`는 exclude 대상)
- `cd app && npm test` → **0 fail**, 그리고 `gear.test.ts`가 §필수 테스트의 **T1~T20 전 그룹을 포함**(기준선 83 + 20 이상). 그룹 누락은 미완료로 판정한다
- 그룹 커버리지 기계 확인: `npm test 2>&1 | grep -oE 'T[0-9]+ ' | sort -u | wc -l` 이 **20**
- 정리 A·B가 T15·T16으로 고정되어 있다 — 특히 `{enabled:false, links:{belt:DEEP}}` 조합이 `disclosure-missing`으로 차단되고, 고지 렌더 시에도 딥링크가 **아닌** 검색 URL을 돌려준다
- SRS-037 수용 기준 6개 대응:
  ① → T1·T3·T4 ② → T5~T8·T11·T12·T19 (단 "개수 상한"은 **도달 불가 — T12의 경계 보존으로 대체 검증**. §규칙 7) ③ → T9·T10 ④ → T13·T14·**T16·T17**(무가공 반환·호스트 폴백 — 단, AC4 후단은 §개정 필요 대상) ⑤ → T15·T16 (트리거는 `enabled` 또는 딥링크 존재로 개정 필요) ⑥ → 전체

## 기각 목록 (2사이클 리뷰 지적 중 채택하지 않은 것 — 사유 기록)

1. **`ctx.disclosureRendered` → `disclosureVisible` 개명** — 개명은 구조적 보증을 1도 늘리지 않는다(되먹임 항진명제는 이름과 무관하게 성립). 이미 확정된 상위 SRS·리뷰 지시문·이 spec 전체의 서술과 이름이 어긋나 혼선 비용만 남는다. 대신 소비자 계약 + 금지/허용 패턴 코드 + 잔여 리스크 2번으로 처리했다.
2. **`renderDisclosure()` 콜백을 도메인이 받아 호출을 강제하는 설계** — 순수 함수 계약(부작용 없음·테스트 결정성·RN 비의존)을 정면으로 깬다. 제안한 리뷰어 본인도 비권장으로 분류했다. 계약 문서화가 최소 비용의 정답이다.
3. **허용 호스트 비교 시 트레일링 도트 스트립(`replace(/\.$/,'')`)** — `coupang.com.`을 허용 집합에 **편입시키는 완화**다. 정확 일치 원칙과 반대 방향이고, 공식 링크 생성기는 트레일링 도트를 만들지 않는다. 거부(→ 검색 URL 폴백)가 안전 방향이며 체크리스트 7번이 즉시 검출한다.
4. **대문자 스킴·호스트 전면 불허** — 채택하지 않고 **비교 시점에만 `toLowerCase()` 정규화**(순수 문자열 연산이라 엔진 비의존성은 그대로 유지된다). 전면 불허는 "조용한 폴백 = 수수료 0원인데 고지만 노출" 확률을 키우는 방향이라 방어 이득보다 운영 사고 위험이 크다. 호스트 **정확 일치**는 그대로 유지된다.
5. **상한 적용 지점을 별도 함수 경계로 노출해 규칙 7의 순서 불변식을 테스트 가능하게 만들기** — 도달 불가능한 방어 규칙 하나를 증명하려고 공개 API 표면을 늘리는 과설계다. 대신 규칙 7의 근거를 정직하게 재서술하고, 완료 조건 대응표에 검증 공백("도달 불가 — 경계 보존으로 대체 검증")을 **은폐하지 않고 명시**하는 쪽을 택했다.
6. **딥링크 목적지를 코드로 검증(HEAD 요청·리다이렉트 추적·상품 상세 판별)** — `link.coupang.com/a/…`는 단축 URL이라 목적지가 문자열에 없고, 순수 도메인 함수에 네트워크 I/O를 넣는 것은 계층 위반이다. §links 정책의 운영 규약 + 원본↔딥링크 쌍 기록으로 처리했다.
7. **도메인 모듈에 폴백 로깅·텔레메트리 주입** — 순수성(부작용 없음·테스트 결정성)을 깬다. 관측은 `kind` 판별 필드로 **호출자에게 넘기고**, 저빈도 사람 작업인 주입 시점은 체크리스트 7번이 잡는다. (지적한 리뷰어도 코드 대응 불필요로 결론냈으나 명시적으로 기록해 둔다.)
8. **ko/en 라벨 16문자열 전수 스냅샷 assert** — 라벨은 카피 다듬기 대상이라 스냅샷으로 잠그면 문구를 고칠 때마다 테스트가 깨지고, 그 마찰이 오히려 나쁜 문구를 고착시킨다. **spec의 표가 권위**이고, 테스트(T4)는 존재·비어있지 않음·언어 오배치(한글 포함 여부)만 잡는다.
9. **T 그룹 커버리지 검사용 npm script / CI 게이트 신설** — 리포에 CI 파이프라인이 없고 `package.json` 수정은 이 태스크의 작업 범위 밖이다. 테스트명 `T{n} ` 접두 규약만 채택해 **수동 grep 한 줄**로 확인 가능하게 했다(완료 조건에 명령 그대로 기재).
10. **원소별 `try/catch`로 무예외 계약을 물리적으로 보장** — 실제 입력원은 `JSON.parse` 산출물과 피커 리터럴뿐이라 방어 대상이 존재하지 않고, 남발하면 폐기 사유를 삼켜 디버깅을 어렵게 만든다. 계약 문장을 "JSON 유래 순수 데이터인 한"으로 정확히 한정하는 쪽을 택했다(접근자·Proxy는 범위 밖으로 명시).
