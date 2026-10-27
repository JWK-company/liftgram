"use client";
// @plm SRS-073 ADR-038  세트 힘든 정도(RIR — 몇 개 더 할 수 있었나) 고르기 시트
//
// RIR 은 대개 세트 완료 직후, 휴식 타이머가 도는 중에 적는다. 그래서 두 번 누르면 끝나야 한다(칩 → 선택지).
//   · 6단계 선택지(0·0.5·1·2·3·4+)는 누르면 **곧바로 저장하고 닫힌다** — 「확인」 버튼이 없다(SheetShell hideOk · U-10).
//     「4+」 는 4 로 저장한다(평균에 쓰이는 값 · ADR-038).
//   · 0.5 단위 스테퍼(0~10)·「지우기」는 자리에서 바꾸고, **닫을 때** 저장한다(배경·Esc·「닫기」 어느 쪽으로 닫아도).
//   · 열면 제목에 포커스, 닫으면 여는 칩으로 포커스를 돌려준다(부르는 쪽 · U-23). 공용 Overlay 는 고치지 않는다(U-3).
//   · 휴식 막대(RestBar sticky z-40)는 시트(#modal-root fixed z-50) 아래다 — 화면 정리 P3 가 쌓임 맥락을 확인하고
//     「재현 안 됨」으로 닫았다(F4). e2e 가 휴식 중 선택지 6개가 맨 위인지 elementFromPoint 로 잰다(U-2).
//
// 값 자르기·0.5 맞추기는 core 한 곳(normalizeRir · EFFORT_RIR_*)을 쓴다. 문구는 사실만(웰니스 — 권고·평가 없음).
import { EFFORT_RIR_MAX, EFFORT_RIR_MIN, EFFORT_RIR_STEP, normalizeRir } from "@app/core";
import { useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { SheetShell } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";

type TKey = Parameters<typeof t>[0];

/** 6단계 — 값(저장값) · 쉬운 말 · 칸 표시 */
const OPTIONS: { value: number; short: string; label: TKey }[] = [
  { value: 0, short: "0", label: "effort.opt0" },
  { value: 0.5, short: "0.5", label: "effort.opt05" },
  { value: 1, short: "1", label: "effort.opt1" },
  { value: 2, short: "2", label: "effort.opt2" },
  { value: 3, short: "3", label: "effort.opt3" },
  { value: 4, short: "4+", label: "effort.opt4" },
];

/** RIR 숫자 표시 — 0.5 단위라 정수면 정수, 아니면 소수 한 자리 */
export function formatRir(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function RirSheet({
  value,
  target,
  onSave,
  onClose,
}: {
  /** 지금 저장된 값(null = 적지 않음) */
  value: number | null;
  /** 처방 RIR(루틴이 정한 목표) — 있으면 제목 아래 한 줄 */
  target: number | null;
  /** 저장 — 블록 쓰기 직렬화(ExerciseBlock write)를 거친다 */
  onSave: (v: number | null) => void;
  /** 닫기 — 부르는 쪽이 시트를 내리고 칩으로 포커스를 돌린다 */
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<number | null>(value);
  const done = useRef(false);
  const focused = useRef(false);

  // 배경·Esc·「닫기」 — 스테퍼·지우기로 바꾼 값이 있으면 그때 저장한다
  const closeAndSave = () => {
    if (done.current) return;
    done.current = true;
    if (draft !== value) onSave(draft);
    onClose();
  };
  // 선택지 — 곧바로 저장하고 닫는다(같은 값이면 쓰지 않는다)
  const pick = (v: number) => {
    if (done.current) return;
    done.current = true;
    if (v !== value) onSave(v);
    onClose();
  };
  const step = (dir: 1 | -1) => {
    const base = draft ?? (dir > 0 ? EFFORT_RIR_MIN - EFFORT_RIR_STEP : EFFORT_RIR_MIN + EFFORT_RIR_STEP);
    setDraft(normalizeRir(base + dir * EFFORT_RIR_STEP));
  };

  return (
    <SheetShell title="" hideOk onClose={closeAndSave} testId="rir-sheet">
      <div className="flex items-start gap-[var(--spacing-sm)]">
        <h2
          // 포탈이 첫 그림 뒤에 붙으므로 effect 대신 콜백 ref 로 — 붙는 순간 한 번만 제목에 포커스(U-23)
          ref={(el) => {
            if (el && !focused.current) {
              focused.current = true;
              el.focus();
            }
          }}
          tabIndex={-1}
          data-testid="rir-sheet-title"
          className="min-w-0 flex-1 font-bold text-(--color-ink) text-[length:var(--text-lg)] outline-none"
        >
          {t("effort.sheetTitle")}
        </h2>
        <button
          type="button"
          data-testid="rir-close"
          onClick={closeAndSave}
          className="-mt-[8px] -mr-[8px] flex h-[44px] min-w-[44px] shrink-0 items-center justify-center px-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)]"
        >
          {t("effort.close")}
        </button>
      </div>
      {target != null ? (
        <AppText variant="caption" color="textMuted" className="block" data-testid="rir-sheet-target">
          {t("effort.sheetTarget", { rir: formatRir(target) })}
        </AppText>
      ) : null}

      <ul className="mt-[var(--spacing-sm)] flex flex-col" data-testid="rir-options">
        {OPTIONS.map((o, i) => {
          const selected = draft === o.value;
          return (
            <li key={o.value}>
              <button
                type="button"
                data-testid={`rir-opt-${o.short.replace(".", "_").replace("+", "plus")}`}
                aria-pressed={selected}
                onClick={() => pick(o.value)}
                style={{ borderTopWidth: i === 0 ? 0 : 1, borderColor: "var(--color-line)" }}
                className="flex min-h-[48px] w-full items-center gap-[var(--spacing-md)] text-left"
              >
                <span
                  style={{ borderColor: selected ? "var(--color-brand)" : "transparent" }}
                  className={`flex h-[32px] min-w-[44px] shrink-0 items-center justify-center rounded-[var(--radius-pill)] border bg-(--color-surface-alt) px-[var(--spacing-sm)] text-[length:var(--text-sm)] tabular-nums ${
                    selected ? "font-semibold text-(--color-ink)" : "text-(--color-ink2)"
                  }`}
                >
                  {o.short}
                </span>
                <AppText variant="body" className="min-w-0 flex-1">
                  {t(o.label)}
                </AppText>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 0.5 단위로 직접 — 닫을 때 저장(선택지와 달리 여러 번 누르며 맞추므로) */}
      <div className="mt-[var(--spacing-sm)] flex items-center gap-[var(--spacing-sm)] border-(--color-line) border-t pt-[var(--spacing-sm)]">
        <AppText variant="caption" color="textMuted" className="min-w-0 flex-1 break-keep">
          {t("effort.stepperLabel")}
        </AppText>
        <button
          type="button"
          data-testid="rir-step-minus"
          aria-label="감소"
          disabled={draft !== null && draft <= EFFORT_RIR_MIN}
          onClick={() => step(-1)}
          className="flex h-[44px] w-[44px] items-center justify-center rounded-[var(--radius-md)] bg-(--color-surface-alt) text-(--color-ink) disabled:opacity-40"
        >
          <Icon name="remove" size={18} />
        </button>
        <span
          data-testid="rir-step-value"
          aria-live="polite"
          className="min-w-[40px] text-center font-semibold text-(--color-ink) text-[length:var(--text-md)] tabular-nums"
        >
          {draft === null ? t("effort.stepperEmpty") : formatRir(draft)}
        </span>
        <button
          type="button"
          data-testid="rir-step-plus"
          aria-label="증가"
          disabled={draft !== null && draft >= EFFORT_RIR_MAX}
          onClick={() => step(1)}
          className="flex h-[44px] w-[44px] items-center justify-center rounded-[var(--radius-md)] bg-(--color-surface-alt) text-(--color-ink) disabled:opacity-40"
        >
          <Icon name="add" size={18} />
        </button>
        <button
          type="button"
          data-testid="rir-clear"
          disabled={draft === null}
          onClick={() => setDraft(null)}
          className="flex h-[44px] min-w-[44px] items-center justify-center px-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)] disabled:opacity-40"
        >
          {t("effort.clear")}
        </button>
      </div>
    </SheetShell>
  );
}
