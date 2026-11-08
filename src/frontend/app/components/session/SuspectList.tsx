"use client";
// 「확인이 필요한 기록」 목록(SPEC-044 · SRS-109 R3) — 완료 요약 카드(workoutId)·종목 상세(exerciseId)가 같이 쓴다.
// 줄을 누르면 확인 시트 · 처리한 줄은 「처리함」으로 접는다(목록에서 바로 사라지면 무엇을 했는지 놓친다 · REV-079 UX-4).
import { formatEnteredWeight } from "@app/core";
import type { SuspectSetRow } from "@app/core/data/workoutRepository";
import { useCallback, useEffect, useRef, useState } from "react";
import { lang, t } from "@/lib/i18n";
import { useExerciseName } from "@/lib/exerciseNames";
import { ListGroup, ListRow, SectionLabel } from "../ui/rows";
import { SuspectSetSheet, type SuspectInfo } from "./SuspectSetSheet";

function Row({
  row,
  handled,
  showName,
  onOpen,
}: {
  row: SuspectSetRow;
  handled: boolean;
  showName: boolean;
  onOpen: (info: SuspectInfo) => void;
}) {
  const name = useExerciseName(row.exerciseId) ?? "";
  const weight = formatEnteredWeight(row.weightKg, row.weightUnit);
  const title = t("check.cardRow", {
    name: showName ? name : "",
    n: row.setNumber,
    weight,
    reps: row.reps,
  }).trim();
  // 앱 형식 날짜(「11월 8일」 · 기기 언어에 맡기지 않는다 · UX 리뷰 9)
  const date = row.completedAt
    ? new Date(row.completedAt).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", {
        month: "short",
        day: "numeric",
      })
    : null;
  if (handled) return <ListRow title={title} value={t("check.handled")} testId="check-row-handled" />;
  return (
    <ListRow
      title={title}
      subtitle={showName ? undefined : (date ?? undefined)}
      testId="check-row"
      onPress={() =>
        onOpen({
          setId: row.setId,
          setNumber: row.setNumber,
          exerciseName: name,
          weightKg: row.weightKg,
          reps: row.reps,
          unit: row.weightUnit,
          usualKg: row.usualKg,
          lbPlausible: row.lbPlausible,
          reason: row.reason,
        })
      }
    />
  );
}

export function SuspectList({
  workoutId,
  exerciseId,
  onChanged,
  className = "",
}: {
  workoutId?: string;
  exerciseId?: string;
  /** 처리(또는 되돌리기) 뒤 — 요약 PR 다시 받기 등 */
  onChanged?: () => void;
  className?: string;
}) {
  const [rows, setRows] = useState<SuspectSetRow[] | null>(null);
  const [handled, setHandledState] = useState<Set<string>>(new Set());
  const handledRef = useRef(handled); // 처리 직후 다시 읽을 때 최신 표식을 보게
  const setHandled = (next: Set<string>) => {
    handledRef.current = next;
    setHandledState(next);
  };
  const [open, setOpen] = useState<SuspectInfo | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: setHandled 는 ref 를 함께 고치는 지역 함수
  const load = useCallback(async () => {
    try {
      const repo = await import("@app/core/data/workoutRepository");
      const list = await repo.listSuspectSets({ workoutId, exerciseId });
      const h = handledRef.current;
      // 되돌려서 다시 확인 필요가 된 줄은 처리함 표식을 푼다
      const nextHandled = new Set([...h].filter((id) => !list.some((x) => x.setId === id)));
      setHandled(nextHandled);
      setRows((prev) => {
        // 처리한 줄은 목록에서 빠져도 「처리함」으로 남긴다(자리 그대로)
        const keep = (prev ?? []).filter((r) => nextHandled.has(r.setId));
        const merged = [...list, ...keep];
        const order = new Map((prev ?? []).map((r, i) => [r.setId, i]));
        return merged.sort((a, b) => (order.get(a.setId) ?? 1e9) - (order.get(b.setId) ?? 1e9));
      });
    } catch {
      setRows([]);
    }
  }, [workoutId, exerciseId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!rows || rows.length === 0) return null;
  const pending = rows.filter((r) => !handled.has(r.setId)).length;
  return (
    <div className={className} data-testid="check-list">
      {/* 다 처리하면 「0개」 대신 목록 제목(UX 리뷰 10) */}
      <SectionLabel
        title={workoutId && pending > 0 ? t("check.cardTitle", { n: pending }) : t("check.listTitle")}
      />
      <ListGroup>
        {rows.map((r) => (
          <Row key={r.setId} row={r} handled={handled.has(r.setId)} showName={!exerciseId} onOpen={setOpen} />
        ))}
      </ListGroup>
      {open ? (
        <SuspectSetSheet
          info={open}
          onClose={() => setOpen(null)}
          onDone={() => {
            const id = open.setId;
            setHandled(new Set(handledRef.current).add(id));
            void load();
            onChanged?.();
          }}
          onRefresh={() => {
            void load();
            onChanged?.();
          }}
        />
      ) : null}
    </div>
  );
}
