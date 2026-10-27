"use client";
// @plm SRS-079 SRS-080  기간 성과 요약 그림 — 회원 미리보기·받은 요약(DM)·트레이너 리포트가 **같은 조각**을 쓴다(ADR-040).
//
// 받는 값은 반드시 core parseSummaryV1 을 지난 SummaryV1 이다(S-18) — 이 파일은 다시 거르지 않는다.
// 스냅샷 값으로 링크·style 을 만들지 않는다(글자는 React 가 이스케이프한다). 없는 섹션은 그리지 않는다(빈 칸 없음).
// 숫자는 사실만 — 「좋아요·부족해요」 같은 평가·권고 문구는 없다(SRS-015 · 웰니스 게이트 `progressSummary.`).
// 무게는 **보는 사람 단위**로(스냅샷은 kg · U-17). 날짜는 스냅샷 range.tz(회원 기준) 로 그린다.
import { formatWeight, muscleLabel, type WeightUnit } from "@app/core";
import { muscleLoadFromSummary, summaryRangeDays, type SummaryV1 } from "@app/core/domain/periodSummary";
import { rankedMuscles } from "@app/core/domain/muscleLoad";
import type { ReactNode } from "react";
import { lang, t } from "@/lib/i18n";
import { BodyMapFull, formatMuscleSets } from "../ui/BodyMap";
import { MetaLine } from "../ui/quiet";
import { AppText, Card } from "../ui/primitives";
import { ListGroup, ListRow, SectionLabel } from "../ui/rows";

export type SummaryViewer = "member" | "receiver" | "trainerReport";

const MINUS = "−";

function signed(n: number, fmt: (abs: number) => string): string {
  if (n === 0) return fmt(0);
  return `${n > 0 ? "+" : MINUS}${fmt(Math.abs(n))}`;
}

export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? t("progressSummary.durationHm", { h, m }) : t("progressSummary.durationM", { m });
}

function dateFmt(tz: string): Intl.DateTimeFormat {
  const locale = lang === "en" ? "en-US" : "ko-KR";
  try {
    return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", timeZone: tz || undefined });
  } catch {
    return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  }
}

/** 「10. 1. ~ 10. 28.」 — 끝은 제외 경계라 하루 앞 날짜를 보인다. tz 는 회원 시간대. */
export function formatSummaryRange(startMs: number, endMs: number, tz = ""): string {
  const f = dateFmt(tz);
  return t("progressSummary.range", {
    start: f.format(new Date(startMs)),
    end: f.format(new Date(endMs - 1)),
  });
}

export function formatSummaryDate(ms: number, tz = ""): string {
  return dateFmt(tz).format(new Date(ms));
}

function Kpi({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[var(--radius-md)] bg-(--color-surface-alt) px-[var(--spacing-md)] py-[var(--spacing-sm)]">
      <span className="text-(--color-ink2) text-[length:var(--text-xs)]">{label}</span>
      <span
        data-testid={testId}
        className="truncate font-bold text-(--color-ink) text-[length:var(--text-lg)] tabular-nums"
      >
        {value}
      </span>
    </div>
  );
}

function Section({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="mt-[var(--spacing-lg)]">
      <SectionLabel title={title} />
      {children}
    </section>
  );
}

