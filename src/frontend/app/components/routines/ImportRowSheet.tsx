"use client";
// 가져오기 줄 편집 하단 시트(SPEC-054 Phase 3 · 스펙 리뷰 U7) — 확인 화면·받아 적기 공용.
//
// 세트 칩 1~6 + 「더」 · 횟수 칩 + 「범위」(최소~최대) · 「실패 지점까지」 · 휴식 칩.
// 칩 묶음은 role=radiogroup — 한 번 누르면 그 값이 되고, 기본값을 고치면 「표기 없음」이 사라진다(부르는 쪽이 *Stated 를 켠다).
import { useId, useState } from "react";
import { t } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { SheetShell } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

export interface RowValues {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number | null;
  noteKo: string | null;
}

const SETS = [1, 2, 3, 4, 5, 6];
const REPS = [5, 6, 8, 10, 12, 15, 20];
const RESTS = [45, 60, 90, 120, 180];
const FAILURE = "실패 지점까지";

function hasFailure(note: string | null): boolean {
  return !!note?.split(" · ").includes(FAILURE);
}
function toggleFailure(note: string | null, on: boolean): string | null {
  const parts = (note ?? "").split(" · ").filter((x) => x && x !== FAILURE);
  if (on) parts.unshift(FAILURE);
  return parts.length ? parts.join(" · ") : null;
}

function Radio({
  label,
  checked,
  onPress,
  testId,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  testId?: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 칩 모양 버튼에 radio 역할 — 누르면 바로 값이 되는 칩(스펙 리뷰 U7)
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-testid={testId}
      onClick={onPress}
      style={{
        // [원본] backgroundColor: checked ? "var(--color-surface-alt)" : "var(--color-card)", borderColor: checked ? "var(--color-ink)" : "var(--color-line-strong)", — 고르면 ink 테두리·흰 판이 동작 버튼(R1a)과 같아 보였다(REV-131)
        // [개선] R1b — 늘 옅은 판, 고르면 brand 테두리 + 진한 굵은 글자(✓ 는 숫자 칩 묶음에서 알아보기 쉽게 남긴다)
        backgroundColor: "var(--color-surface-alt)",
        borderColor: checked ? "var(--color-brand)" : "transparent",
      }}
      // [원본] className={`min-h-[44px] min-w-[44px] shrink-0 rounded-[var(--radius-pill)] border px-[var(--spacing-md)] text-[length:var(--text-sm)] text-(--color-ink) active:opacity-80 ${checked ? "font-semibold" : ""}`} — 알약 → 4px(SPEC-057 R1a·R1b)
      className={`min-h-[44px] min-w-[44px] shrink-0 rounded-[var(--radius-sm)] border px-[var(--spacing-md)] text-[length:var(--text-sm)] active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand) ${checked ? "font-semibold text-(--color-ink)" : "text-(--color-ink2)"}`}
    >
      {checked ? <span aria-hidden>✓ </span> : null}
      {label}
    </button>
  );
}

// [원본] id={`ir-${label}`} — 라벨에 공백이 있어 aria-labelledby 가 깨졌다(REV-116 P10) → useId
// 「더」·「범위」는 radio 가 아니라 묶음 뒤의 보통 버튼(P11 — radio 묶음에 토글·동작이 섞이지 않게)
function Group({
  label,
  children,
  after,
}: {
  label: string;
  children: React.ReactNode;
  after?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="mt-[var(--spacing-md)]">
      <AppText variant="label" color="textMuted" className="block" id={id}>
        {label}
      </AppText>
      {/* radiogroup 은 실제 상자로(display:contents 는 일부 Safari 가 역할을 떨어뜨린다 · REV-117 W14) */}
      <div className="mt-[var(--spacing-xs)] flex flex-wrap items-center gap-[var(--spacing-xs)]">
        <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-[var(--spacing-xs)]">
          {children}
        </div>
        {after}
      </div>
    </div>
  );
}

function Toggle({
  label,
  pressed,
  onPress,
  testId,
}: {
  label: string;
  pressed?: boolean;
  onPress: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-testid={testId}
      onClick={onPress}
      // [원본] className={`min-h-[44px] shrink-0 rounded-[var(--radius-pill)] border border-dashed px-[var(--spacing-md)] text-[length:var(--text-sm)] text-(--color-ink2) ${pressed ? "border-(--color-ink2) font-semibold" : "border-(--color-line-strong)"}`} — 알약 → 4px(SPEC-057 R1a·R1b)
      // [원본 Phase 3] 점선 테두리 — 표에 없는 꼴(REV-131 H4) → [개선] R1b 고르는 칩(옅은 판 · 켜면 brand 테두리 + 진한 굵은 글자 · ✓ 유지)
      className={`min-h-[44px] shrink-0 rounded-[var(--radius-sm)] border bg-(--color-surface-alt) px-[var(--spacing-md)] text-[length:var(--text-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand) ${pressed ? "border-(--color-brand) font-semibold text-(--color-ink)" : "border-transparent text-(--color-ink2)"}`}
    >
      {pressed ? <span aria-hidden>✓ </span> : null}
      {label}
    </button>
  );
}

