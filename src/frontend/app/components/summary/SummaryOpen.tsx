"use client";
// @plm SRS-080  받은(또는 보낸) 성과 요약 열기 — DM 카드·보낸 목록이 같은 판을 쓴다(ADR-041).
//
// 숫자는 **여기서만** 그린다: 카드·대화 목록 미리보기·알림에는 숫자가 없다(S-7). 열 때마다 서버가 권한을 다시 본다 —
// 해지·동의 철회·재계약 전 요약이면 PermissionDenied → 「코칭이 끝나 볼 수 없어요」(S-1·S-13·S-17).
// 스냅샷은 parseSummaryV1 로 거른 뒤에만 그린다(S-18). 결과는 이 컴포넌트 상태에만 둔다(S-20 · 어디에도 쓰지 않는다).
// 받는 쪽(senderId ≠ 나)만 「루틴 처방」 — 누르면 그 회원 처방 판이 곧바로 열린다(SRS-080 수용 기준 · U-17).
import { PeerSchema, type ProgressSummary } from "@app/contracts";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { WeightUnit } from "@app/core";
import { parseSummaryV1 } from "@app/core/domain/summarySchema";
import type { SummaryV1 } from "@app/core/domain/periodSummary";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { coachingClient } from "@/lib/coachingClient";
import { MemberRoutinesDialog } from "../coaching/CoachingClient";
import { Panel } from "../coaching/Panel";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { AppText } from "../ui/primitives";
import { formatSummaryDate, SummaryView } from "./SummaryView";

type OpenState =
  | { kind: "loading" }
  | { kind: "offline" }
  | { kind: "ended" }
  | { kind: "notFound" }
  | { kind: "unreadable" }
  | { kind: "error" }
  | { kind: "ok"; row: ProgressSummary; summary: SummaryV1; names: Map<string, string> };

/** 받는 쪽 이름 — 내 기기 카탈로그(시드 종목)의 표시 이름. 없으면 스냅샷 이름(core 권장). 읽기만. */
async function localNames(s: SummaryV1): Promise<Map<string, string>> {
  const ids = [...(s.topExercises ?? []).map((x) => x.exerciseId), ...(s.prs ?? []).map((p) => p.exerciseId)];
  if (!ids.length) return new Map();
  try {
    const { getExerciseDisplayNameMap } = await import("@app/core/data/exerciseNames");
    return await getExerciseDisplayNameMap(ids);
  } catch {
    return new Map();
  }
}

export function SummaryOpenDialog({
  summaryId,
  viewAs,
  memberName,
  unit,
  onClose,
}: {
  summaryId: string;
  /** receiver = 받은 트레이너(루틴 처방 버튼) · sender = 보낸 회원 본인 */
  viewAs: "receiver" | "sender";
  /** 루틴 처방 판 제목에 쓸 회원 이름(받는 쪽) */
  memberName?: string;
  unit: WeightUnit;
  onClose: () => void;
}) {
  const [state, setState] = useState<OpenState>({ kind: "loading" });
  const [routines, setRoutines] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 는 다시 시도 방아쇠다
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setState({ kind: "offline" });
      return;
    }
    void (async () => {
      try {
        const res = await coachingClient().getProgressSummary({ id: summaryId });
        const row = res.summary;
        const parsed = row ? parseSummaryV1(row.snapshotJson) : null;
        if (cancelled) return;
        if (!row || !parsed) {
          setState({ kind: row ? "unreadable" : "notFound" });
          return;
        }
        const names = await localNames(parsed);
        if (!cancelled) setState({ kind: "ok", row, summary: parsed, names });
      } catch (e) {
        if (cancelled) return;
        const code = ConnectError.from(e).code;
        if (code === Code.PermissionDenied) setState({ kind: "ended" });
        else if (code === Code.NotFound) setState({ kind: "notFound" });
        else if (navigator.onLine === false || code === Code.Unavailable || code === Code.Unknown)
          setState({ kind: "offline" });
        else setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryId, attempt]);

  if (routines && state.kind === "ok") {
    return (
      <MemberRoutinesDialog
        peer={create(PeerSchema, { id: state.row.memberId, displayName: memberName ?? "" })}
        onClose={() => setRoutines(false)}
      />
    );
  }

  const message = (key: Parameters<typeof t>[0], testId: string, retry = false) => (
    <div data-testid={testId} className="py-[var(--spacing-md)]">
      <AppText variant="body" color="textMuted" className="block">
        {t(key)}
      </AppText>
      {retry ? (
        <div className="mt-[var(--spacing-sm)]">
          <Button
            title={t("common.retry")}
            size="sm"
            variant="secondary"
            fullWidth={false}
            onPress={() => setAttempt((n) => n + 1)}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <Panel
      testId="ps-open"
      title={t("progressSummary.openTitle")}
      onClose={onClose}
      actions={
        <>
          {viewAs === "receiver" && state.kind === "ok" ? (
            <Button
              title={t("progressSummary.prescribe")}
              onPress={() => setRoutines(true)}
              testId="ps-prescribe"
            />
          ) : null}
          <Button title={t("common.ok")} variant="secondary" onPress={onClose} />
        </>
      }
    >
      {state.kind === "loading" ? (
        <div data-testid="ps-open-loading" role="status" aria-label={t("progressSummary.loading")}>
          <Skeleton width="55%" height={12} />
          <div className="mt-[var(--spacing-sm)] grid grid-cols-2 gap-[var(--spacing-sm)]">
            <Skeleton height={52} radius="var(--radius-md)" />
            <Skeleton height={52} radius="var(--radius-md)" />
            <Skeleton height={52} radius="var(--radius-md)" />
            <Skeleton height={52} radius="var(--radius-md)" />
          </div>
        </div>
      ) : state.kind === "offline" ? (
        message("progressSummary.offlineOpen", "ps-open-offline", true)
      ) : state.kind === "ended" ? (
        message("progressSummary.ended", "ps-open-ended")
      ) : state.kind === "notFound" ? (
        message("progressSummary.notFound", "ps-open-notfound")
      ) : state.kind === "unreadable" ? (
        message("progressSummary.unreadable", "ps-open-unreadable")
      ) : state.kind === "error" ? (
        message("progressSummary.failed", "ps-open-error", true)
      ) : (
        <SummaryView
          summary={state.summary}
          unit={unit}
          viewer={viewAs === "receiver" ? "receiver" : "member"}
          nameOf={(id) => state.names.get(id)}
          header={
            <AppText variant="label" color="textMuted" className="mb-[2px] block" data-testid="ps-sent-label">
              {t(viewAs === "receiver" ? "progressSummary.memberSent" : "progressSummary.mySent", {
                date: formatSummaryDate(Number(state.row.createdAt)),
              })}
            </AppText>
          }
        />
      )}
    </Panel>
  );
}
