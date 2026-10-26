// 로컬 DB의 **소유 계정** 경계 — 기기를 함께 쓸 때 남의 기록이 섞이지 않게 한다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 로컬 DB는 계정과 무관한 하나뿐이다(오프라인에서 먼저 쓰기 시작하니까). 그래서 다른 계정으로
// 로그인하면 **이전 사람의 기록이 새 계정으로 밀려 올라간다** — 남의 운동 기록이 내 계정에 붙고,
// 내 기록이 남에게 보인다.
//
// 그래서 로그인할 때 한 번 대조한다:
//   · 소유자가 없다  → 이 계정 것으로 삼는다(오프라인에서 쌓은 기록을 그대로 이어 간다)
//   · 소유자가 같다  → 아무 일도 없다
//   · 소유자가 다르다 →
//       - 이 기기에만 있는(서버에 안 올라간) 기록이 **없으면** 로컬을 비운다. 그 계정 기록은 서버에 있어
//         다음에 그 계정으로 로그인하면 되돌아온다.
//       - **있으면 비우지 않는다**(2026-10-26). 예전에는 여기서 통째로 지워, 올라가지 못한 기록이 그대로
//         사라질 수 있었다. 대신 동기를 **멈추고**(남의 기록이 새 계정에 붙지 않게) 사람에게 고르게 한다:
//         원래 계정으로 돌아가 올리거나, 백업 파일로 내보낸 뒤 비우거나.
// ─────────────────────────────────────────────────────────────────────────────
import { database } from '../db/database';
// [원본] 원복 시 아래를 주석 해제하고 wipeFor 안의 동적 import 를 지운다
// import { seedExercisesIfNeeded } from '../data/seedRunner';
// [개선] 시드 카탈로그(338종 · ≈111KB)는 계정을 비울 때만 필요하다 — 정적 import 면 앱 셸 첫 로드에 매번 실린다
// (SRS-054 P5 청크 실측). 동작은 같고 받는 시점만 그때로 미룬다.
import { countPendingUserChanges } from './pending';

const OWNER_KEY = 'sync_owner_id';
/** 동기를 멈춘 상태 — 값은 막 로그인한(그러나 아직 이 기기 주인이 아닌) 계정 id */
const BLOCK_KEY = 'sync_owner_blocked';

/** 소유자 표시를 읽고 쓰는 방법. 플랫폼이 다르므로 밖에서 꽂는다(웹=localStorage). */
export interface OwnerStore {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string): Promise<void> | void;
}

let store: OwnerStore | null = null;
// 동기 엔진이 매번 묻는다 — 저장소가 비동기일 수 있어 메모리에도 들고 있는다.
let blockedFor: string | null = null;

export function installOwnerStore(s: OwnerStore | null): void {
  store = s;
  blockedFor = null;
  if (!s) return;
  void Promise.resolve(s.get(BLOCK_KEY)).then((v) => {
    blockedFor = v || null;
  });
}

/** 다른 계정의 기록이 남아 있어 동기를 멈췄는가. */
export function isSyncBlocked(): boolean {
  return blockedFor !== null;
}

export type ReconcileResult =
  | { kind: 'same' }
  | { kind: 'adopted' }
  /** 남은 기록이 없어 비웠다 — 화면은 "이 기기의 예전 기록을 지웠다"고 알린다 */
  | { kind: 'wiped' }
  /** 남은 기록이 있어 **멈췄다** — 화면은 고르게 한다(원래 계정으로 / 내보낸 뒤 비우기) */
  | { kind: 'blocked'; pending: number; previousOwner: string };

/** 로그인한 계정과 로컬 데이터의 주인을 대조한다. */
export async function reconcileAccount(serverUserId: string): Promise<ReconcileResult> {
  if (!store || !serverUserId) return { kind: 'same' };

  const owner = await store.get(OWNER_KEY);
  if (!owner) {
    // 처음이다 — 로그인 전에 쌓은 기록을 이 계정 것으로 삼는다.
    await store.set(OWNER_KEY, serverUserId);
    await setBlocked(null);
    return { kind: 'adopted' };
  }
  if (owner === serverUserId) {
    await setBlocked(null);
    return { kind: 'same' };
  }

  const pending = await countPendingUserChanges();
  if (pending > 0) {
    await setBlocked(serverUserId);
    return { kind: 'blocked', pending, previousOwner: owner };
  }
  await wipeFor(serverUserId);
  return { kind: 'wiped' };
}

/**
 * 사람이 "비우고 이 계정으로 계속"을 골랐다(백업 파일을 내보낸 **뒤에만** 부른다).
 * 이 기기의 기록을 지우고 지금 계정을 주인으로 삼는다.
 */
export async function discardLocalAndAdopt(serverUserId: string): Promise<void> {
  await wipeFor(serverUserId);
}

/** 로그아웃했다 — 멈춤을 푼다(주인은 그대로라 원래 계정으로 다시 로그인하면 이어진다). */
export async function clearSyncBlock(): Promise<void> {
  await setBlocked(null);
}

async function wipeFor(serverUserId: string): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
  // 카탈로그는 사용자 데이터가 아니라 앱의 재료다 — 비운 자리에 다시 심는다.
  const { seedExercisesIfNeeded } = await import('../data/seedRunner');
  await seedExercisesIfNeeded();
  // 비운 DB 에는 부팅 백필이 다시 필요하다 — 기기 로컬 표식을 지운다(빈 값 = 미실행). 카탈로그 판 표식도 지워
  // 다음 카탈로그 동기가 처음부터 받게 한다(/qa code L-2). 소유자 저장소에는 remove 가 없어 빈 값을 쓴다.
  const { clearBootMarkers } = await import('../migrations/runner');
  clearBootMarkers({ get: () => null, set: () => {}, remove: (k) => void store?.set(k, '') });
  await store?.set('liftgram.catalog.revision', '');
  await store?.set(OWNER_KEY, serverUserId);
  await setBlocked(null);
}

async function setBlocked(userId: string | null): Promise<void> {
  blockedFor = userId;
  await store?.set(BLOCK_KEY, userId ?? '');
}