export default function ImportRowSheet({
  name,
  value,
  onChange,
  onClose,
}: {
  name: string;
  value: RowValues;
  /** 바뀐 칸만 — 부르는 쪽이 「표기 없음」(stated)을 끈다 */
  onChange: (patch: Partial<RowValues>, touched: { sets?: boolean; reps?: boolean }) => void;
  onClose: () => void;
}) {
  const [range, setRange] = useState(value.repsMax !== value.repsMin);
  const [moreSets, setMoreSets] = useState(value.sets > 6);
  const [moreText, setMoreText] = useState(String(value.sets));
  const failure = hasFailure(value.noteKo);

  return (
    <SheetShell title={name} onClose={onClose} hideOk testId="import-row-sheet">
      <Group
        label={t("routineImport.sets")}
        after={
          moreSets ? (
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              aria-label={t("routineImport.setsMore")}
              data-testid="ir-sets-more-input"
              value={moreText}
              onChange={(e) => {
                // 비우고 새로 쓸 수 있게 글자는 그대로 두고, 숫자일 때만 값으로(REV-116 U11)
                setMoreText(e.target.value);
                const n = Math.round(Number(e.target.value));
                if (e.target.value !== "" && Number.isFinite(n) && n >= 1)
                  onChange({ sets: Math.min(20, n) }, { sets: true });
              }}
              onBlur={() => setMoreText(String(value.sets))}
              className="min-h-[44px] w-[72px] rounded-[var(--radius-sm)] border border-(--color-line-strong) bg-(--color-card) px-[var(--spacing-sm)] text-(--color-ink)"
            />
          ) : (
            <Toggle label={t("routineImport.more")} testId="ir-sets-more" onPress={() => setMoreSets(true)} />
          )
        }
      >
        {SETS.map((n) => (
          <Radio
            key={n}
            label={String(n)}
            checked={value.sets === n}
            testId={`ir-sets-${n}`}
            onPress={() => {
              setMoreText(String(n));
              onChange({ sets: n }, { sets: true });
            }}
          />
        ))}
      </Group>

      <Group
        label={range ? `${t("routineImport.reps")} · ${t("routineImport.repsMin")}` : t("routineImport.reps")}
        after={
          <Toggle
            label={t("routineImport.repsRange")}
            pressed={range}
            testId="ir-reps-range"
            onPress={() => {
              const next = !range;
              setRange(next);
              if (!next) onChange({ repsMax: value.repsMin }, { reps: true });
            }}
          />
        }
      >
        {REPS.map((n) => (
          <Radio
            key={n}
            label={String(n)}
            checked={value.repsMin === n}
            testId={`ir-reps-${n}`}
            onPress={() =>
              onChange(
                range ? { repsMin: n, repsMax: Math.max(n, value.repsMax) } : { repsMin: n, repsMax: n },
                {
                  reps: true,
                },
              )
            }
          />
        ))}
      </Group>
      {range ? (
        <Group label={`${t("routineImport.reps")} · ${t("routineImport.repsMax")}`}>
          {REPS.filter((n) => n >= value.repsMin).map((n) => (
            <Radio
              key={n}
              label={String(n)}
              checked={value.repsMax === n}
              testId={`ir-repsmax-${n}`}
              onPress={() => onChange({ repsMax: n }, { reps: true })}
            />
          ))}
        </Group>
      ) : null}

      <div className="mt-[var(--spacing-md)]">
        <button
          type="button"
          aria-pressed={failure}
          data-testid="ir-failure"
          onClick={() => onChange({ noteKo: toggleFailure(value.noteKo, !failure) }, {})}
          style={{
            // [원본] backgroundColor: failure ? "var(--color-surface-alt)" : "var(--color-card)", borderColor: failure ? "var(--color-ink)" : "var(--color-line-strong)", — 고르면 ink 테두리·흰 판이 동작 버튼(R1a)과 같아 보였다(REV-131)
            // [개선] R1b — 늘 옅은 판, 고르면 brand 테두리 + 진한 굵은 글자(✓ 는 숫자 칩 묶음에서 알아보기 쉽게 남긴다)
            backgroundColor: "var(--color-surface-alt)",
            borderColor: failure ? "var(--color-brand)" : "transparent",
          }}
          // [원본] className="min-h-[44px] rounded-[var(--radius-pill)] border px-[var(--spacing-md)] text-[length:var(--text-sm)] text-(--color-ink)" — 알약 → 4px(SPEC-057 R1a·R1b)
          className={`min-h-[44px] rounded-[var(--radius-sm)] border px-[var(--spacing-md)] text-[length:var(--text-sm)] ${failure ? "font-semibold text-(--color-ink)" : "text-(--color-ink2)"}`}
        >
          {failure ? <span aria-hidden>✓ </span> : null}
          {t("routineImport.toFailure")}
        </button>
      </div>

      <Group label={t("routineImport.rest")}>
        <Radio
          label={t("routineImport.restNone")}
          checked={value.restSec == null}
          testId="ir-rest-none"
          onPress={() => onChange({ restSec: null }, {})}
        />
        {RESTS.map((n) => (
          <Radio
            key={n}
            label={t("routineImport.restSec", { sec: n })}
            checked={value.restSec === n}
            testId={`ir-rest-${n}`}
            onPress={() => onChange({ restSec: n }, {})}
          />
        ))}
      </Group>

      <div className="mt-[var(--spacing-lg)]">
        <Button title={t("routineImport.done")} variant="secondary" testId="ir-done" onPress={onClose} />
      </div>
    </SheetShell>
  );
}
