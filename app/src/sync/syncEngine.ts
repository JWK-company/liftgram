// 오프라인-우선 동기 엔진 — WatermelonDB synchronize() ↔ 서버 /sync (ADR-002 · SAD-004). @plm SRS-006
// 서버는 비삭제 레코드를 전부 updated로 보내고(권장 패턴), 클라이언트는 sendCreatedAsUpdated로
// 미존재 레코드를 생성·경고 억제 → "record already exists" 회피.
import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from '../db/database';
import { serverApi } from './serverApi';

async function runSynchronize(): Promise<void> {
  await synchronize({
    database,
    sendCreatedAsUpdated: true,
    pullChanges: async ({ lastPulledAt }) => {
      const { changes, timestamp } = await serverApi.pull(lastPulledAt ?? 0);
      return { changes, timestamp };
    },
    pushChanges: async ({ changes }) => {
      await serverApi.push(changes);
    },
    migrationsEnabledAtVersion: 1,
  });
}

// synchronize()는 동시 실행이 안전하지 않다(커서 손상·"database is locked"). 모든 트리거
// (로그인·부팅·포그라운드·주기·뮤테이션)를 단일 비행으로 합쳐 직렬화한다. 진행 중이면 그
// Promise를 그대로 공유 → 겹쳐 호출돼도 실제 동기는 1회. 실패는 호출부로 그대로 전파
// (수동 '지금 동기'는 await해 에러를 표면화, 백그라운드 트리거는 scheduleSync가 삼킴).
let inFlight: Promise<void> | null = null;

export function syncWithServer(): Promise<void> {
  if (!inFlight) {
    inFlight = runSynchronize().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

// 백그라운드 자동 동기 트리거 — 디바운스로 연속 호출을 1회로 합치고, 로그인 상태에서만 실행,
// 오프라인·일시 실패는 조용히 무시(다음 트리거가 재시도). fire-and-forget 안전.
// 로그인 이후 생성/변경분이 서버로 올라가지 않던 문제의 해소 지점 — 부팅·포그라운드·주기·
// 핵심 뮤테이션(운동 완료·루틴 저장) 후 이 함수를 호출한다.
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSync(delayMs = 1500): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void (async () => {
      try {
        if (await serverApi.isLoggedIn()) await syncWithServer();
      } catch {
        // 오프라인·일시 서버오류는 무시 — 포그라운드/주기/다음 뮤테이션 트리거가 재시도.
      }
    })();
  }, delayMs);
}
