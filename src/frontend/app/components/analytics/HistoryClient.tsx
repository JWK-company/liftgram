"use client";
// @plm SRS-005 SRS-054  기록 탭 · 목록 — 완료한 세션을 **달별로 묶어** 보여 준다(시안 05)
//
// 한 줄 = 왼쪽 날짜 칸(일·요일) · 가운데 이름과 「시간 · 세트 · 볼륨」 · 오른쪽 PR 배지와 ›.
// 달마다 머리에 횟수·볼륨 합계를 단다 — 몇 달 기록이 쌓여도 훑어보기 쉽게.
//
// 휴지통은 여기 두지 않는다. 한 번 잘못 누르면 기록이 사라지던 자리였다 — 삭제는 상세 화면의 ⋯ 안으로 옮겼다
// (WorkoutDetailClient). 목록은 읽기 전용이다.
import { RecordsHeader } from "./RecordsHeader";
import { formatWeight } from "@app/core";
import { useQueryData } from "@app/core/db/hooks";
import { useUser } from "@app/core/state/userContext";
import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { Icon } from "../ui/Icon";
// [원본] import { EmptyState, Tag } from "../ui/primitives"; — Tag 는 PR 칩에만 썼다(금색 글자로 바꿈 · P4)
import { EmptyState } from "../ui/primitives";
import { formatWorkoutDuration } from "@/lib/duration";

type AnalyticsRepo = typeof import("@app/core/data/analyticsRepository");

interface WorkoutRow {
  id: string;
  name: string | null;
  completedAt: number | null;
  startedAt: number;
  totalVolumeKg: number;
  durationSeconds: number | null;
  prCount: number;
}

interface MonthGroup {
  key: string;
  label: string;
  volume: number;
  rows: WorkoutRow[];
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export default function HistoryClient() {
  const { weightUnit } = useUser();
  const [repo, setRepo] = useState<AnalyticsRepo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@app/core/data/analyticsRepository").then((m) => !cancelled && setRepo(m));
    return () => {
      cancelled = true;
    };
  }, []);

  const models = useQueryData(() => (repo ? repo.queryWorkoutHistory() : null), [repo]);
  const groups: MonthGroup[] = useMemo(() => {
    const out: MonthGroup[] = [];
    for (const m of models) {
      const w = m as unknown as WorkoutRow;
      const d = new Date(w.completedAt ?? w.startedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: `${d.getFullYear()}년 ${d.getMonth() + 1}월`, volume: 0, rows: [] };
        out.push(g);
      }
      g.rows.push(w);
      g.volume += w.totalVolumeKg ?? 0;
    }
    return out;
  }, [models]);

  return (
    <div className="flex flex-1 flex-col">
      <RecordsHeader view="list" />

      <div className="flex-1 px-[var(--spacing-lg)] pt-[var(--spacing-md)] pb-[var(--spacing-xl)]">
        {groups.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title={t("analytics.historyEmptyTitle")}
            message={t("analytics.historyEmptyMessage")}
          />
        ) : (
          <div data-testid="history-list" className="flex flex-col gap-[var(--spacing-lg)]">
            {groups.map((g) => (
              <section key={g.key}>
                <div className="flex items-baseline justify-between px-[var(--spacing-xs)] pb-[var(--spacing-sm)]">
                  <h2 className="font-bold text-(--color-ink) text-[length:var(--text-md)]">{g.label}</h2>
                  <span className="text-(--color-ink2) text-[length:var(--text-sm)] tabular-nums">
                    {`${g.rows.length}회 · ${formatWeight(g.volume, weightUnit)}`}
                  </span>
                </div>
                <div className="overflow-hidden rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) [&>*+*]:border-(--color-line) [&>*+*]:border-t">
                  {g.rows.map((w) => (
                    <HistoryRow key={w.id} w={w} unit={weightUnit} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ w, unit }: { w: WorkoutRow; unit: Parameters<typeof formatWeight>[1] }) {
  const d = new Date(w.completedAt ?? w.startedAt);
  // [원본] const parts = [duration(w.durationSeconds), formatWeight(w.totalVolumeKg, unit)].filter(Boolean);
  // [개선] 공용 소요시간(1시간 n분 · 1분 미만 생략 — P3 QA M1) @plm SRS-071
  const parts = [formatWorkoutDuration(w.durationSeconds), formatWeight(w.totalVolumeKg, unit)].filter(
    Boolean,
  );
  return (
    <a
      href={`/history/${w.id}`}
      data-testid={`history-${w.id}`}
      className="flex min-h-[60px] items-center gap-[var(--spacing-md)] px-[var(--spacing-md)] py-[var(--spacing-sm)] active:bg-(--color-surface-alt)"
    >
      <span className="flex w-10 shrink-0 flex-col items-center leading-tight">
        <span className="font-bold text-(--color-ink) text-[length:var(--text-lg)] tabular-nums">
          {d.getDate()}
        </span>
        <span className="text-(--color-ink3) text-[length:var(--text-xs)]">{WEEKDAY[d.getDay()]}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-(--color-ink) text-[length:var(--text-md)]">
          {w.name || t("analytics.workoutNameFallback")}
        </span>
        <span className="truncate text-(--color-ink2) text-[length:var(--text-sm)] tabular-nums">
          {parts.join(" · ")}
        </span>
      </span>
      {/* [원본] {w.prCount > 0 ? <Tag label={`PR ${w.prCount}`} tone="pr" /> : null} — 금색 바탕 칩 */}
      {/* [개선] 홈 「최근 운동」과 같은 금색 글자(PR 의미는 금색 하나 · 칩 없음) @plm SRS-072 */}
      {w.prCount > 0 ? (
        <span className="whitespace-nowrap font-semibold text-(--color-pr) text-[length:var(--text-sm)]">{`PR ${w.prCount}`}</span>
      ) : null}
      <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
    </a>
  );
}

/** 분 단위로만 보여 준다 — 초까지 볼 이유가 없다(app과 같다). */
// biome-ignore lint/correctness/noUnusedVariables: 원복용 보존(코드 변경 보존 규칙)
function duration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  return t("common.minutesShort", { minutes: Math.round(seconds / 60) });
}
