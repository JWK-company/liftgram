"use client";
// @plm SRS-076 ADR-039  통계 「근육 균형」 카드 — 기존 「근육군 분포」(주근육 볼륨 kg)를 **대체**한다(U-5)
//
// · 단위는 작업 세트 수(주근육 1 · 보조근 0.5 · core setsByMuscle 한 함수 — 회원 리포트·성과 요약과 같은 값). 볼륨 kg 은
//   줄마다 보조 숫자(주근육 기준 · 예전 분포와 같은 집계 getMuscleDistribution)로 남긴다.
// · 기간은 페이지 위쪽 구간 선택기를 따른다(U-6). 카드 안에는 ‹ › 하나만 — 같은 길이만큼 앞뒤로 옮긴다(「전체」면 없음).
//   위쪽 기간을 바꾸면 지금 기간(오프셋 0)으로 돌아온다.
// · 그림(무채 농도 + 선택 근육 brand)은 대략, 숫자 목록(많은 순)이 정확한 값. 목록 줄을 누르면 그 근육을 그림에 표시한다.
// · 「이 기간에 안 한 근육」 칩 → /exercises?muscle=<g>(카탈로그가 그 부위 필터로 열린다).
// 문구는 사실만(웰니스 — 「부족」·「불균형」 같은 평가·권고 없음).
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatWeight, muscleLabel, type MuscleGroup } from "@app/core";
import {
  type MapMuscle,
  type MuscleLoad,
  rankedMuscles,
  totalMuscleSets,
  untrained,
} from "@app/core/domain/muscleLoad";
import { useUser } from "@app/core/state/userContext";
import { lang, t } from "@/lib/i18n";
import { BodyMapFull, formatMuscleSets, muscleMapAriaLabel } from "../ui/BodyMap";
import { Icon } from "../ui/Icon";
import { AppText, Card } from "../ui/primitives";
import { SectionLabel } from "../ui/rows";

const DAY_MS = 24 * 60 * 60 * 1000;

