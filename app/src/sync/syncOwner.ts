// 로컬 오프라인 DB의 "소유 계정" 경계 — 계정 전환/기기 공유 시 운동기록 교차오염·노출·유실 방지.
// 로컬 WatermelonDB는 계정 무관 단일 DB(dbName 고정)라, 다른 계정으로 로그인하면 이전 계정의
// 로컬 레코드가 새 계정 스코프로 push되어 섞인다(SRS-006/ADR-002). 로그인 시 소유 계정을 대조해
// 다르면 로컬 DB를 초기화(+cursor 리셋)·재시드한다. 최초(소유자 없음)면 로컬 데이터를 이 계정으로 승격.
import { database } from '../db/database';
import { seedExercisesIfNeeded } from '../data/seedRunner';
import { getPref, setPref } from './prefs';

const OWNER_KEY = 'sync_owner_id';

// 로그인한 서버 계정 id와 로컬 데이터 소유 계정을 대조.
// 다른 계정이면 로컬 DB를 초기화·재시드(true 반환). 최초면 소유권만 부여(false).
export async function reconcileAccount(serverUserId: string): Promise<boolean> {
  const owner = await getPref(OWNER_KEY);
  if (owner && owner !== serverUserId) {
    // 다른 계정 로그인 — 이전 계정의 로컬 데이터/동기 커서를 완전 초기화(교차오염·노출 차단).
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    await seedExercisesIfNeeded(); // 운동 카탈로그 재시드(리셋으로 지워짐)
    await setPref(OWNER_KEY, serverUserId);
    return true;
  }
  if (!owner) await setPref(OWNER_KEY, serverUserId); // 최초 계정 — 로컬(오프라인) 데이터 승격
  return false;
}