export function SummaryView({
  summary,
  unit,
  viewer,
  nameOf,
  header,
}: {
  summary: SummaryV1;
  unit: WeightUnit;
  viewer: SummaryViewer;
  /** 받는 쪽 카탈로그 이름(exerciseId → 이름) — 없으면 스냅샷 이름 */
  nameOf?: (exerciseId: string) => string | undefined;
  /** 맨 위 라벨(「회원이 보낸 요약(보낸 시점)」 등) */
  header?: ReactNode;
}) {
  const s = summary;
  const w = (kg: number) => formatWeight(kg, unit);
  const days = summaryRangeDays(s.range);
  const name = (id: string, fallback: string) => nameOf?.(id) || fallback || id;
  const load = s.muscleSets ? muscleLoadFromSummary(s) : null;
  const ranked = load ? rankedMuscles(load) : [];

  return (
    <div data-testid="ps-view" data-viewer={viewer}>
      {header}
      <AppText variant="caption" color="textMuted" className="block" data-testid="ps-range">
        {`${formatSummaryRange(s.range.startMs, s.range.endMs, s.range.tz)} · ${t("progressSummary.rangeDays", { days })}`}
      </AppText>

      <div className="mt-[var(--spacing-sm)] grid grid-cols-2 gap-[var(--spacing-sm)]">
        <Kpi
          label={t("progressSummary.workouts")}
          value={t("progressSummary.workoutsValue", { count: s.counts.workouts })}
          testId="ps-workouts"
        />
        <Kpi
          label={t("progressSummary.duration")}
          value={formatDuration(s.counts.durationSec)}
          testId="ps-duration"
        />
        <Kpi label={t("progressSummary.volume")} value={w(s.counts.volumeKg)} testId="ps-volume" />
        <Kpi
          label={t("progressSummary.perWeek")}
          value={t("progressSummary.perWeekValue", { count: s.counts.perWeek })}
          testId="ps-perweek"
        />
      </div>

      {s.delta ? (
        <div className="mt-[var(--spacing-sm)]" data-testid="ps-delta">
          <AppText variant="caption" color="textMuted" className="block">
            {t("progressSummary.deltaTitle", { days })}
          </AppText>
          <MetaLine>
            {t("progressSummary.deltaWorkouts", { value: signed(s.delta.workouts, String) })}
            {t("progressSummary.deltaDuration", { value: signed(s.delta.durationSec, formatDuration) })}
            {t("progressSummary.deltaVolume", { value: signed(s.delta.volumeKg, w) })}
          </MetaLine>
        </div>
      ) : null}

      {s.prCount !== undefined || s.prs ? (
        <Section title={t("progressSummary.prs")} testId="ps-prs">
          <AppText variant="body" className="block px-[var(--spacing-xs)]" data-testid="ps-prcount">
            {t("progressSummary.prCount", { count: s.prCount ?? s.prs?.length ?? 0 })}
          </AppText>
          {s.prs && s.prs.length > 0 ? (
            <ListGroup className="mt-[var(--spacing-sm)]">
              {s.prs.map((p) => (
                <ListRow
                  key={`${p.exerciseId}-${p.type}-${p.atMs}`}
                  title={name(p.exerciseId, p.name)}
                  subtitle={`${
                    p.type === "maxWeight"
                      ? t("progressSummary.prTypeMaxWeight")
                      : t("progressSummary.prTypeMaxVolumeSet")
                  } · ${formatSummaryDate(p.atMs, s.range.tz)}`}
                  value={
                    p.previousKg > 0
                      ? t("progressSummary.prValue", { prev: w(p.previousKg), value: w(p.valueKg) })
                      : t("progressSummary.prValueFirst", { value: w(p.valueKg) })
                  }
                />
              ))}
            </ListGroup>
          ) : null}
          {viewer === "trainerReport" && !s.prs ? (
            <AppText variant="caption" color="textFaint" className="mt-[2px] block px-[var(--spacing-xs)]">
              {t("progressSummary.prListTrainerNote")}
            </AppText>
          ) : null}
        </Section>
      ) : null}

      {s.topExercises && s.topExercises.length > 0 ? (
        <Section title={t("progressSummary.topExercises")} testId="ps-top">
          <ListGroup>
            {s.topExercises.map((x) => (
              <ListRow
                key={x.exerciseId}
                title={name(x.exerciseId, x.name)}
                subtitle={t("progressSummary.topSets", { sets: x.sets, sessions: x.sessions })}
                value={t("progressSummary.firstToLast", {
                  first: t("progressSummary.bestSet", { weight: w(x.first.weightKg), reps: x.first.reps }),
                  last: t("progressSummary.bestSet", { weight: w(x.last.weightKg), reps: x.last.reps }),
                })}
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}

      {load && (ranked.length > 0 || load.fullBody > 0) ? (
        <Section title={t("progressSummary.muscleSets")} testId="ps-muscles">
          <Card>
            <div className="flex justify-center">
              <BodyMapFull load={load} height={150} />
            </div>
            <ul className="mt-[var(--spacing-sm)]">
              {ranked.map((r) => (
                <li
                  key={r.muscle}
                  data-testid={`ps-muscle-${r.muscle}`}
                  data-sets={formatMuscleSets(r.sets)}
                  className="flex min-h-[36px] items-center gap-[var(--spacing-sm)] px-[var(--spacing-xs)]"
                >
                  <AppText variant="body" className="min-w-0 flex-1 truncate">
                    {muscleLabel(r.muscle, lang)}
                  </AppText>
                  <AppText variant="body" className="shrink-0 tabular-nums">
                    {t("muscleMap.setsCount", { count: formatMuscleSets(r.sets) })}
                  </AppText>
                </li>
              ))}
              {load.fullBody > 0 ? (
                <li
                  data-testid="ps-muscle-fullBody"
                  data-sets={formatMuscleSets(load.fullBody)}
                  className="flex min-h-[36px] items-center gap-[var(--spacing-sm)] px-[var(--spacing-xs)]"
                >
                  <AppText variant="body" className="min-w-0 flex-1 truncate">
                    {muscleLabel("fullBody", lang)}
                  </AppText>
                  <AppText variant="body" className="shrink-0 tabular-nums">
                    {t("muscleMap.setsCount", { count: formatMuscleSets(load.fullBody) })}
                  </AppText>
                </li>
              ) : null}
            </ul>
          </Card>
        </Section>
      ) : null}

      {s.effort ? (
        <Section title={t("progressSummary.effort")} testId="ps-effort">
          <Card>
            {s.effort.avg !== null && s.effort.shareAtOrBelow3 !== null ? (
              <AppText variant="body" className="block">
                {t("progressSummary.effortHead", {
                  avg: Number.isInteger(s.effort.avg) ? s.effort.avg : s.effort.avg.toFixed(1),
                  pct: Math.round(s.effort.shareAtOrBelow3 * 100),
                })}
              </AppText>
            ) : null}
            <AppText variant="caption" color="textMuted" className="block">
              {t("progressSummary.effortCoverage", { rated: s.effort.rated, total: s.effort.total })}
            </AppText>
          </Card>
        </Section>
      ) : null}

      {s.bodyweight ? (
        <Section title={t("progressSummary.bodyweight")} testId="ps-bodyweight">
          <Card>
            <AppText variant="body" className="block tabular-nums">
              {t("progressSummary.bodyweightValue", {
                start: formatWeight(s.bodyweight.startKg, unit, { increment: 0.1 }),
                end: formatWeight(s.bodyweight.endKg, unit, { increment: 0.1 }),
                change: signed(s.bodyweight.changeKg, (a) => formatWeight(a, unit, { increment: 0.1 })),
              })}
            </AppText>
            <AppText variant="caption" color="textMuted" className="block">
              {t("progressSummary.bodyweightCount", { count: s.bodyweight.count })}
            </AppText>
          </Card>
        </Section>
      ) : null}

      <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-lg)] block">
        {t("progressSummary.factOnly")}
      </AppText>
    </div>
  );
}
