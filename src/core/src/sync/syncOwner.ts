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
//   · 소유자가 다르다 → **로컬을 비운다**(커서까지). 그리고 카탈로그를 다시 심는다
//
// 비우는 쪽이 과격해 보이지만, 대안은 "섞인다"뿐이다. 비워도 그 계정의 기록은 서버에 있고
// 첫 동기에서 되돌아온다 — 잃는 것은 **로그인하지 않은 채 쌓은 남의 기록뿐**이고, 그건
// 애초에 이 계정 것이 아니다.
// ─────────────────────────────────────────────────────────────────────────────
import { database } from '../db/database';
import { seedExercisesIfNeeded } from '../data/seedRunner';

const OWNER_KEY = 'sync_owner_id';

/** 소유자 표시를 읽고 쓰는 방법. 플랫폼이 다르므로 밖에서 꽂는다(웹=localStorage). */
export interface OwnerStore {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string): Promise<void> | void;
}

let store: OwnerStore | null = null;

export function installOwnerStore(s: OwnerStore | null): void {
  store = s;
}

/**
 * 로그인한 계정과 로컬 데이터의 주인을 대조한다.
 *
 * @returns 로컬을 비웠으면 true. 화면은 이 값을 보고 "이 기기의 예전 기록을 지웠다"고 알린다.
 */
export async function reconcileAccount(serverUserId: string): Promise<boolean> {
  if (!store || !serverUserId) return false;

  const owner = await store.get(OWNER_KEY);
  if (owner && owner !== serverUserId) {
    // 다른 사람이 이 기기를 쓴다 — 로컬과 동기 커서를 통째로 비운다.
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    // 카탈로그는 사용자 데이터가 아니라 앱의 재료다 — 비운 자리에 다시 심는다.
    await seedExercisesIfNeeded();
    await store.set(OWNER_KEY, serverUserId);
    return true;
  }
  // 처음이다 — 로그인 전에 쌓은 기록을 이 계정 것으로 삼는다.
  if (!owner) await store.set(OWNER_KEY, serverUserId);
  return false;
}
