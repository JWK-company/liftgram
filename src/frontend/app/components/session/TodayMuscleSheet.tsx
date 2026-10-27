"use client";
// @plm SRS-075  운동 중 「오늘 근육」 — SessionGuideButtons 줄의 버튼(≥44px) → 시트(큰 그림 + 근육별 끝낸/계획 세트)
//
// · 「근육 그림 보기」(liftgram.muscleMap)가 꺼져 있으면 버튼을 그리지 않는다(DOM 없음 · 끈 상태 좌표 = 기준선 · U-14).
// · 시트를 여는 순간 세션 세트 전체를 한 번에 읽는다(sessionMuscleLoad — 블록마다 폴링하지 않음). 시트가 떠 있는 동안에는
//   세트를 완료할 수 없으므로 「세트 완료 → 시트 열기 → 숫자 +1/+0.5」가 갱신 경로다(U-14).
// · 그림은 끝낸 세트로 칠한다(0~3단계 · 단계 구분은 아래 숫자 목록). 목록 줄을 누르면 그 근육만 brand 로 그림에 표시한다(선택).
// · 접근성: 그림은 role="img" 한 덩어리 + aria-label 요약, 아래 실제 <ul> 숫자 목록(U-13). 닫으면 버튼으로 포커스를 돌린다.
import { useRef, useState } from "react";
import type { SessionMuscleLoad } from "@app/core/data/muscleLoadRepository";
import { MAP_MUSCLES, type MapMuscle } from "@app/core/domain/muscleLoad";
import { muscleLabel } from "@app/core";
import { lang, t } from "@/lib/i18n";
import { useMuscleMap } from "@/lib/muscleMapPref";
import { BodyMapFull, formatMuscleSets, muscleMapAriaLabel } from "../ui/BodyMap";
import { SheetShell } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

export function TodayMuscleButton({ workoutId }: { workoutId: string }) {
  const on = useMuscleMap();
  const [data, setData] = useState<SessionMuscleLoad | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  if (!on) return null;

  const openSheet = () => {
    setData(undefined);
    setOpen(true);
    void import("@app/core/data/muscleLoadRepository")
      .then((m) => m.sessionMuscleLoad(workoutId))
      .then(setData)
      .catch(() => setData(null));
  };
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        data-testid="btn-today-muscles"
        onClick={openSheet}
        aria-haspopup="dialog"
        // GuideButton 과 같은 모양(보이는 높이 36) · 누르는 자리만 위로 8px 를 더해 44px(U-11 — RirChip 과 같은 ::before 방식).
        // [원본] min-h-[44px] — 가이드 줄 전체가 44 가 되어 켠 상태에서 첫 세트가 8px 내려가 화면 정리 예산(360 첫 세트 ≤320)을 넘었다.
        //   늘린 8px 는 이 줄의 위 여백(pt-sm = 8px) 자리라 다른 버튼과 겹치지 않는다. 아래로는 넓히지 않는다 — 바로 아래 블록 목록이
        //   그 위에 그려져(쌓임 순서) 넓힌 자리가 눌리지 않았다(e2e elementFromPoint 로 확인).
        className="relative min-h-[36px] flex-1 rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) py-[4px] text-center before:absolute before:inset-x-0 before:-top-[8px] before:bottom-0 before:content-['']"
      >
        <AppText variant="caption" className="font-semibold">
          {t("muscleMap.todayButton")}
        </AppText>
      </button>
      {open ? <TodayMuscleSheet data={data} onClose={close} /> : null}
    </>
  );
}

function TodayMuscleSheet({
  data,
  onClose,
}: {
  data: SessionMuscleLoad | null | undefined;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<MapMuscle | null>(null);
  const rows = data
    ? MAP_MUSCLES.map((m) => ({ m, done: data.done.byMuscle[m], planned: data.planned.byMuscle[m] }))
        .filter((r) => r.planned > 0 || r.done > 0)
        .sort(
          (a, b) =>
            b.done - a.done || b.planned - a.planned || MAP_MUSCLES.indexOf(a.m) - MAP_MUSCLES.indexOf(b.m),
        )
    : [];
  const fullBody = data ? { done: data.done.fullBody, planned: data.planned.fullBody } : null;

  return (
    <SheetShell title={t("muscleMap.sheetTitle")} onClose={onClose} testId="muscle-sheet">
      {data === undefined ? (
        <div style={{ height: 180 }} aria-busy="true" />
      ) : !data || (rows.length === 0 && !(fullBody && fullBody.planned > 0)) ? (
        <AppText
          variant="caption"
          color="textMuted"
          className="mt-[var(--spacing-sm)] block"
          data-testid="muscle-sheet-empty"
        >
          {t("muscleMap.sheetEmpty")}
        </AppText>
      ) : (
        <>
          <div className="mt-[var(--spacing-sm)] flex justify-center">
            <BodyMapFull
              load={data.done}
              selected={selected}
              height={180}
              ariaLabel={muscleMapAriaLabel(data.done)}
              testId="muscle-sheet-map"
            />
          </div>
          <ul className="mt-[var(--spacing-sm)]" data-testid="muscle-sheet-list">
            {rows.map((r) => {
              const name = muscleLabel(r.m, lang);
              const done = formatMuscleSets(r.done);
              const planned = formatMuscleSets(r.planned);
              const isSel = selected === r.m;
              return (
                <li key={r.m}>
                  <button
                    type="button"
                    data-testid={`muscle-row-${r.m}`}
                    data-done={done}
                    data-planned={planned}
                    aria-pressed={isSel}
                    aria-label={t("muscleMap.sheetRowAria", { muscle: name, done, planned })}
                    onClick={() => setSelected(isSel ? null : r.m)}
                    className={`flex min-h-[44px] w-full items-center justify-between gap-[var(--spacing-sm)] rounded-[var(--radius-sm)] px-[var(--spacing-sm)] text-left ${
                      isSel ? "bg-(--color-surface-alt)" : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-[6px]">
                      {/* 선택 표시 — 그림의 brand 구역과 같은 색 점(선택 상태 = 빨강 · 화면 정리 규칙 1) */}
                      <span
                        aria-hidden
                        style={{ backgroundColor: isSel ? "var(--color-brand-vivid)" : "transparent" }}
                        className="h-[8px] w-[8px] shrink-0 rounded-full"
                      />
                      <AppText variant="body" className="truncate font-semibold">
                        {name}
                      </AppText>
                    </span>
                    <AppText variant="caption" color="textMuted" className="shrink-0 tabular-nums">
                      {t("muscleMap.sheetRow", { done, planned })}
                    </AppText>
                  </button>
                </li>
              );
            })}
            {fullBody && fullBody.planned > 0 ? (
              <li
                data-testid="muscle-row-fullBody"
                className="flex min-h-[44px] items-center justify-between px-[var(--spacing-sm)] pl-[calc(var(--spacing-sm)+14px)]"
              >
                <AppText variant="body" className="font-semibold">
                  {muscleLabel("fullBody", lang)}
                </AppText>
                <AppText variant="caption" color="textMuted" className="tabular-nums">
                  {t("muscleMap.sheetRow", {
                    done: formatMuscleSets(fullBody.done),
                    planned: formatMuscleSets(fullBody.planned),
                  })}
                </AppText>
              </li>
            ) : null}
          </ul>
          <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-xs)] block">
            {t("muscleMap.halfNote")}
          </AppText>
        </>
      )}
    </SheetShell>
  );
}
