// @plm SRS-076  카탈로그 `?muscle=<g>` ↔ 부위 칩 상태(양방향)
//
// 통계 「이 기간에 안 한 근육」 칩이 /exercises?muscle=calves 로 보낸다. 카탈로그는 처음 열 때 쿼리를 읽어 부위 필터를 켜고,
// 그 뒤 칩을 바꾸면 주소의 쿼리도 바꾼다(replaceState — 뒤로 가기 기록을 늘리지 않는다). 새로고침·공유해도 같은 필터로 열린다.
// 브라우저 뒤로/앞으로(popstate)로 쿼리가 바뀌면 칩도 따른다.
// CatalogClient 에는 이 훅을 부르는 한 줄만 둔다(병렬 세션과 겹치는 파일 · 최소 diff).
import { ALL_MUSCLE_GROUPS, type MuscleGroup } from "@app/core";
import { useEffect, useRef } from "react";

export const MUSCLE_QUERY = "muscle";

/** 주소의 muscle 쿼리 — 모르는 값은 무시(null) */
export function readMuscleQuery(search: string): MuscleGroup | null {
  const v = new URLSearchParams(search).get(MUSCLE_QUERY);
  return v && (ALL_MUSCLE_GROUPS as readonly string[]).includes(v) ? (v as MuscleGroup) : null;
}

export function useMuscleQuerySync(muscle: MuscleGroup | "", setMuscle: (m: MuscleGroup | "") => void): void {
  const applied = useRef(false);
  const setRef = useRef(setMuscle);
  setRef.current = setMuscle;

  // 처음 한 번: 쿼리 → 칩. 칩 줄이 가로로 넘치므로 고른 칩을 보이게 굴린다.
  useEffect(() => {
    const m = readMuscleQuery(window.location.search);
    if (m) {
      setRef.current(m);
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-testid="chip-muscle-${m}"]`)
          ?.scrollIntoView({ block: "nearest", inline: "center" });
      });
    }
    applied.current = true;
    const onPop = () => setRef.current(readMuscleQuery(window.location.search) ?? "");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // 칩 → 쿼리(처음 적용 전에는 쓰지 않는다 — 빈 상태로 쿼리를 지워 버리지 않게)
  useEffect(() => {
    if (!applied.current) return;
    const url = new URL(window.location.href);
    const cur = url.searchParams.get(MUSCLE_QUERY) ?? "";
    if (cur === muscle) return;
    if (muscle) url.searchParams.set(MUSCLE_QUERY, muscle);
    else url.searchParams.delete(MUSCLE_QUERY);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [muscle]);
}
