"use client";
// @plm SRS-065  새 운동을 시작하기 전 「진행 중인 운동」 가드 — 기록 상세·요약·피드가 같이 쓴다(QA R2)
//
// 운동은 하나만 진행할 수 있다. 그냥 덮어쓰면 기록이 소리 없이 사라지므로 운동 탭과 같이
// 「이어서 하기 / 폐기하고 새로 시작」을 고르게 한다. 시작에 성공하면 기기 DB 를 내려쓰고 운동 화면으로 간다.
//
// 운동 탭(RoutinesClient)은 같은 시트를 자기 바쁨 표시·목록 갱신과 묶어 쓰고 있어 그대로 둔다 — 문구·testid 는 같다.
import { type ReactNode, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { navigate } from "@/lib/nav";
import { useSession } from "./SessionProvider";
import { useToast } from "./Toast";
import { ActionSheet } from "./ui/Dialog";

type Started = { id: string; startedAt: number; name: string | null };
/**
 * 새 운동을 만든다. `replacing` 이 있으면 저장소가 **새 운동을 만든 같은 write 안에서** 그 운동을 지운다
 * (QA H-1 — 먼저 지우고 시작이 실패하면 진행 중이던 운동만 사라졌다).
 */
type StartFn = (replacing: string | null) => Promise<Started>;

export function useStartGuard(
  opts: {
    /** 시작한 뒤 할 일 — 주면 운동 화면으로 옮기지 않는다(이미 운동 화면 안의 요약에서 시작할 때). */
    onStarted?: (w: Started) => void;
  } = {},
): {
  /** start 는 새 운동을 만들어 돌려준다 — 성공하면 셸에 알리고 운동 화면으로 간다. */
  guard: (start: StartFn) => void;
  busy: boolean;
  sheet: ReactNode;
} {
  const { activeWorkoutId, setActive } = useSession();
  const toast = useToast();
  const [pending, setPending] = useState<null | StartFn>(null);
  const [busy, setBusy] = useState(false);
  // 연타 가드 — state 는 다음 렌더까지 옛 값이라 ref 로 함께 잡는다(QA L-4)
  const busyRef = useRef(false);

  const run = async (start: StartFn, replacing: string | null) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      // [원본] 먼저 폐기하고 시작 — 시작이 실패하면 진행 중이던 운동만 사라졌다(QA H-1)
      // if (discardFirst && activeWorkoutId) { await repo.discardWorkout(activeWorkoutId).catch(() => {}); setActive(null); }
      // [개선] 바꿀 운동 id 를 넘기고, 저장소가 새 운동과 같은 write 에서 지운다
      const w = await start(replacing);
      setActive({ id: w.id, startedAt: w.startedAt, name: w.name });
      if (opts.onStarted) {
        const { flushLocalDb } = await import("@/lib/localDb");
        await flushLocalDb();
        opts.onStarted(w);
        return;
      }
      const { navigateAfterFlush } = await import("@/lib/localDb");
      await navigateAfterFlush("/workout");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const known: Record<string, string> = {
        NOTHING_TO_REPLAY: t("replay.nothing"),
        ACTIVE_EXISTS: t("replay.activeExists"),
        NOTHING_MATCHED: t("replay.nothingMatched"),
      };
      toast(known[msg] ?? msg, "error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const guard = (start: StartFn) => {
    if (!activeWorkoutId) {
      void run(start, null);
      return;
    }
    setPending(() => start);
  };

  const sheet = pending ? (
    <ActionSheet
      testId="active-exists"
      title={t("routines.activeExistsTitle")}
      onClose={() => setPending(null)}
      options={[
        {
          label: t("routines.resumeInstead"),
          onPress: () => {
            setPending(null);
            navigate("/workout");
          },
        },
        {
          label: t("routines.discardAndStart"),
          destructive: true,
          onPress: () => {
            const start = pending;
            setPending(null);
            void run(start, activeWorkoutId);
          },
        },
      ]}
    />
  ) : null;

  return { guard, busy, sheet };
}
