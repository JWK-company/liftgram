"use client";
// @plm SRS-030  유산소 세트 한 줄 — app의 features/session의 SetRowCardio를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 유산소는 **무게·횟수를 기록하지 않는다.** 대신 종목이 정한 지표를 쓴다:
// 러닝머신은 시간·거리·경사·속도, 천국의 계단은 시간·단계, 줄넘기는 시간만.
// 그 목록은 도메인이 정하고(`cardioMetricsFor`) 이 줄은 받은 대로 칸을 그린다.
//
// ── 저장 단위와 입력 단위가 다르다 ──────────────────────────────────────────
// 저장은 초·미터로 하고, 사람은 분·킬로미터로 적는다. 변환은 도메인이 한 곳에서 한다 —
// 여기서 다시 계산하면 앱과 웹의 반올림이 갈라진다(5200m가 한쪽은 5.2km, 다른 쪽은 5.20km).
//
// ── 볼륨에 섞이지 않는다 ────────────────────────────────────────────────────
// 유산소 세트는 무게·횟수가 0이라 볼륨·PR 계층이 자연히 걸러 낸다. 여기서 따로 막지 않는다 —
// 막는 코드를 두면 그 코드가 진실이 되어, 도메인 규칙이 바뀔 때 두 곳이 갈라진다.
// ─────────────────────────────────────────────────────────────────────────────
import {
  cardioNumInput,
  formatCardioSet,
  inputToIncline,
  inputToLevel,
  inputToSpeed,
  kmInputToM,
  minInputToSec,
  mToKmInput,
  secToMinInput,
  type CardioMetric,
} from "@app/core";
import { useEffect, useState } from "react";
import { t, type TransKey } from "@/lib/i18n";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";

/** 이전 기록에서 이 줄로 옮겨 올 수 있는 값들. */
export interface CardioPrev {
  durationSec?: number | null;
  distanceM?: number | null;
  inclinePct?: number | null;
  level?: number | null;
  speedKmh?: number | null;
}

export interface CardioSet {
  id: string;
  done?: boolean | null;
  durationSec?: number | null;
  distanceM?: number | null;
  inclinePct?: number | null;
  level?: number | null;
  speedKmh?: number | null;
}

export const CARDIO_COL_LABEL: Record<CardioMetric, TransKey> = {
  duration: "session.durationColHeader",
  distance: "session.distanceColHeader",
  incline: "session.inclineColHeader",
  level: "session.levelColHeader",
  speed: "session.speedColHeader",
};

