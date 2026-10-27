"use client";
// @plm SRS-079 SRS-080 ADR-040  트레이너 회원 리포트 — 서버는 동의 범위의 원본만 주고(GetMemberRecords), 계산은 이 기기의 core 가 한다.
//
// 회원 요약과 **같은 계산 한 벌**(memberReportFromRecords → buildPeriodSummary)이라 세션 수·총 볼륨(캐시)·부위별 세트가 같다.
// 트레이너 쪽 규칙(core summaryRecords 머리 주석): 체중 없이(맨몸 = 가중분) · 새 기록은 개수만 · 체중 섹션 없음.
// 시드 종목은 응답에 없다 → 이 기기 카탈로그를 catalog 로 넘긴다(읽기만).
// 원본 응답과 계산 결과는 **이 컴포넌트 상태에만** 둔다 — Watermelon·localStorage·IndexedDB 어디에도 쓰지 않는다(S-20).
// 기간 기본값 4주(360 기기에서 1년 표본 계산 시간 — p4-ui-report.md).
import type { Peer } from "@app/contracts";
import { Code, ConnectError } from "@connectrpc/connect";
import type { WeightUnit } from "@app/core";
import {
  buildPeriodSummary,
  summaryRange,
  type SummaryPreset,
  type SummaryV1,
} from "@app/core/domain/periodSummary";
import { memberReportFromRecords } from "@app/core/domain/summaryRecords";
import { parseSummaryV1 } from "@app/core/domain/summarySchema";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { coachingClient } from "@/lib/coachingClient";
import { Panel } from "../coaching/Panel";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { AppText } from "../ui/primitives";
import { Segmented } from "../ui/rows";
import { SummaryView } from "./SummaryView";

type ReportState =
  | { kind: "loading" }
  | { kind: "ok"; summary: SummaryV1; names: Map<string, string>; computeMs: number; rows: number }
  | { kind: "tooLarge" }
  | { kind: "ended" }
  | { kind: "error" };

const PRESETS: { value: SummaryPreset; label: string }[] = [
  { value: "7d", label: t("progressSummary.preset7d") },
  { value: "4w", label: t("progressSummary.preset4w") },
  { value: "3m", label: t("progressSummary.preset3m") },
];

export function MemberReportDialog({
  peer,
  unit,
  onClose,
}: {
  peer: Peer;
  unit: WeightUnit;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<SummaryPreset>("4w");
  const [state, setState] = useState<ReportState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 는 다시 시도 방아쇠다
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    const range = summaryRange(preset, Date.now());
    void (async () => {
      try {
        const res = await coachingClient().getMemberRecords({
          memberId: peer.id,
          periodStart: BigInt(range.startMs),
          periodEnd: BigInt(range.endMs),
        });
        const t0 = performance.now();
        const { loadSummaryCatalog } = await import("@app/core/data/periodSummaryRepository");
        const catalog = await loadSummaryCatalog();
        const built = buildPeriodSummary(memberReportFromRecords(res, range, { catalog }));
        // 회원이 보낸 요약과 같은 거름(parseSummaryV1) — 그리는 모양을 하나로
        const summary = parseSummaryV1(built);
        const computeMs = Math.round(performance.now() - t0); // 카탈로그 읽기 + 계산(측정)
        if (cancelled) return;
        if (!summary) {
          setState({ kind: "error" });
          return;
        }
        // [원본] const names = new Map<string, string>(); for (const e of catalog) names.set(e.id, e.nameKo);
        // [개선] 보는 사람 언어의 표시 이름(받은 카드 SummaryOpen 과 같은 함수 · P4U-13). 못 읽으면 스냅샷 이름.
        const ids = [
          ...(summary.topExercises ?? []).map((x) => x.exerciseId),
          ...(summary.prs ?? []).map((p) => p.exerciseId),
        ];
        let names = new Map<string, string>();
        if (ids.length) {
          try {
            const { getExerciseDisplayNameMap } = await import("@app/core/data/exerciseNames");
            names = await getExerciseDisplayNameMap(ids);
          } catch {
            names = new Map();
          }
        }
        if (cancelled) return;
        setState({
          kind: "ok",
          summary,
          names,
          computeMs,
          rows: res.workouts.length + res.workoutExercises.length + res.setLogs.length + res.exercises.length,
        });
      } catch (e) {
        if (cancelled) return;
        const code = ConnectError.from(e).code;
        setState({
          kind:
            code === Code.ResourceExhausted ? "tooLarge" : code === Code.PermissionDenied ? "ended" : "error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [peer.id, preset, attempt]);

  return (
    <Panel
      testId="coaching-report-view"
      title={t("progressSummary.reportTitle", { name: peer.displayName || "?" })}
      onClose={onClose}
      actions={<Button title={t("common.ok")} variant="secondary" onPress={onClose} />}
    >
      <Segmented
        testId="report-period"
        className="mb-[var(--spacing-sm)]"
        value={preset}
        onChange={setPreset}
        items={PRESETS.map((p) => ({ value: p.value, label: p.label, testId: `report-period-${p.value}` }))}
      />
      <AppText variant="caption" color="textMuted" className="block">
        {t("progressSummary.reportScope")}
      </AppText>
      <AppText
        variant="caption"
        color="textMuted"
        className="mb-[var(--spacing-sm)] block"
        data-testid="report-unit-note"
      >
        {t("progressSummary.reportUnitNote")}
      </AppText>
      {state.kind === "loading" ? (
        <div data-testid="report-loading" role="status" aria-label={t("progressSummary.loading")}>
          <div className="grid grid-cols-2 gap-[var(--spacing-sm)]">
            <Skeleton height={52} radius="var(--radius-md)" />
            <Skeleton height={52} radius="var(--radius-md)" />
            <Skeleton height={52} radius="var(--radius-md)" />
            <Skeleton height={52} radius="var(--radius-md)" />
          </div>
        </div>
      ) : state.kind === "ok" ? (
        <div data-testid="report-ready" data-compute-ms={state.computeMs} data-rows={state.rows}>
          <SummaryView
            summary={state.summary}
            unit={unit}
            viewer="trainerReport"
            nameOf={(id) => state.names.get(id)}
          />
        </div>
      ) : (
        <div className="py-[var(--spacing-md)]" data-testid={`report-${state.kind}`}>
          <AppText variant="body" color="textMuted" className="block">
            {t(
              state.kind === "tooLarge"
                ? "progressSummary.reportTooLarge"
                : state.kind === "ended"
                  ? "progressSummary.ended"
                  : "progressSummary.reportFailed",
            )}
          </AppText>
          {/* 읽기 실패는 다시 시도(P4U-14) — 너무 큼은 기간을 줄이는 것이 답이고, 끝난 코칭은 다시 해도 같다 */}
          {state.kind === "error" ? (
            <div className="mt-[var(--spacing-sm)]">
              <Button
                title={t("common.retry")}
                size="sm"
                variant="secondary"
                fullWidth={false}
                onPress={() => setAttempt((n) => n + 1)}
                testId="report-retry"
              />
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
