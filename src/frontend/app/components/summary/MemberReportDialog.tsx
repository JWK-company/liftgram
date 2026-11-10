"use client";
// @plm SRS-079 SRS-080 ADR-040  트레이너 회원 리포트 — 서버는 동의 범위의 원본만 주고(GetMemberRecords), 계산은 이 기기의 core 가 한다.
//
// 회원 요약과 **같은 계산 한 벌**(memberReportFromRecords → buildPeriodSummary)이라 세션 수·총 볼륨(캐시)·부위별 세트가 같다.
// 트레이너 쪽 규칙(core summaryRecords 머리 주석): 체중 없이(맨몸 = 가중분) · 새 기록은 개수만 · 체중 섹션 없음.
// 시드 종목은 응답에 없다 → 이 기기 카탈로그를 catalog 로 넘긴다(읽기만).
// 원본 응답과 계산 결과는 **이 컴포넌트 상태에만** 둔다 — Watermelon·localStorage·IndexedDB 어디에도 쓰지 않는다(S-20).
// 기간 기본값 4주(360 기기에서 1년 표본 계산 시간 — p4-ui-report.md).
// SPEC-050 P2 — 내용을 MemberReportBody 로 떼어 회원 화면(/coaching/m/[memberId]) 분석 탭도 같은 부품을 쓴다.
//   요약 계산은 그대로 체중 없이 — 체중 카드는 bodyView 일 때 응답의 bodyweight_logs 로 회원 화면이 따로 그린다(bodyCard).
import { GrantStatus, type Peer, Side } from "@app/contracts";
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
import { type ReactNode, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { coachingClient } from "@/lib/coachingClient";
import { scopeOf } from "@/lib/coaching";
import { Panel } from "../coaching/Panel";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { AppText } from "../ui/primitives";
import { Segmented } from "../ui/rows";
import { SummaryView } from "./SummaryView";

type ReportState =
  | { kind: "loading" }
  // [원본] | { kind: "ok"; summary: SummaryV1; names: Map<string, string>; computeMs: number; rows: number }
  // [개선] 회원 화면 분석 탭(SPEC-050 P2) — bodyView 면 같은 응답의 체중·인바디 원본과 요청 기간도 함께 둔다(메모리만)
  | {
      kind: "ok";
      summary: SummaryV1;
      names: Map<string, string>;
      computeMs: number;
      rows: number;
      body: readonly string[];
      range: { startMs: number; endMs: number };
    }
  | { kind: "tooLarge" }
  | { kind: "ended" }
  // 연결은 살아 있는데 회원이 기록 보기를 꺼 두었다(PermissionDenied 뒤 ListGrants 로 가른다 · 코드 리뷰 M-2)
  | { kind: "logOff" }
  | { kind: "error" };

const PRESETS: { value: SummaryPreset; label: string }[] = [
  { value: "7d", label: t("progressSummary.preset7d") },
  { value: "4w", label: t("progressSummary.preset4w") },
  { value: "3m", label: t("progressSummary.preset3m") },
];

/**
 * 회원 리포트 판(⋯ 시트 「기록 요약」) — 내용은 MemberReportBody 하나(회원 화면 분석 탭과 같은 부품 · SPEC-050 P2).
 * [원본] 이 함수 안에 기간 고르기·읽기·계산·그리기가 모두 있었다 — 아래 MemberReportBody 로 옮겼다(내용은 그대로).
 */
export function MemberReportDialog({
  peer,
  unit,
  onClose,
}: {
  peer: Peer;
  unit: WeightUnit;
  onClose: () => void;
}) {
  return (
    <Panel
      testId="coaching-report-view"
      title={t("progressSummary.reportTitle", { name: peer.displayName || "?" })}
      onClose={onClose}
      actions={<Button title={t("common.ok")} variant="secondary" onPress={onClose} />}
    >
      <MemberReportBody peer={peer} unit={unit} />
    </Panel>
  );
}

/**
 * 기간 고르기 + 원본 읽기 + core 계산 + 요약 카드. 판(다이얼로그)·탭 어디에나 그린다.
 *   periodPicker  기간 고르기를 바꿔 그릴 때(회원 화면은 44px 탭) — 없으면 판의 Segmented
 *   bodyCard      응답의 bodyweight_logs 로 그릴 카드(bodyView 일 때만 넘긴다) — 없으면 체중 카드 없음
 */
export function MemberReportBody({
  peer,
  unit,
  defaultPreset = "4w",
  periodPicker,
  bodyCard,
  onEnded,
}: {
  peer: Pick<Peer, "id">;
  unit: WeightUnit;
  defaultPreset?: SummaryPreset;
  periodPicker?: (p: {
    value: SummaryPreset;
    onChange: (v: SummaryPreset) => void;
    items: { value: SummaryPreset; label: string; testId: string }[];
  }) => ReactNode;
  bodyCard?: (body: readonly string[], range: { startMs: number; endMs: number }) => ReactNode;
  /** 서버가 PermissionDenied(해지·범위 끔)로 답했을 때 — 회원 화면이 연결을 다시 읽어 끝남·범위 꺼짐을 가른다.
   *  없으면(판) 이 부품이 직접 ListGrants 를 다시 읽어 가른다(코드 리뷰 M-2). */
  onEnded?: () => void;
}) {
  const [preset, setPreset] = useState<SummaryPreset>(defaultPreset);
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
          body: res.bodyweightLogs,
          range: { startMs: range.startMs, endMs: range.endMs },
        });
      } catch (e) {
        if (cancelled) return;
        const code = ConnectError.from(e).code;
        // [원본] if (code === Code.PermissionDenied) onEnded?.();
        //   setState({ kind: … PermissionDenied ? "ended" … }) — 범위 끔도 「코칭이 끝났어요」로 확정했다
        // [개선] PermissionDenied 는 곧바로 끝남으로 확정하지 않는다(코드 리뷰 M-2):
        //   회원 화면(onEnded) → 화면이 연결을 다시 읽어 가른다(그동안 읽는 중 그대로) · 판 → 여기서 ListGrants 를 다시 읽는다
        if (code === Code.PermissionDenied) {
          if (onEnded) {
            onEnded();
            return;
          }
          const kind = await deniedKind(peer.id);
          if (!cancelled) setState({ kind });
          return;
        }
        setState({ kind: code === Code.ResourceExhausted ? "tooLarge" : "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [peer.id, preset, attempt]);

  const items = PRESETS.map((p) => ({ value: p.value, label: p.label, testId: `report-period-${p.value}` }));
  return (
    <>
      {periodPicker ? (
        periodPicker({ value: preset, onChange: setPreset, items })
      ) : (
        <Segmented
          testId="report-period"
          className="mb-[var(--spacing-sm)]"
          value={preset}
          onChange={setPreset}
          items={items}
        />
      )}
      {/* [원본] <AppText variant="caption" color="textMuted" className="block">
        {t("progressSummary.reportScope")}
      </AppText> */}
      {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}
      {/* [원본] 「부위별은 이제 볼륨(kg) 대신 세트 수로 보여요」 — 변경 공지 말투(SPEC-025) */}
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
          {bodyCard ? bodyCard(state.body, state.range) : null}
        </div>
      ) : (
        <div className="py-[var(--spacing-md)]" data-testid={`report-${state.kind}`}>
          <AppText variant="body" color="textMuted" className="block">
            {t(
              state.kind === "tooLarge"
                ? "progressSummary.reportTooLarge"
                : state.kind === "ended"
                  ? "progressSummary.ended"
                  : state.kind === "logOff"
                    ? "coaching.member.logOff"
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
    </>
  );
}

/** PermissionDenied 뒤 — 활성 연결이 없으면 끝남, 있는데 기록 보기가 꺼졌으면 범위 꺼짐, 그 밖(읽기 실패 포함)은 오류(다시 시도). */
async function deniedKind(memberId: string): Promise<"ended" | "logOff" | "error"> {
  try {
    const r = await coachingClient().listGrants({});
    const g = r.grants.find(
      (x) => x.peer?.id === memberId && x.roleOfMe === Side.TRAINER && x.status === GrantStatus.ACTIVE,
    );
    if (!g) return "ended";
    return scopeOf(g.scope).logView ? "error" : "logOff";
  } catch {
    return "error";
  }
}