export function SetRowCardio({
  set,
  label,
  prev,
  metrics,
  onUpdate,
  onToggleDone,
  onDelete,
}: {
  set: CardioSet;
  label: string;
  prev: CardioPrev | null;
  metrics: CardioMetric[];
  onUpdate: (patch: Record<string, number | null>) => void;
  onToggleDone: () => void;
  onDelete: () => void;
}) {
  const isDone = set.done === true;

  // 입력칸은 **타이핑 중에는 그대로 둔다**(저장값으로 되돌리면 소수점을 찍을 수 없다).
  // 저장 뒤·이전 기록을 옮겨 온 뒤에만 바깥 값으로 맞춘다.
  const [mins, setMins] = useState(() => secToMinInput(set.durationSec));
  const [km, setKm] = useState(() => mToKmInput(set.distanceM));
  const [incline, setIncline] = useState(() => cardioNumInput(set.inclinePct));
  const [level, setLevel] = useState(() => cardioNumInput(set.level));
  const [speed, setSpeed] = useState(() => cardioNumInput(set.speedKmh));

  useEffect(() => setMins(secToMinInput(set.durationSec)), [set.durationSec]);
  useEffect(() => setKm(mToKmInput(set.distanceM)), [set.distanceM]);
  useEffect(() => setIncline(cardioNumInput(set.inclinePct)), [set.inclinePct]);
  useEffect(() => setLevel(cardioNumInput(set.level)), [set.level]);
  useEffect(() => setSpeed(cardioNumInput(set.speedKmh)), [set.speedKmh]);

  const hasPrev =
    !!prev &&
    ((prev.durationSec ?? 0) > 0 ||
      (prev.distanceM ?? 0) > 0 ||
      (prev.inclinePct ?? 0) > 0 ||
      (prev.level ?? 0) > 0 ||
      (prev.speedKmh ?? 0) > 0);

  /** 이전 기록을 통째로 옮겨 온다 — 같은 코스를 반복할 때가 대부분이다. */
  function applyPrev() {
    if (!prev) return;
    onUpdate({
      durationSec: prev.durationSec ?? null,
      distanceM: prev.distanceM ?? null,
      inclinePct: prev.inclinePct ?? null,
      level: prev.level ?? null,
      speedKmh: prev.speedKmh ?? null,
    });
  }

  const CELL: Record<
    CardioMetric,
    { value: string; set: (v: string) => void; commit: () => void; testId: string }
  > = {
    duration: {
      value: mins,
      set: setMins,
      commit: () => onUpdate({ durationSec: minInputToSec(mins) }),
      testId: "cardio-duration",
    },
    distance: {
      value: km,
      set: setKm,
      commit: () => onUpdate({ distanceM: kmInputToM(km) }),
      testId: "cardio-distance",
    },
    incline: {
      value: incline,
      set: setIncline,
      commit: () => onUpdate({ inclinePct: inputToIncline(incline) }),
      testId: "cardio-incline",
    },
    level: {
      value: level,
      set: setLevel,
      commit: () => onUpdate({ level: inputToLevel(level) }),
      testId: "cardio-level",
    },
    speed: {
      value: speed,
      set: setSpeed,
      commit: () => onUpdate({ speedKmh: inputToSpeed(speed) }),
      testId: "cardio-speed",
    },
  };

  return (
    <div className={isDone ? "bg-(--color-ok-muted)" : ""} data-testid="cardio-row">
      <div className="flex items-center gap-[4px] py-[3px]">
        <span className="flex w-[34px] shrink-0 justify-center">
          <span className="rounded-[var(--radius-sm)] bg-(--color-surface-alt) px-[6px] py-[3px]">
            <AppText variant="caption" color="textMuted" className="font-bold!">
              {label}
            </AppText>
          </span>
        </span>

        <button
          type="button"
          onClick={applyPrev}
          disabled={!hasPrev}
          data-testid="cardio-prev"
          className="w-[66px] shrink-0"
        >
          {hasPrev ? (
            <span className="block rounded-[var(--radius-sm)] bg-(--color-brand-muted) px-[4px] py-[3px]">
              <AppText variant="caption" color="primary" className="block truncate text-center">
                {formatCardioSet(prev?.durationSec, prev?.distanceM)}
              </AppText>
            </span>
          ) : (
            <AppText variant="caption" color="textFaint" className="block text-center">
              –
            </AppText>
          )}
        </button>

        {metrics.map((m) => {
          const cell = CELL[m];
          return (
            <input
              key={m}
              inputMode="decimal"
              placeholder="0"
              value={cell.value}
              data-testid={cell.testId}
              onChange={(e) => cell.set(e.target.value)}
              // 칸을 떠날 때 저장한다 — 글자마다 저장하면 "5"가 5분으로 한 번 저장된 뒤
              // "50"이 되는 식으로 중간값이 기록에 남는다.
              onBlur={cell.commit}
              onKeyDown={(e) => e.key === "Enter" && cell.commit()}
              className="h-[38px] min-w-0 flex-1 rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface-alt) text-center text-[length:var(--text-md)] text-(--color-ink) placeholder:text-(--color-ink3)"
            />
          );
        })}

        <button
          type="button"
          onClick={onToggleDone}
          aria-pressed={isDone}
          data-testid="cardio-done"
          className={`flex h-[30px] w-[38px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${
            isDone ? "bg-(--color-ok)" : "bg-(--color-surface-alt)"
          }`}
        >
          <Icon name="checkmark" size={16} color={isDone ? "var(--color-on-brand)" : "var(--color-ink3)"} />
        </button>

        <button
          type="button"
          onClick={onDelete}
          aria-label={t("common.delete")}
          data-testid="cardio-delete"
          className="flex h-[30px] w-[34px] shrink-0 items-center justify-center"
        >
          <Icon name="close" size={15} color="var(--color-ink3)" />
        </button>
      </div>
    </div>
  );
}
