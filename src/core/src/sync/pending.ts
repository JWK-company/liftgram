// @plm SRS-053  서버로 아직 안 올라간 **사용자 기록** 세기 — 동기 경고(syncEngine)와 계정 전환 가드(syncOwner)가 함께 쓴다.
//
// WatermelonDB는 행마다 `_status`(synced·created·updated·deleted)를 둔다. synced가 아니면 이 기기에만 있다.
// 기본 카탈로그(`exercises` 중 is_custom=false)는 세지 않는다 — 앱이 심은 재료라 잃어도 다시 심긴다.
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';

/** 사용자가 만든 기록이 담기는 표 — 기본 카탈로그(`exercises` 중 is_custom=false)는 세지 않는다. */
export const USER_TABLES = [
  'workouts',
  'workout_exercises',
  'set_logs',
  'routines',
  'routine_exercises',
  'user_profiles',
  'exercise_user_prefs', // v22 — 표시 이름·플레이트 한쪽 입력(QA M3) @plm SRS-056
  // v26 — 체중 이력·가져오기 묶음·가져오기 별칭. 여기 넣으면 대기 수·계정 전환 가드·백업(backup.ts)이 따라온다(D-17).
  // exercises.import_batch_id(가져온 커스텀 종목)는 아래 is_custom 규칙으로 이미 센다 — 가져온 종목은 is_custom=true 다.
  // ⚠ 서버 쪽 report.go reportCollections·scripts/migrate-records.ts 에는 이 표들을 **넣지 않는다**(트레이너 리포트·옛 기록 이관 대상 아님 ·
  //   허용 목록은 backend 가 고정 — S-2). @plm SRS-077 SRS-081 SRS-082
  'bodyweight_logs',
  'import_batches',
  'import_aliases',
];

/** 서버로 아직 안 올라간 사용자 기록 수. 계정 전환 가드와 화면 경고가 함께 쓴다. */
export async function countPendingUserChanges(): Promise<number> {
  let n = 0;
  for (const table of USER_TABLES) {
    n += await database.get(table).query(Q.where('_status', Q.notEq('synced'))).fetchCount();
  }
  n += await database
    .get('exercises')
    .query(Q.where('_status', Q.notEq('synced')), Q.where('is_custom', true))
    .fetchCount();
  return n;
}