function md(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function MuscleBalanceCard({ days }: { /** 위쪽 기간의 일수(null = 전체) */ days: number | null }) {
  const { weightUnit } = useUser();
  const [offset, setOffset] = useState(0); // 0 = 지금 기간 · 1 = 한 기간 앞 …
  const [data, setData] = useState<{
    key: string;
    load: MuscleLoad;
    volume: Map<MuscleGroup, number>;
  } | null>(null);
  const [selected, setSelected] = useState<MapMuscle | null>(null);
  // 기준 시각은 기간·오프셋이 바뀔 때만 다시 잡는다(그리기마다 범위가 흔들리지 않게)
  const [nowMs, setNowMs] = useState(() => Date.now());

  // 위쪽 기간이 바뀌면 지금 기간으로(그리는 중 상태 맞추기 — 효과로 하면 옛 기간을 한 번 더 읽는다)
  const [prevDays, setPrevDays] = useState(days);
  if (prevDays !== days) {
    setPrevDays(days);
    setOffset(0);
    setNowMs(Date.now());
  }

  const endMs = days ? nowMs - offset * days * DAY_MS : undefined;
  const startMs = days && endMs !== undefined ? endMs - days * DAY_MS : undefined;
  const key = `${days ?? "all"}:${offset}:${nowMs}`;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      import("@app/core/data/muscleLoadRepository"),
      import("@app/core/data/analyticsRepository"),
    ])
      .then(([ml, an]) =>
        // 지금 기간(오프셋 0)은 끝을 열어 둔다 — 「지금 − N일」 이후 전부(위쪽 숫자들과 같은 기준)
        Promise.all([
          ml.periodMuscleLoad(startMs, offset === 0 ? undefined : endMs),
          an.getMuscleDistribution(startMs, offset === 0 ? undefined : endMs),
        ]),
      )
      .then(([load, dist]) => {
        if (cancelled) return;
        setData({ key, load, volume: new Map(dist.map((d) => [d.muscle, d.volumeKg])) });
      })
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [key, startMs, endMs, offset]);

  const ready = data && data.key === key ? data : null;
  const ranked = ready ? rankedMuscles(ready.load) : [];
  const total = ready ? totalMuscleSets(ready.load) : 0;
  const fullBody = ready?.load.fullBody ?? 0;
  const missing = ready && total > 0 ? untrained(ready.load) : [];
  const rangeText =
    startMs !== undefined && endMs !== undefined
      ? t("muscleMap.range", { start: md(startMs), end: md(endMs - 1) })
      : null;

  return (
    <>
      <SectionLabel
        title={t("muscleMap.balanceTitle")}
        testId="muscle-balance-title"
        right={
          days ? (
            <span className="flex items-center" data-testid="muscle-balance-nav">
              <NavButton
                dir="prev"
                label={t("muscleMap.prevPeriod")}
                onPress={() => setOffset((o) => o + 1)}
              />
              <span className="tabular-nums" data-testid="muscle-balance-range">
                {rangeText}
              </span>
              <NavButton
                dir="next"
                label={t("muscleMap.nextPeriod")}
                disabled={offset === 0}
                onPress={() => setOffset((o) => Math.max(0, o - 1))}
              />
            </span>
          ) : null
        }
      />
      <Card className="mb-[var(--spacing-lg)]" data-testid="muscle-balance-card">
        {!ready ? (
          // 읽는 중 — 그림 자리만큼 비워 둔다(늦게 끼어들며 아래를 밀어내지 않게)
          <div style={{ height: 160 }} aria-busy="true" />
        ) : total === 0 && fullBody === 0 ? (
          <AppText variant="caption" color="textMuted" className="block" data-testid="muscle-balance-empty">
            {t("muscleMap.balanceEmpty")}
          </AppText>
        ) : (
          <>
            <div className="flex justify-center">
              <BodyMapFull
                load={ready.load}
                selected={selected}
                height={160}
                ariaLabel={muscleMapAriaLabel(ready.load)}
                testId="muscle-balance-map"
              />
            </div>
            <ul className="mt-[var(--spacing-sm)]" data-testid="muscle-balance-list">
              {ranked.map((r) => {
                const name = muscleLabel(r.muscle, lang);
                const count = formatMuscleSets(r.sets);
                const vol = ready.volume.get(r.muscle) ?? 0;
                const volText = vol > 0 ? formatWeight(vol, weightUnit) : null;
                const isSel = selected === r.muscle;
                return (
                  <li key={r.muscle}>
                    <button
                      type="button"
                      data-testid={`muscle-balance-row-${r.muscle}`}
                      data-sets={count}
                      aria-pressed={isSel}
                      aria-label={
                        volText
                          ? t("muscleMap.rowAria", { muscle: name, count, volume: volText })
                          : t("muscleMap.rowAriaNoVolume", { muscle: name, count })
                      }
                      onClick={() => setSelected(isSel ? null : r.muscle)}
                      className={`flex min-h-[44px] w-full items-center gap-[var(--spacing-sm)] rounded-[var(--radius-sm)] px-[var(--spacing-sm)] text-left ${
                        isSel ? "bg-(--color-surface-alt)" : ""
                      }`}
                    >
                      <span
                        aria-hidden
                        style={{ backgroundColor: isSel ? "var(--color-brand-vivid)" : "transparent" }}
                        className="h-[8px] w-[8px] shrink-0 rounded-full"
                      />
                      <AppText variant="body" className="min-w-0 flex-1 truncate font-semibold">
                        {name}
                      </AppText>
                      <AppText variant="body" className="shrink-0 tabular-nums">
                        {t("muscleMap.setsCount", { count })}
                      </AppText>
                      <AppText
                        variant="caption"
                        color={isSel ? "textMuted" : "textFaint"}
                        className="w-[76px] shrink-0 text-right tabular-nums"
                      >
                        {volText ?? ""}
                      </AppText>
                    </button>
                  </li>
                );
              })}
              {fullBody > 0 ? (
                <li
                  data-testid="muscle-balance-row-fullBody"
                  className="flex min-h-[44px] items-center gap-[var(--spacing-sm)] px-[var(--spacing-sm)] pl-[calc(var(--spacing-sm)+16px)]"
                >
                  <AppText variant="body" className="min-w-0 flex-1 truncate font-semibold">
                    {muscleLabel("fullBody", lang)}
                  </AppText>
                  <AppText variant="body" className="shrink-0 tabular-nums">
                    {t("muscleMap.setsCount", { count: formatMuscleSets(fullBody) })}
                  </AppText>
                  <span className="w-[76px] shrink-0" />
                </li>
              ) : null}
            </ul>
            <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-xs)] block">
              {t("muscleMap.halfNote")}
            </AppText>

            {missing.length > 0 ? (
              <div className="mt-[var(--spacing-md)]" data-testid="muscle-balance-untrained">
                <AppText variant="caption" color="textMuted" className="block font-semibold">
                  {t("muscleMap.untrainedTitle")}
                </AppText>
                <div className="mt-[var(--spacing-xs)] flex flex-wrap gap-x-[var(--spacing-xs)]">
                  {missing.map((m) => {
                    const name = muscleLabel(m, lang);
                    return (
                      <Link
                        key={m}
                        href={`/exercises?muscle=${m}`}
                        data-testid={`untrained-chip-${m}`}
                        aria-label={t("muscleMap.untrainedChipAria", { muscle: name })}
                        // QuietChip 모양(무테·무채)을 호출부에서 그린다 — 보이는 칩 32px, 누르는 자리는 위아래 6px 를 더해 44px(U-11)
                        className="flex min-h-[44px] items-center"
                      >
                        <span className="flex min-h-[32px] items-center rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[var(--spacing-md)] text-(--color-ink2) text-[length:var(--text-sm)]">
                          {name}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}

function NavButton({
  dir,
  label,
  onPress,
  disabled,
}: {
  dir: "prev" | "next";
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={`muscle-balance-${dir}`}
      disabled={disabled}
      onClick={onPress}
      className="flex h-[44px] w-[44px] items-center justify-center disabled:opacity-30"
    >
      <Icon name={dir === "prev" ? "chevron-back" : "chevron-forward"} size={18} color="var(--color-ink2)" />
    </button>
  );
}
