// @plm SRS-073 SAD-023  다운그레이드 가드 — 옛 번들이 새 스키마 DB 를 열어 **전부 지우는** 것을 막는다(D-5).
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜: WatermelonDB LokiJS 는 DB 버전이 앱 스키마보다 높으면 "Database has newer version … Resetting database" 로
// 로컬 DB 를 통째로 지운다(adapters/lokijs/worker/DatabaseDriver.js). 동기 안 된 기록도 함께 사라진다.
// 옛 번들이 다시 도는 길은 현실에 있다 — 서비스워커가 기기에 남긴 옛 셸, 배포 롤백, 열려 있던 옛 탭 새로고침.
//
// 그래서 DB 를 **열기 전에** 이 기기에서 본 가장 높은 스키마 버전을 localStorage 에 남기고(`liftgram.maxSchemaSeen`),
// 자기 SCHEMA_VERSION 이 그보다 낮은 번들은 진짜 DB 를 열지 않는다(adapter.ts 가 버린 이름의 빈 DB 로 바꾼다).
// 화면은 「새 버전으로 새로고침」만 보인다(frontend SchemaGuard).
//
// ⚠ 이 가드는 **이 코드가 들어간 번들(v26)부터** 효과가 있다. v25 번들은 이 키를 모른다 — 그래서 v26 은
//   마이그레이션 직후 옛 세대 페이지 캐시를 지워(frontend SchemaGuard) 옛 셸이 다시 나올 길을 줄이고,
//   배포 스크립트가 스키마 하강 배포를 막는다(scripts/deploy-h2500-3.sh).
// ─────────────────────────────────────────────────────────────────────────────

/** 이 기기에서 본 가장 높은 로컬 스키마 버전 */
export const MAX_SCHEMA_SEEN_KEY = 'liftgram.maxSchemaSeen';
/** 옛 세대 페이지 캐시를 이 스키마 버전 기준으로 이미 지웠다(마이그레이션 직후 한 번) */
export const PAGES_CACHE_CLEANED_KEY = 'liftgram.pagesCacheCleanedFor';

export interface SchemaGuardDecision {
  /** true = 이 번들이 DB 를 열면 안 된다(더 높은 스키마를 이미 봤다) */
  blocked: boolean;
  /** 저장돼 있던 값(없거나 깨졌으면 null) */
  seen: number | null;
  /** 저장할 값 = max(seen, current). blocked 여도 seen 을 낮추지 않는다. */
  next: number;
}

/** 저장 문자열 → 버전 숫자. 양의 정수가 아니면 null(깨진 값은 없는 것으로 — 막지 않는다). */
export function parseSchemaSeen(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 순수 판정 — 저장값과 이 번들의 스키마 버전으로 막을지 정한다. */
export function decideSchemaGuard(raw: string | null | undefined, current: number): SchemaGuardDecision {
  const seen = parseSchemaSeen(raw);
  const blocked = seen !== null && current < seen;
  return { blocked, seen, next: seen === null ? current : Math.max(seen, current) };
}

/** 최소 저장소 — 웹은 localStorage. 테스트·네이티브는 밖에서 꽂는다. */
export interface GuardStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): GuardStore | null {
  try {
    const ls = (globalThis as { localStorage?: GuardStore }).localStorage;
    return ls ?? null;
  } catch {
    return null; // 접근 자체가 막힌 환경(일부 사생활 보호 모드)
  }
}

export interface SchemaGuardState extends SchemaGuardDecision {
  /** 이번 부팅에서 스키마가 올라갔다(저장값 < current, 또는 저장값 없음 = 이 가드가 처음 도는 기기) */
  upgraded: boolean;
}

let state: SchemaGuardState | null = null;

/**
 * 부팅 때 **DB 를 열기 전에** 한 번 부른다(adapter.ts buildAdapter). 결과는 모듈에 기억한다.
 * 저장소가 없으면(서버 렌더·막힌 저장소) 막지 않는다 — 가드가 못 도는 곳에서 앱을 멈추지 않는다.
 */
export function checkSchemaGuardOnBoot(current: number, store: GuardStore | null = defaultStore()): SchemaGuardState {
  if (!store) {
    state = { blocked: false, seen: null, next: current, upgraded: false };
    return state;
  }
  let raw: string | null = null;
  try {
    raw = store.getItem(MAX_SCHEMA_SEEN_KEY);
  } catch {
    raw = null;
  }
  const d = decideSchemaGuard(raw, current);
  if (!d.blocked && d.next !== d.seen) {
    try {
      store.setItem(MAX_SCHEMA_SEEN_KEY, String(d.next));
    } catch {
      // 저장 실패 — 다음 부팅에 다시 쓴다. 지금 DB 는 열어도 된다(더 높은 버전을 본 적이 없다).
    }
  }
  state = { ...d, upgraded: !d.blocked && (d.seen === null || d.seen < current) };
  return state;
}

/** 이번 실행이 다운그레이드로 막혔는가. 부팅 판정 전이면 false. */
export function isSchemaDowngradeBlocked(): boolean {
  return state?.blocked === true;
}

/** 부팅 판정 결과(판정 전이면 null) — 화면 가드·마이그레이션 직후 정리가 읽는다. */
export function getSchemaGuardState(): SchemaGuardState | null {
  return state;
}

/** 테스트 전용 — 모듈 상태를 비운다. */
export function __resetSchemaGuardForTest(): void {
  state = null;
}
