"use client";
// 분석 탭 — 추정 1RM 변화(오른·내린 종목) · 최고 기록이 그대로인 종목(SRS-101 · ADR-051)
// 사실 숫자만 적는다. 「정체」 같은 평가와 권고는 쓰지 않는다(웰니스 규칙). 방향은 화살표로도 적어 색에만 기대지 않는다.
import { routes } from "@app/contracts";
import { formatWeight } from "@app/core";
import {
  exerciseChanges,
  type E1rmPoint,
  type ExerciseChange,
  plateauedExercises,
} from "@app/core/domain/exerciseProgress";
import { useUser } from "@app/core/state/userContext";
import { useMemo } from "react";
import { t } from "@/lib/i18n";
import { AppText } from "../ui/primitives";
import { ListGroup, ListRow, SectionLabel } from "../ui/rows";

const DAY_MS = 24 * 60 * 60 * 1000;

interface E1rmData {
  points: E1rmPoint[];
  names: Map<string, string>;
}

const Note = ({ children, testId }: { children: string; testId?: string }) => (
  <AppText
    variant="caption"
    color="textMuted"
    className="mb-[var(--spacing-sm)] block px-[var(--spacing-xs)]"
    data-testid={testId}
  >
    {children}
  </AppText>
);

function ChangeList({
  title,
  rows,
  names,
  testId,
}: {
  title: string;
  rows: ExerciseChange[];
  names: Map<string, string>;
  testId: string;
}) {
  const { weightUnit } = useUser();
  if (rows.length === 0) return null;
  return (
    <>
      <AppText
        variant="caption"
        color="textMuted"
        className="mb-[var(--spacing-xs)] block px-[var(--spacing-xs)]"
      >
        {title}
      </AppText>
      <ListGroup className="mb-[var(--spacing-md)]" testId={testId}>
        {rows.map((c) => {
          const up = c.changeKg > 0;
          const pct = `${Math.abs(c.changePct).toFixed(1)}%`;
          return (
            <ListRow
              key={c.exerciseId}
              title={names.get(c.exerciseId) ?? c.exerciseId}
              subtitle={t("analytics.changesSessions", { count: c.sessions })}
              href={routes.exercise(c.exerciseId)}
              value={
                <span className="flex flex-col items-end tabular-nums">
                  <span
                    className="whitespace-nowrap font-bold text-(--color-ink)"
                    data-testid="change-values"
                  >
                    {`${formatWeight(c.firstKg, weightUnit)} → ${formatWeight(c.lastKg, weightUnit)}`}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-[length:var(--text-xs)]"
                    style={{ color: up ? "var(--color-ok)" : "var(--color-ink2)" }}
                  >
                    {`${up ? "▲" : "▼"} ${pct}`}
                  </span>
                  {/* 링크 단위로 들어도 방향을 알 수 있게 기호 대신 문장으로 */}
                  <span className="sr-only">
                    {t(up ? "analytics.changeUpSr" : "analytics.changeDownSr", { value: pct })}
                  </span>
                </span>
              }
            />
          );
        })}
      </ListGroup>
    </>
  );
}

/** 위쪽 기간을 따르는 추정 1RM 변화. */
export function ExerciseChangeCard({
  data,
  days,
  asOfMs,
}: {
  data: E1rmData;
  days: number | null;
  asOfMs: number;
}) {
  const changes = useMemo(
    () => exerciseChanges(data.points, days ? asOfMs - days * DAY_MS : null),
    [data, days, asOfMs],
  );
  const empty = changes.up.length === 0 && changes.down.length === 0;
  return (
    <section data-testid="stats-changes" className="mb-[var(--spacing-sm)]">
      <SectionLabel title={t("analytics.changesTitle")} />
      {empty ? (
        <Note testId="stats-changes-empty">
          {t(changes.compared === 0 ? "analytics.changesNone" : "analytics.changesSame")}
        </Note>
      ) : (
        <>
          {/* [원본] <Note>{t("analytics.changesNote")}</Note> */}
          {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}
          <ChangeList
            title={t("analytics.changesUp")}
            rows={changes.up}
            names={data.names}
            testId="stats-changes-up"
          />
          <ChangeList
            title={t("analytics.changesDown")}
            rows={changes.down}
            names={data.names}
            testId="stats-changes-down"
          />
        </>
      )}
    </section>
  );
}

/** 전체 기록 기준 — 고른 기간과 무관하고, 해당 종목이 없으면 구역째 숨긴다. */
export function PlateauCard({ data, asOfMs }: { data: E1rmData; asOfMs: number }) {
  const { weightUnit } = useUser();
  const rows = useMemo(() => plateauedExercises(data.points, asOfMs), [data, asOfMs]);
  if (rows.length === 0) return null;
  return (
    <section data-testid="stats-plateaus" className="mb-[var(--spacing-md)]">
      <SectionLabel title={t("analytics.plateauTitle")} />
      {/* [원본] <Note>{t("analytics.plateauNote")}</Note> */}
      {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}
      <ListGroup>
        {rows.map((r) => (
          <ListRow
            key={r.exerciseId}
            title={data.names.get(r.exerciseId) ?? r.exerciseId}
            subtitle={t("analytics.plateauSub", { weeks: r.weeks, count: r.sessionsSince })}
            href={routes.exercise(r.exerciseId)}
            value={
              <span className="font-bold text-(--color-ink) tabular-nums">
                {formatWeight(r.bestKg, weightUnit)}
              </span>
            }
          />
        ))}
      </ListGroup>
    </section>
  );
}
