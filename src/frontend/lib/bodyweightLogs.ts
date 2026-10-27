// @plm SRS-077 SRS-078  체중 이력 구독 — 프로필 체중 칸·체중 기록 전체·통계 체중 카드가 같은 목록을 본다
//
// 고치기(무게·측정 시각)는 행 수를 바꾸지 않아 query.observe() 로는 안 보인다 — observeWithColumns 로 두 칸을 함께 본다.
// 저장소는 브라우저 저장소를 붙잡으므로 서버 렌더에서 끌어오지 않게 동적 import 한다.
import type { BodyweightLogLike } from "@app/core/domain/bodyweight";
import { useEffect, useState } from "react";

export interface BodyweightLogsState {
  /** 모든 줄(무효 행·「설정 안 함」 표식 포함) — 거르기는 core(sortBodyweightLogs·latest)가 한다 */
  logs: BodyweightLogLike[];
  loaded: boolean;
}

export function useBodyweightLogs(): BodyweightLogsState {
  const [state, setState] = useState<BodyweightLogsState>({ logs: [], loaded: false });
  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;
    let cancelled = false;
    void import("@app/core/data/bodyweightRepository")
      .then((repo) => {
        if (cancelled) return;
        sub = repo
          .queryBodyweightLogs()
          .observeWithColumns(["weight_kg", "measured_at"])
          .subscribe((rows) => setState({ logs: rows.map(repo.toBodyweightLogLike), loaded: true }));
      })
      .catch(() => !cancelled && setState({ logs: [], loaded: true }));
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, []);
  return state;
}

/** 이력 쓰기 뒤 — 디스크로 내려쓰고 프로필(미러)을 다시 읽는다(useUser().bodyweightKg 가 따라오게) */
export async function afterBodyweightWrite(refresh: () => Promise<void>): Promise<void> {
  const { flushLocalDb } = await import("./localDb");
  await flushLocalDb();
  await refresh();
}
