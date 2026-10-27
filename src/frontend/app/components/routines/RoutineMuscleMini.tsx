"use client";
// @plm SRS-075  루틴 카드 근육 그림 — 오늘 카드(TodayCard)·추천 카드(RecoCard)에만 둔다(목록 줄 RoutineRow 에는 넣지 않음 · U-12)
//
// 두 조각으로 나눈다 — 카드 안 두 자리에 끼우기만 하면 되게(RoutinesClient 는 병렬 세션과 겹치는 파일 · 최소 diff):
//   · RoutineMuscleMini  : 시작 버튼 왼쪽 오른쪽 열의 작은 그림(앞·뒤 · 높이 56px 고정). 로딩 중에도 같은 폭의 빈 자리를 지킨다.
//                          근육이 0 인 루틴(종목 없음·유산소만·근육 미지정)이면 숨긴다 — 오른쪽 열이라 카드 높이는 그대로다.
//   · RoutineMuscleFocus : 글자 줄 「가슴·삼두 중심」(muscleMap.focus). 그림은 aria-hidden 이라 이 글자가 정보를 대신한다.
// 「근육 그림 보기」(liftgram.muscleMap)가 꺼져 있으면 둘 다 아무것도 그리지 않는다(DOM 없음 · 끈 상태 = 기준선).
//
// 둘이 같은 루틴을 따로 조회하지 않게 짧은 공유 캐시(진행 중인 약속을 2초 동안 같이 씀)를 둔다.
// 카드는 조건부로 루틴을 고르는 함수라 카드 안에서 훅을 부를 수 없다 — 그래서 조각마다 훅을 갖는다.
import { useEffect, useState } from "react";
import type { RoutineMuscleSummary } from "@app/core/data/muscleLoadRepository";
import { topMusclesLabel, totalMuscleSets } from "@app/core/domain/muscleLoad";
import { lang, t } from "@/lib/i18n";
import { useMuscleMap } from "@/lib/muscleMapPref";
import { BodyMapMini, bodyMapMiniWidth } from "../ui/BodyMap";
import { AppText } from "../ui/primitives";

const MINI_H = 56;
const SHARE_MS = 2000;
const cache = new Map<string, { at: number; p: Promise<RoutineMuscleSummary | null> }>();

function loadSummary(routineId: string): Promise<RoutineMuscleSummary | null> {
  const hit = cache.get(routineId);
  if (hit && Date.now() - hit.at < SHARE_MS) return hit.p;
  const p = import("@app/core/data/muscleLoadRepository")
    .then((m) => m.routineMuscleSummary(routineId))
    .catch(() => null);
  cache.set(routineId, { at: Date.now(), p });
  return p;
}

/** undefined = 읽는 중 · null = 그릴 것 없음 */
function useRoutineMuscleSummary(routineId: string, on: boolean): RoutineMuscleSummary | null | undefined {
  const [state, setState] = useState<{ id: string; v: RoutineMuscleSummary | null } | null>(null);
  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    void loadSummary(routineId).then((v) => {
      if (!cancelled) setState({ id: routineId, v: v && totalMuscleSets(v.load) > 0 ? v : null });
    });
    return () => {
      cancelled = true;
    };
  }, [routineId, on]);
  return state && state.id === routineId ? state.v : undefined;
}

/** 시작 버튼 왼쪽의 작은 앞·뒤 그림(56px 자리 고정). */
export function RoutineMuscleMini({ routineId }: { routineId: string }) {
  const on = useMuscleMap();
  const s = useRoutineMuscleSummary(routineId, on);
  if (!on || s === null) return null;
  const w = bodyMapMiniWidth(MINI_H);
  return (
    <div
      data-testid="routine-muscle-slot"
      style={{ width: w, height: MINI_H }}
      className="mr-[var(--spacing-md)] flex shrink-0 items-center justify-center"
    >
      {s ? (
        <BodyMapMini
          primary={s.primary}
          secondary={s.secondary}
          height={MINI_H}
          testId="routine-muscle-mini"
        />
      ) : null}
    </div>
  );
}

/** 「가슴·삼두 중심」 글자 줄 — 읽는 중에는 같은 높이의 빈 줄로 자리를 지킨다. */
export function RoutineMuscleFocus({ routineId }: { routineId: string }) {
  const on = useMuscleMap();
  const s = useRoutineMuscleSummary(routineId, on);
  if (!on || s === null) return null;
  const label = s ? topMusclesLabel(s.load, lang) : null;
  return (
    <AppText
      variant="caption"
      color="textMuted"
      className="mt-[2px] block truncate"
      data-testid="routine-muscle-focus"
    >
      {label ? t("muscleMap.focus", { muscles: label }) : " "}
    </AppText>
  );
}
