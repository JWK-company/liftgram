"use client";
// @plm SRS-004  운동 완료 요약 — app의 features/session/WorkoutSummaryScreen.tsx를 웹으로
//
// 운동을 마치면 뜨는 화면. 축하 헤더(트로피 · PR 내역) + 핵심 지표 3개.
//
// 값은 하나도 여기서 계산하지 않는다 — `completeWorkout`이 확정해 돌려준 요약을 그대로 놓는다
// (볼륨은 완료한 워킹 세트만, PR은 중량·볼륨 2종 — 전부 도메인 규칙이다).
//
// 아래에 **오운완 공유**가 붙는다 — 피드의 운동 카드를 만드는 유일한 자리다(ShareWorkout).
import { formatWeight, type WeightUnit } from "@app/core";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { AppText, Tag } from "../ui/primitives";
import { KpiRow, ListGroup, ListRow, SectionLabel } from "../ui/rows";
import { NameRoutine } from "./FinishRoutineSheets";
import { WorkoutNoteField } from "./WorkoutNoteField";
import { useStartGuard } from "../useStartGuard";
import { loadSummaryExtras, ShareWorkout, type BreakdownRow, type ShareablePayload } from "./ShareWorkout";

export interface Summary {
  workoutId: string;
  totalVolumeKg: number;
  durationSeconds: number;
  workingSets: number;
  prCount: number;
  prs: {
    exerciseId: string;
    exerciseName: string;
    prs: { type: string; previous: number; current: number }[];
  }[];
}

