"use client";
// @plm SRS-073 ADR-038  세트 줄의 RIR 칩 — 처방 줄(두 번째 줄) 오른쪽 끝 · 「세트 힘든 정도 기록」을 켰을 때만
//
// 자리(U-1): 360px 세트 첫 줄은 무게·횟수 칸이 이미 각 50px 이라 44px 칩을 넣으면 「102.5」가 잘린다 → 두 번째 줄.
// 글자(U-10): 처방 RIR 이 있으면 처방 줄의 「RIR 2」(빨강) 대신 이 칩 하나로 합친다 — 비었으면 「목표 2」, 적었으면 「2 · 목표 2」.
// 모양(U-11): 보이는 모양은 QuietChip(무테·무채·높이 32) 그대로, 누르는 자리는 44×44. quiet.tsx 의 QuietChip 은
//   className·ref·aria-label 을 받지 않아(공용 파일 수정 금지) 같은 클래스를 여기서 쓴다. 버튼은 높이 36 + 위아래 4px
//   ::before 로 44 — 늘어난 4px 은 위 세트 줄·아래 줄의 바깥 여백(py-[4px]) 자리라 다른 버튼과 겹치지 않는다.
// 저장(메모리 「세트 입력칸 묶인 그림」): 세트 표는 행 증감만 관찰해 필드 변경은 다음 그림(≤1.5초)에 온다. 그래서 고른 값을
//   곧바로 보이고(낙관 표시), 저장값이 그 값이 되거나 저장 시각이 바뀌면 저장값을 따른다. 쓰기는 블록 write 직렬화를 탄다.
import { normalizeRir } from "@app/core";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { RirSheet, formatRir } from "./RirSheet";

export function RirChip({
  setId,
  rir,
  savedAt,
  target,
  onSave,
}: {
  setId: string;
  /** 저장된 실제 RIR(null = 적지 않음) */
  rir: number | null | undefined;
  /** 세트 저장 시각(ms) — 같은 값으로 돌아온 저장도 따라가게 */
  savedAt: number;
  /** 처방 RIR(목표) */
  target: number | null;
  onSave: (v: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // 낙관 표시 — { v } 가 있으면 저장 전이라도 그 값을 보인다
  const [pending, setPending] = useState<{ v: number | null; at: number } | null>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const saved = normalizeRir(rir);

  // 저장값이 고른 값과 같아졌거나, 고른 뒤 다른 저장(다른 기기 동기 등)이 왔으면 저장값을 따른다
  useEffect(() => {
    if (!pending) return;
    if (saved === pending.v || savedAt > pending.at) setPending(null);
  }, [saved, savedAt, pending]);

  const shown = pending ? pending.v : saved;
  const label =
    shown == null
      ? target != null
        ? t("effort.chipTarget", { rir: formatRir(target) })
        : t("effort.chipEmpty")
      : target != null
        ? t("effort.chipValueTarget", { value: formatRir(shown), rir: formatRir(target) })
        : formatRir(shown);

  const close = () => {
    setOpen(false);
    // 닫으면 여는 칩으로 포커스를 돌려준다(U-23) — 시트가 내려간 다음 그림에서
    requestAnimationFrame(() => chipRef.current?.focus());
  };

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        data-testid={`set-rir-${setId}`}
        data-rir={shown ?? ""}
        aria-label={
          shown == null ? t("effort.chipAriaEmpty") : t("effort.chipAriaValue", { value: formatRir(shown) })
        }
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="relative ml-auto flex h-[36px] min-w-[44px] shrink-0 items-center justify-end before:absolute before:inset-x-0 before:-inset-y-[4px] before:content-['']"
      >
        {/* QuietChip 모양(quiet.tsx) — 무테·무채, 글자 ink2(값이 있으면 ink · 굵게) */}
        <span
          className={`inline-flex min-h-[32px] items-center rounded-[var(--radius-pill)] border border-transparent bg-(--color-surface-alt) px-[var(--spacing-md)] text-[length:var(--text-sm)] tabular-nums ${
            shown == null ? "text-(--color-ink2)" : "font-semibold text-(--color-ink)"
          }`}
        >
          {label}
        </span>
      </button>
      {open ? (
        <RirSheet
          value={shown}
          target={target}
          onSave={(v) => {
            setPending({ v, at: Date.now() });
            onSave(v);
          }}
          onClose={close}
        />
      ) : null}
    </>
  );
}
