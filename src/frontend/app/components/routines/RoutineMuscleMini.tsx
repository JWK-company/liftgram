"use client";
// @plm SRS-075  루틴 카드 근육 그림 — 오늘 카드(TodayCard)·추천 카드(RecoCard)에만 둔다(목록 줄 RoutineRow 에는 넣지 않음 · U-12)
//
// 두 조각으로 나눈다 — 카드 안 두 자리에 끼우기만 하면 되게(RoutinesClient 는 병렬 세션과 겹치는 파일 · 최소 diff):
//   · RoutineMuscleMini  : 오른쪽 열 「시작」 버튼 **아래**의 작은 앞·뒤 그림(높이 40px 고정 · /qa P2-2).
//                          예전에는 버튼 왼쪽(56px)이라 360 폭에서 루틴 이름 칸이 177 → 123px 로 줄었다. 버튼 아래로 옮기면
//                          그림 폭(≈32px)이 버튼 폭 안에 들어가 이름 칸은 끈 상태와 같다.
//                          읽는 중에는 같은 크기의 빈 자리를 지킨다(근육 있는 루틴이 대부분 — 카드 높이가 흔들리지 않게).
//                          근육이 0 인 루틴(종목 없음·유산소만·근육 미지정)이면 숨긴다.
//   · RoutineMuscleFocus : 글자 줄 「가슴·삼두 중심」(muscleMap.focus). 그림은 aria-hidden 이라 이 글자가 정보를 대신한다.
//                          결과를 받기 전에는 그리지 않는다(/qa P2-9 — 예전에는 빈 줄로 자리를 잡았다가 근육 0 이면 사라져 카드가 줄었다).
// 「근육 그림 보기」(liftgram.muscleMap)가 꺼져 있으면 둘 다 아무것도 그리지 않는다(DOM 없음 · 끈 상태 = 기준선).
//
// 조회: 루틴 종목 줄을 구독해(watchRoutineExercises) 종목·계획 세트가 바뀌면 다시 센다(다른 기기 동기 포함 · /qa P2-9).
// 두 조각이 같은 루틴을 따로 세지 않게 서명(종목·세트)별 짧은 공유 캐시(2초)를 둔다. 마지막 결과는 루틴별로 기억해
// 홈을 다시 열 때 그 값으로 먼저 그린다(자리 흔들림 없음 → 새 값이 오면 바꾼다).
// 카드는 조건부로 루틴을 고르는 함수라 카드 안에서 훅을 부를 수 없다 — 그래서 조각마다 훅을 갖는다.
import { useEffect, useState } from "react";
import type { RoutineMuscleSummary } from "@app/core/data/muscleLoadRepository";
import { topMusclesLabel, totalMuscleSets } from "@app/core/domain/muscleLoad";
import { lang, t } from "@/lib/i18n";
import { useMuscleMap } from "@/lib/muscleMapPref";
import { BodyMapMini, bodyMapMiniWidth } from "../ui/BodyMap";
import { AppText } from "../ui/primitives";

// [원본] const MINI_H = 56; — 시작 버튼 왼쪽 자리(360 이름 칸 잘림 · /qa P2-2)
const MINI_H = 40;
const SHARE_MS = 2000;
type Summary = RoutineMuscleSummary | null;
const cache = new Map<string, { at: number; p: Promise<Summary> }>();
/** 루틴 id → 마지막으로 받은 결과(홈을 다시 열 때 먼저 그린다) */
const lastByRoutine = new Map<string, Summary>();

function loadSummary(routineId: string, signature: string): Promise<Summary> {
  const key = `${routineId}|${signature}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < SHARE_MS) return hit.p;
  const p = import("@app/core/data/muscleLoadRepository")
    .then((m) => m.routineMuscleSummary(routineId))
    .then((v) => {
      const out = v && totalMuscleSets(v.load) > 0 ? v : null;
      lastByRoutine.set(routineId, out);
      return out;
    })
    .catch(() => null);
  cache.set(key, { at: Date.now(), p });
  return p;
}

/** undefined = 읽는 중 · null = 그릴 것 없음 */
function useRoutineMuscleSummary(routineId: string, on: boolean): Summary | undefined {
  const [state, setState] = useState<{ id: string; v: Summary } | null>(null);
  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    let unsub: (() => void) | null = null;
    void import("@app/core/data/muscleLoadRepository")
      .then((m) => {
        if (cancelled) return;
        unsub = m.watchRoutineExercises(routineId, (sig) => {
          void loadSummary(routineId, sig).then((v) => {
            if (!cancelled) setState({ id: routineId, v });
          });
        });
      })
      .catch(() => {
        if (!cancelled) setState({ id: routineId, v: null });
      });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [routineId, on]);
  if (state && state.id === routineId) return state.v;
  return lastByRoutine.has(routineId) ? lastByRoutine.get(routineId) : undefined;
}

/** 「시작」 버튼 아래의 작은 앞·뒤 그림(40px 자리 고정). 오른쪽 열(버튼과 같은 열)에 둔다. */
export function RoutineMuscleMini({ routineId }: { routineId: string }) {
  const on = useMuscleMap();
  const s = useRoutineMuscleSummary(routineId, on);
  if (!on || s === null) return null;
  const w = bodyMapMiniWidth(MINI_H);
  return (
    <div
      data-testid="routine-muscle-slot"
      style={{ width: w, height: MINI_H }}
      className="mt-[var(--spacing-xs)] flex shrink-0 items-center justify-center"
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

/** 「가슴·삼두 중심」 글자 줄 — 결과를 받은 뒤에만 그린다(근육 0 이면 없음). */
export function RoutineMuscleFocus({ routineId }: { routineId: string }) {
  const on = useMuscleMap();
  const s = useRoutineMuscleSummary(routineId, on);
  if (!on || !s) return null;
  const label = topMusclesLabel(s.load, lang);
  if (!label) return null;
  return (
    <AppText
      variant="caption"
      color="textMuted"
      className="mt-[2px] block truncate"
      data-testid="routine-muscle-focus"
    >
      {t("muscleMap.focus", { muscles: label })}
    </AppText>
  );
}