export function WorkoutSummary({
  summary,
  unit,
  onClose,
  routineSaved = false,
  onReplayStarted,
}: {
  summary: Summary;
  unit: WeightUnit;
  onClose: () => void;
  /** 「그대로 다시 시작」으로 새 운동이 시작됐다 — 운동 화면이 요약을 닫고 그 운동을 띄운다. @plm SRS-065 */
  onReplayStarted?: (w: { id: string; startedAt: number; name: string | null }) => void;
  /** 완료 시트에서 이미 새 루틴으로 저장했다(QA L5). */
  routineSaved?: boolean;
}) {
  // 종목별 분해와 공유용 한 벌은 **같은 조회**에서 나온다(요약에는 둘 다 없다).
  const [extras, setExtras] = useState<{ share: ShareablePayload; breakdown: BreakdownRow[] } | null>(null);
  const [makeRoutine, setMakeRoutine] = useState(false); // 「이 운동으로 루틴 만들기」 @plm SRS-060
  const [routineMade, setRoutineMade] = useState(false); // 여기서 저장했다(QA L5)
  const replay = useStartGuard({ onStarted: onReplayStarted }); // @plm SRS-065
  useEffect(() => {
    let alive = true;
    void loadSummaryExtras(summary).then((x) => alive && setExtras(x));
    return () => {
      alive = false;
    };
  }, [summary]);

  const today = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
        {/* 축하는 위에 짧게(시안 04) — 깬 기록은 아래 목록으로 읽힌다. */}
        <div className="flex flex-col items-center pt-[var(--spacing-md)]">
          <Icon name="trophy" size={36} color="var(--color-pr)" />
          <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-sm)] block">
            {today}
          </AppText>
          <AppText variant="title" center className="mt-[2px] block">
            {t("session.workoutComplete")}
          </AppText>
          {summary.prCount > 0 ? (
            <div className="mt-[var(--spacing-sm)]">
              <Tag label={t("session.prCount", { count: summary.prCount })} tone="pr" />
            </div>
          ) : null}
        </div>

        {/* 숫자 상자 셋 → 한 줄(같은 무게의 숫자는 칸 나눔으로). */}
        <div className="mt-[var(--spacing-lg)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) py-[var(--spacing-lg)]">
          <KpiRow
            items={[
              {
                label: t("session.totalVolume"),
                value: formatWeight(summary.totalVolumeKg, unit),
                testId: "summary-volume",
              },
              {
                label: t("session.duration"),
                value: duration(summary.durationSeconds),
                testId: "summary-duration",
              },
              { label: t("session.setCount"), value: String(summary.workingSets), testId: "summary-sets" },
            ]}
          />
        </div>
        <span className="hidden" data-testid="summary-prs">
          {summary.prCount}
        </span>

        {/* 이번에 깬 기록 — "벤치프레스 · 중량  105kg (이전 100kg)". */}
        {summary.prs.length > 0 ? (
          <>
            <SectionLabel
              className="mt-[var(--spacing-xl)]"
              title={t("session.prCount", { count: summary.prCount })}
            />
            <ListGroup testId="summary-pr-list">
              {summary.prs.flatMap((d) =>
                d.prs.map((p) => (
                  <ListRow
                    key={`${d.exerciseId}_${p.type}`}
                    leading={<Icon name="trophy" size={18} color="var(--color-pr)" />}
                    title={`${d.exerciseName} · ${t(
                      p.type === "maxWeight" ? "session.prTypeWeight" : "session.prTypeVolume",
                    )}`}
                    subtitle={
                      p.previous > 0
                        ? t("session.prPrev", { value: formatWeight(p.previous, unit) })
                        : undefined
                    }
                    value={
                      <span className="font-bold text-(--color-pr)">{formatWeight(p.current, unit)}</span>
                    }
                  />
                )),
              )}
            </ListGroup>
          </>
        ) : null}

        {/* 종목별 — 무엇을 얼마나 했는지. 요약 숫자만으로는 다음에 뭘 올릴지 못 정한다. */}
        <SectionLabel className="mt-[var(--spacing-xl)]" title={t("session.perExerciseRecords")} />
        {extras && extras.breakdown.length === 0 ? (
          <AppText variant="caption" color="textMuted">
            {t("session.noExercisesRecorded")}
          </AppText>
        ) : (
          <ListGroup testId="summary-breakdown">
            {extras?.breakdown.map((ex) => (
              <ListRow
                key={ex.id}
                title={ex.name}
                subtitle={t("session.exerciseSetsVolume", {
                  count: ex.setCount,
                  volume: formatWeight(ex.volumeKg, unit),
                })}
                value={
                  ex.best1RM > 0 ? (
                    // 추정값임을 함께 적는다 — 실제로 든 무게가 아니다(웰니스 규약).
                    <span className="flex flex-col items-end">
                      <span className="font-bold text-(--color-brand)">{formatWeight(ex.best1RM, unit)}</span>
                      <span className="text-(--color-ink3) text-[length:var(--text-xs)]">
                        {t("wellness.oneRepMaxLabel")}
                      </span>
                    </span>
                  ) : undefined
                }
              />
            ))}
          </ListGroup>
        )}
        {extras?.breakdown.some((ex) => ex.best1RM > 0) ? (
          <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-xs)] block">
            {t("wellness.oneRepMaxCaption")}
          </AppText>
        ) : null}

        {/* 방금 마친 운동 그대로 루틴으로(#59 일부) — 빠른 운동이면 완료 직후에도 묻는다. @plm SRS-060 */}
        {summary.workingSets > 0 ? (
          <div className="mt-[var(--spacing-lg)]">
            <Button
              title={routineMade || routineSaved ? t("finish.madeRoutine") : t("finish.makeRoutine")}
              variant="secondary"
              icon={routineMade || routineSaved ? "checkmark" : "list-outline"}
              testId="btn-summary-make-routine"
              disabled={routineMade || routineSaved}
              onPress={() => setMakeRoutine(true)}
            />
          </div>
        ) : null}

        {/* 같은 구성으로 한 번 더(#59) — 무게는 이전 기록(방금 한 것)으로 채운다 @plm SRS-065 */}
        {summary.workingSets > 0 ? (
          <div className="mt-[var(--spacing-sm)]">
            <Button
              title={t("replay.start")}
              variant="secondary"
              icon="play"
              testId="btn-summary-replay"
              loading={replay.busy}
              onPress={() =>
                replay.guard(async (replacing) => {
                  const repo = await import("@app/core/data/workoutRepository");
                  return (await repo.startWorkoutFromWorkout(summary.workoutId, {
                    replacing,
                  })) as unknown as {
                    id: string;
                    startedAt: number;
                    name: string | null;
                  };
                })
              }
            />
          </div>
        ) : null}

        {/* 운동 총평 — 나만 본다 · 피드 글과 별개(#52) @plm SRS-064 */}
        <WorkoutNoteField workoutId={summary.workoutId} initial={null} />

        {/* 방금 마친 운동을 피드에 올린다. 계정이 없으면 그 사실을 알리고 아무것도 하지 않는다. */}
        {extras ? (
          <div className="mt-[var(--spacing-xl)]">
            <ShareWorkout payload={extras.share} unit={unit} />
          </div>
        ) : null}
      </div>

      {replay.sheet}

      {makeRoutine ? (
        <NameRoutine
          workoutId={summary.workoutId}
          onCancel={() => setMakeRoutine(false)}
          onDone={(saved) => {
            setMakeRoutine(false);
            if (saved) setRoutineMade(true);
          }}
        />
      ) : null}

      {/* 하단 고정 — 할 일은 「완료」 하나. app은 여기서 탭으로 돌아간다 — 웹에서는 이 화면 자체가 세션 경로라 요약만 닫는다. */}
      <div className="sticky bottom-0 border-(--color-line) border-t bg-(--color-surface) p-[var(--spacing-md)] pb-[calc(var(--spacing-md)+env(safe-area-inset-bottom))]">
        <Button title={t("common.done")} testId="btn-summary-close" onPress={onClose} />
      </div>
    </div>
  );
}

/** `MM:SS` — app과 같이 분도 두 자리로 채운다. */
function duration(seconds: number | null): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
