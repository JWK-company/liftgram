"use client";
// @plm SRS-073 ADR-038  세트 줄의 RIR 칩 — 처방 줄(두 번째 줄) 오른쪽 끝 · 「세트 힘든 정도 기록」을 켰을 때만
//
// 자리(U-1): 360px 세트 첫 줄은 무게·횟수 칸이 이미 각 50px 이라 44px 칩을 넣으면 「102.5」가 잘린다 → 두 번째 줄.
// 글자(U-10): 처방 RIR 이 있으면 처방 줄의 「RIR 2」(빨강) 대신 이 칩 하나로 합친다 — 비었으면 「목표 2」, 적었으면 「2 · 목표 2」.
// 모양(U-11): 보이는 모양은 QuietChip(무테·무채·높이 32) 그대로, 누르는 자리는 44×44. quiet.tsx 의 QuietChip 은
//   className·ref·aria-label 을 받지 않아(공용 파일 수정 금지) 같은 클래스를 여기서 쓴다. 버튼은 높이 36 + 위아래 4px
//   ::before 로 44 — 늘어난 4px 은 위 세트 줄·아래 줄의 바깥 여백(py-[4px]) 자리라 다른 버튼과 겹치지 않는다.
// 저장(메모리 「세트 입력칸 묶인 그림」): 세트 표는 행 증감만 관찰해 필드 변경은 다음 그림(≤1.5초)에 온다. 그래서 고른 값을
//   곧바로 보이고(낙관 표시), 저장값이 그 값이 되면 저장값을 따른다. 쓰기는 블록 write 직렬화를 탄다.
//   [원본] 「저장 시각이 고른 뒤로 바뀌면」도 풀었다 — 같은 세트의 **앞선 쓰기**(대기열의 무게·횟수 blur 저장)가 고른 뒤 끝나면
//   rir 는 아직 옛 값인데 풀려 칩이 옛 값으로 돌아갔고, 그 사이 시트를 다시 열면 스테퍼가 옛 값에서 시작했다(QA CU-7).
//   [개선] **이 저장 약속이 끝난 뒤**에만 다른 저장(다른 기기 동기 등)을 따른다. 약속이 실패하면 풀고 알린다. 약속을 주지 않는
//   부르는 쪽은 저장값이 같아지거나 5초가 지나면 푼다.
// 접근 이름(QA CU-5): 보이는 글자(「목표 2」·「2 · 목표 2」)로 시작하고 세트 번호·목표를 풀어 쓴다(WCAG 2.5.3 label-in-name).
import { normalizeRir } from "@app/core";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useToast } from "../Toast";
import { RirSheet, formatRir } from "./RirSheet";

/** 약속 없는 저장·끝난 저장 뒤에도 저장값이 따라오지 않을 때 낙관 표시를 푸는 시간(ms) */
const PENDING_MAX_MS = 5000;

export function RirChip({
  setId,
  setLabel,
  rir,
  savedAt,
  target,
  onSave,
}: {
  setId: string;
  /** 세트 표시 순번(SetRowEdit label — 「1」·「D」) — 접근 이름에 넣는다(같은 이름이 세트 수만큼 반복되지 않게 · CU-5) */
  setLabel: string;
  /** 저장된 실제 RIR(null = 적지 않음) */
  rir: number | null | undefined;
  /** 세트 저장 시각(ms) — 같은 값으로 돌아온 저장도 따라가게 */
  savedAt: number;
  /** 처방 RIR(목표) */
  target: number | null;
  /** 저장 약속을 돌려주면(블록 write) 그 약속이 끝난 뒤에만 다른 저장을 따른다(CU-7) */
  onSave: (v: number | null) => unknown;
}) {
  const [open, setOpen] = useState(false);
  // 낙관 표시 — { v } 가 있으면 저장 전이라도 그 값을 보인다. done = 이 저장이 끝난 시각(null = 아직 대기열)
  const [pending, setPending] = useState<{ v: number | null; at: number; done: number | null } | null>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const saved = normalizeRir(rir);

  // [원본] if (saved === pending.v || savedAt > pending.at) setPending(null);
  // [개선] 저장값이 고른 값과 같아지면 따른다. 저장이 끝난 **뒤에** 온 다른 저장(다른 기기 동기 등)만 고른 값을 이긴다(CU-7).
  useEffect(() => {
    if (!pending) return;
    if (saved === pending.v) {
      setPending(null);
      return;
    }
    if (pending.done != null && savedAt > pending.done) setPending(null);
  }, [saved, savedAt, pending]);

  // 끝난 저장인데 저장값이 끝내 따라오지 않으면(그림이 늦거나 다른 값으로 덮임) 5초 뒤 푼다 — 영영 옛 낙관값에 묶이지 않게
  useEffect(() => {
    if (!pending) return;
    const base = pending.done ?? pending.at;
    const wait = Math.max(0, base + PENDING_MAX_MS - Date.now());
    const id = setTimeout(() => setPending((p) => (p === pending ? null : p)), wait);
    return () => clearTimeout(id);
  }, [pending]);

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
        // [원본] aria-label={shown == null ? t("effort.chipAriaEmpty") : t("effort.chipAriaValue", { value: formatRir(shown) })}
        aria-label={`${
          shown == null
            ? t("effort.chipAriaEmpty", { label, set: setLabel })
            : t("effort.chipAriaValue", { label, set: setLabel, value: formatRir(shown) })
        }${target != null ? t("effort.chipAriaTarget", { rir: formatRir(target) }) : ""}`}
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
            // [원본] setPending({ v, at: Date.now() }); onSave(v);
            const mine = { v, at: Date.now(), done: null as number | null };
            setPending(mine);
            const p = onSave(v);
            if (p && typeof (p as Promise<unknown>).then === "function")
              (p as Promise<unknown>).then(
                () => setPending((cur) => (cur === mine ? { ...mine, done: Date.now() } : cur)),
                (e: unknown) => {
                  setPending((cur) => (cur === mine ? null : cur));
                  toast(e instanceof Error ? e.message : String(e), "error");
                },
              );
          }}
          onClose={close}
        />
      ) : null}
    </>
  );
}
