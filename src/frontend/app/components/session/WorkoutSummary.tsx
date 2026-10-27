"use client";
// @plm SRS-004  운동 완료 요약 — app의 features/session/WorkoutSummaryScreen.tsx를 웹으로
//
// 운동을 마치면 뜨는 화면. 축하 헤더(트로피 · PR 내역) + 핵심 지표 3개.
//
// 값은 하나도 여기서 계산하지 않는다 — `completeWorkout`이 확정해 돌려준 요약을 그대로 놓는다
// (볼륨은 완료한 워킹 세트만, PR은 중량·볼륨 2종 — 전부 도메인 규칙이다).
//
// 아래에 **오운완 공유**가 붙는다 — 피드의 운동 카드를 만드는 유일한 자리다(ShareWorkout).
import { formatEnteredWeight, formatWeight, type WeightUnit } from "@app/core";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";
import { SheetShell } from "../ui/Dialog";
import { QuietAction } from "../ui/quiet";
import { KpiRow, ListGroup, ListRow, SectionLabel } from "../ui/rows";
import { NameRoutine } from "./FinishRoutineSheets";
import { WorkoutNoteField } from "./WorkoutNoteField";
import { useStartGuard } from "../useStartGuard";
import { loadSummaryExtras, ShareWorkout, type BreakdownRow, type ShareablePayload } from "./ShareWorkout";
import { formatWorkoutDuration } from "@/lib/duration";

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
    weightUnit?: "kg" | "lb" | null; // 그 블록에 적은 단위(/qa code M-2) @plm SRS-067
    variantKey?: string | null; // PR 버킷의 기록 칸(P2 /qa code H-1) @plm SRS-070
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
  // [원본] 종목 id 하나로 묶었다 — PR 은 (종목 × 칸) 버킷마다 따로 서서, 같은 종목·다른 브랜드 두 블록이면
  //        뒤 버킷이 앞을 덮고 엉뚱한 줄에 붙었다(P2 /qa code H-1). 원복 시 아래 두 줄을 되살린다.
  // const prByExercise = new Map(summary.prs.map((d) => [d.exerciseId, d]));
  // [개선] (종목 × 칸) 버킷으로 짝짓는다. 같은 버킷이 두 블록(슈퍼셋·중복)이면 첫 줄에 한 번만 단다.
  const bucketOf = (exerciseId: string, variantKey: string | null | undefined) =>
    `${exerciseId}::${variantKey ?? ""}`;
  const prByBucket = new Map(summary.prs.map((d) => [bucketOf(d.exerciseId, d.variantKey), d]));
  const prShown = new Set<string>();
  const [openPr, setOpenPr] = useState<string | null>(null); // 「PR n」 을 누르면 그 줄 아래에 무엇을 얼마로 깼는지(M-3)
  const [sharing, setSharing] = useState(false); // 공유 시트 — 한마디 입력은 시트 안(D5)
  const [shared, setShared] = useState(false); // 한 번 올리면 시트를 다시 열어도 버튼이 잠긴 채
  const [shareBusy, setShareBusy] = useState(false); // 올리는 중 — 시트를 닫았다 열어 두 번 올리지 않게(M-1)
  const [caption, setCaption] = useState(""); // 공유 한마디 — 시트를 닫아도 남는다(L-1)
  const done = routineMade || routineSaved;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col p-[var(--spacing-lg)]" data-testid="summary-body">
        {/* 축하는 위에 짧게(시안 04) — PR 수는 아래 숫자 줄로, 깬 기록은 종목 줄 오른쪽 금색으로(D5). */}
        <div className="flex flex-col items-center pt-[var(--spacing-md)]">
          <Icon name="trophy" size={36} color="var(--color-pr)" />
          <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-sm)] block">
            {today}
          </AppText>
          <AppText variant="title" center className="mt-[2px] block">
            {t("session.workoutComplete")}
          </AppText>
          {/* PR 수 — 상자 없는 금색 글자 한 줄(색 의미: 금색 = PR · D5) */}
          {summary.prCount > 0 ? (
            <AppText
              variant="caption"
              className="mt-[var(--spacing-xs)] block font-semibold text-(--color-pr)"
            >
              {t("session.prCount", { count: summary.prCount })}
            </AppText>
          ) : null}
          {/* [원본] PR 갱신 n회 배지(Tag 상자) — 상자를 걷어 내고 위 금색 글자로(D5)
          {summary.prCount > 0 ? (
            <div className="mt-[var(--spacing-sm)]">
              <Tag label={t("session.prCount", { count: summary.prCount })} tone="pr" />
            </div>
          ) : null} */}
        </div>

        {/* 숫자 셋 — 볼륨·시간·세트(PR 수는 위 금색 글자 한 줄 · 4칸이면 360 폭에서 다섯 자리 볼륨이 넘친다). */}
        <div className="mt-[var(--spacing-lg)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) py-[var(--spacing-lg)]">
          <KpiRow
            items={[
              {
                label: t("session.totalVolume"),
                value: formatWeight(summary.totalVolumeKg, unit),
                testId: "summary-volume",
              },
              // [원본] { label: t("session.duration"), value: duration(summary.durationSeconds), testId: "summary-duration" },
              // [개선] 1분 미만이면 칸을 뺀다(「00:00」 금지 · P3 QA M1) @plm SRS-071
              ...(formatWorkoutDuration(summary.durationSeconds)
                ? [
                    {
                      label: t("session.duration"),
                      value: formatWorkoutDuration(summary.durationSeconds),
                      testId: "summary-duration",
                    },
                  ]
                : []),
              { label: t("session.setCount"), value: String(summary.workingSets), testId: "summary-sets" },
            ]}
          />
        </div>
        <span className="hidden" data-testid="summary-prs">
          {summary.prCount}
        </span>

        {/* [원본] 「이번에 깬 기록」 목록 — 종목 × (중량·볼륨) 두 줄씩 종목 이름이 반복됐다(4종목 = 8줄 · D5).
            원복 시 커밋 2c7735c 의 이 자리를 되살린다. 이제 그 사실은 아래 종목 줄 오른쪽 「PR n」 하나로 말한다. */}

        {/* 종목별 — 무엇을 얼마나 했는지 + 깬 기록 수. 1RM 은 회색 보조 글자·그 블록에 적은 단위(F5). */}
        <SectionLabel className="mt-[var(--spacing-xl)]" title={t("session.perExerciseRecords")} />
        {extras && extras.breakdown.length === 0 ? (
          <AppText variant="caption" color="textMuted">
            {t("session.noExercisesRecorded")}
          </AppText>
        ) : (
          // `summary-pr-list` 는 PR 목록이 있던 자리의 testid — 이제 PR 이 이 종목 줄 안에 산다(스펙 P2)
          <div data-testid="summary-pr-list">
            <ListGroup testId="summary-breakdown">
              {extras?.breakdown.map((ex) => {
                const bucket = bucketOf(ex.exerciseId, ex.variantKey);
                const pr = !prShown.has(bucket) ? prByBucket.get(bucket) : undefined;
                if (pr) prShown.add(bucket);
                const n = pr?.prs.length ?? 0;
                const open = openPr === ex.id && n > 0;
                // 중량 PR 은 그 블록에 적은 단위·숫자 그대로, 볼륨은 kg(Q2 A) — 옛 목록과 같은 규칙
                const show = (type: string, v: number) =>
                  type === "maxWeight" && pr?.weightUnit === "lb"
                    ? formatEnteredWeight(v, "lb")
                    : formatWeight(v, unit);
                const prText = (pr?.prs ?? [])
                  .map(
                    (p) =>
                      `${t(p.type === "maxWeight" ? "session.prTypeWeight" : "session.prTypeVolume")} ${show(p.type, p.current)}${
                        p.previous > 0 ? ` (${t("session.prPrev", { value: show(p.type, p.previous) })})` : ""
                      }`,
                  )
                  .join(" · ");
                return (
                  <ListRow
                    key={ex.id}
                    testId="summary-row"
                    title={ex.name}
                    wrapSubtitle
                    subtitle={
                      <>
                        {/* 같은 종목이 다른 칸으로 두 줄이면 칸 이름으로 구분한다(H-1) */}
                        {/* 칸 이름·lb 입력은 윗줄 하나로(lb 블록이면 볼륨 kg·1RM lb 가 섞인 이유를 밝힌다 · M-2) */}
                        {ex.slotLabel || ex.weightUnit === "lb" ? (
                          <span className="block">
                            {ex.slotLabel ? <span data-testid="summary-row-slot">{ex.slotLabel}</span> : null}
                            {ex.slotLabel && ex.weightUnit === "lb" ? " · " : null}
                            {ex.weightUnit === "lb" ? (
                              <span data-testid="summary-row-lb">{t("summary.lbEntered")}</span>
                            ) : null}
                          </span>
                        ) : null}
                        {/* 조각 단위로만 줄을 바꾼다 — 「볼륨 / 338kg」 처럼 값이 쪼개지지 않게 */}
                        <span className="whitespace-nowrap">
                          {t("session.exerciseSetsVolume", {
                            count: ex.setCount,
                            volume: formatWeight(ex.volumeKg, unit),
                          })}
                          {/* 구분점은 앞 조각 끝에 — 줄이 바뀌어도 다음 줄이 「·」 로 시작하지 않게 */}
                          {ex.best1RM > 0 ? " ·" : null}
                        </span>
                        {ex.best1RM > 0 ? (
                          <span
                            className="whitespace-nowrap text-(--color-ink3)"
                            data-testid="summary-row-1rm"
                          >
                            {` ${t("summary.oneRm", {
                              // [원본] formatWeight(ex.best1RM, unit) — lb 블록도 kg 로 보였다(F5)
                              value: formatWeight(ex.best1RM, ex.weightUnit),
                            })}`}
                          </span>
                        ) : null}
                        {open ? (
                          <span
                            className="mt-[2px] block font-medium text-(--color-pr)"
                            data-testid="summary-row-pr-detail"
                          >
                            {prText}
                          </span>
                        ) : null}
                      </>
                    }
                    value={
                      n > 0 ? (
                        // 누르면 무엇을 얼마로 깼는지 펼친다(기본 접힘 · M-3). 읽어 주는 글에는 값까지 싣는다.
                        <button
                          type="button"
                          data-testid="summary-row-pr"
                          aria-expanded={open}
                          aria-label={`${t("summary.prShort", { count: n })} — ${prText}`}
                          onClick={() => setOpenPr(open ? null : ex.id)}
                          className="-my-[10px] -mr-[6px] inline-flex min-h-[44px] min-w-[44px] items-center justify-end gap-[2px] px-[6px] font-semibold text-(--color-pr)"
                        >
                          {t("summary.prShort", { count: n })}
                          <Icon
                            name={open ? "chevron-up" : "chevron-down"}
                            size={14}
                            color="var(--color-pr)"
                          />
                        </button>
                      ) : undefined
                    }
                  />
                );
              })}
            </ListGroup>
          </div>
        )}
        {extras?.breakdown.some((ex) => ex.best1RM > 0) ? (
          <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-xs)] block">
            {t("wellness.oneRepMaxCaption")}
          </AppText>
        ) : null}

        {/* 부가 행동 한 줄 — 루틴 저장 · 다시 시작 · 공유(D5). 주 행동은 아래 「완료」 하나뿐.
            [원본] 루틴 만들기·다시 시작이 각각 전체 폭 버튼, 공유는 한마디 입력과 함께 화면 끝에 있었다(세로로 3화면). */}
        {summary.workingSets > 0 ? (
          <div className="mt-[var(--spacing-lg)] flex gap-[var(--spacing-xs)]" data-testid="summary-actions">
            {/* 방금 마친 운동 그대로 루틴으로(#59 일부) — 빠른 운동이면 완료 직후에도 묻는다. @plm SRS-060 */}
            <QuietAction
              icon={done ? "checkmark" : "list-outline"}
              label={done ? t("summary.actionMadeRoutine") : t("summary.actionMakeRoutine")}
              ariaLabel={done ? t("finish.madeRoutine") : t("finish.makeRoutine")}
              testId="btn-summary-make-routine"
              disabled={done}
              done={done}
              onPress={() => setMakeRoutine(true)}
            />
            {/* 같은 구성으로 한 번 더(#59) — 무게는 이전 기록(방금 한 것)으로 채운다 @plm SRS-065 */}
            <QuietAction
              icon="play"
              label={t("summary.actionReplay")}
              ariaLabel={t("replay.start")}
              testId="btn-summary-replay"
              busy={replay.busy}
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
            {/* 피드 공유 — 한마디 입력은 시트 안(요약 화면에 입력칸이 둘이던 것 · D5) */}
            <QuietAction
              icon={shared ? "checkmark" : "share-social-outline"}
              label={shared ? t("summary.actionShared") : t("summary.actionShare")}
              ariaLabel={shared ? t("session.sharedToFeed") : t("session.shareToFeed")}
              testId="btn-summary-share"
              disabled={!extras || shared || shareBusy}
              busy={shareBusy}
              done={shared}
              onPress={() => setSharing(true)}
            />
          </div>
        ) : null}

        {/* 운동 총평 — 나만 본다 · 피드 글과 별개(#52) @plm SRS-064 */}
        <WorkoutNoteField workoutId={summary.workoutId} initial={null} />
      </div>

      {sharing && extras ? (
        <SheetShell
          title={t("summary.shareSheetTitle")}
          // 올리는 중에는 닫지 않는다 — 닫았다 다시 열면 두 번 올릴 수 있었다(M-1)
          onClose={() => {
            if (!shareBusy) setSharing(false);
          }}
          hideOk
          testId="share-sheet"
        >
          {/* 방금 마친 운동을 피드에 올린다. 계정이 없으면 그 사실을 알리고 아무것도 하지 않는다. */}
          <ShareWorkout
            payload={extras.share}
            unit={unit}
            inSheet
            shared={shared}
            onBusyChange={setShareBusy}
            caption={caption}
            onCaptionChange={setCaption}
            onShared={() => {
              setShared(true);
              setSharing(false); // 올렸으면 시트를 닫는다 — 요약의 「공유」 가 「공유했어요」 로 잠긴다
            }}
          />
        </SheetShell>
      ) : null}

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
// biome-ignore lint/correctness/noUnusedVariables: 원복용 보존(코드 변경 보존 규칙)
function duration(seconds: number | null): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
