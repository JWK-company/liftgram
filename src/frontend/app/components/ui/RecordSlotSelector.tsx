"use client";
// @plm SRS-057 SRS-058  기록 칸 선택 — 기구 바꾸기(종목 교체) · 머신 브랜드 · 케이블 부착물 · 손 그립 (카탈로그 개편 P2)
//
// ─────────────────────────────────────────────────────────────────────────────
// 옛 VariantSelector 는 「기구」 칩(바벨·덤벨·케이블…)을 같은 종목의 변형 칸으로 저장했다. 그래서 바벨 인클라인을
// 덤벨로 바꿔 한 기록이 덤벨 인클라인 프레스 기록과 갈라졌다(#44). ADR-033·034 부터는
//
//   · 기구를 바꾸면 **종목이 바뀐다** — 같은 동작 그룹(family)의 그 기구 종목으로 교체(onSwap). 없는 기구는 안 보인다.
//   · 칸은 종목 × [머신 브랜드] × [케이블 부착물] × [손 그립] — 허용 목록은 family 메타가 정한다(없으면 그 줄이 없다).
//
// 최소판이다(P2): 적재 방식(핀/플레이트)·지난 조합 기본값·다른 조합 기록 보기는 P4 에서 이 시트에 더한다.
// 저장 규칙(정규화)은 저장소가 한다(normalizeVariantDimsV34) — 여기는 고르는 화면뿐이다.
// ─────────────────────────────────────────────────────────────────────────────
import {
  MACHINE_BRAND_VARIANT_KEYS,
  attachLabel,
  equipmentLabel,
  equipmentVariantLabel,
  gripLabel,
  type AttachKey,
  type EquipmentType,
  type GripKey,
  type VariantDims,
} from "@app/core";
import { useUser } from "@app/core/state/userContext";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { lang, t } from "@/lib/i18n";
import { Icon } from "./Icon";
import { AppText } from "./primitives";

type Sibling = { id: string; equipment: string; nameKo: string };
type Axes = { attachments: string[]; grips: string[] };

/** 칩 한 줄 — 기본 + 값들. 고른 것을 다시 누르면 기본으로(해제). */
function ChipRow<K extends string>({
  title,
  testId,
  keys,
  value,
  label,
  onPick,
}: {
  title: string;
  testId: string;
  keys: readonly K[];
  value: K | null;
  label: (k: K) => string;
  onPick: (k: K | null) => void;
}) {
  return (
    <div className="mt-[var(--spacing-md)]" data-testid={testId}>
      <div className="mb-[var(--spacing-xs)]">
        <AppText variant="label" color="textMuted">
          {title}
        </AppText>
      </div>
      <div className="flex flex-wrap gap-[var(--spacing-xs)]">
        <SelectChip label={t("variant.default")} active={value == null} onPress={() => onPick(null)} />
        {keys.map((k) => (
          <SelectChip
            key={k}
            label={label(k)}
            active={value === k}
            testId={`${testId}-${k}`}
            onPress={() => onPick(value === k ? null : k)}
          />
        ))}
      </div>
    </div>
  );
}

export function RecordSlotSelector({
  exerciseId,
  baseEquipment,
  value,
  onChange,
  onSwap,
}: {
  exerciseId: string;
  baseEquipment: EquipmentType | null;
  value: VariantDims;
  onChange: (dims: VariantDims) => void;
  /** 같은 family 의 다른 기구 종목으로 바꾼다 — 없으면 기구 줄을 보이지 않는다 */
  onSwap?: (exerciseId: string) => void;
}) {
  const { machineVariantLabels } = useUser();
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [axes, setAxes] = useState<Axes>({ attachments: [], grips: [] });
  useEffect(() => setRoot(document.getElementById("modal-root")), []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const meta = await import("@app/core/data/catalogMeta");
      const [sib, ax] = await Promise.all([meta.familySiblings(exerciseId), meta.variantAxesFor(exerciseId)]);
      if (!alive) return;
      setSiblings(sib);
      setAxes({ attachments: [...(ax.attachments ?? [])], grips: [...(ax.grips ?? [])] });
    })();
    return () => {
      alive = false;
    };
  }, [exerciseId]);

  const isMachine = baseEquipment === "machine";
  const isCable = baseEquipment === "cable";
  const brand = value.equipment ?? null;
  const attach = (value.attach ?? null) as AttachKey | null;
  const grip = (value.grip ?? null) as GripKey | null;
  const canSwap = !!onSwap && siblings.length > 1;
  const hasAttach = isCable && axes.attachments.length > 0;
  const hasGrip = axes.grips.length > 0;
  // 고를 것이 아무것도 없는 종목(맨몸 고유 동작 등)은 칩 자체를 두지 않는다.
  if (!canSwap && !isMachine && !hasAttach && !hasGrip) return null;

  // 칩에 보이는 요약 — 고른 조건들, 없으면 종목의 기구.
  const parts = [
    brand ? equipmentVariantLabel(brand, lang, machineVariantLabels) : null,
    attach ? attachLabel(attach, lang) : null,
    grip ? gripLabel(grip, lang) : null,
  ].filter(Boolean) as string[];
  const active = parts.length > 0;
  const summary = active
    ? parts.join(" · ")
    : baseEquipment
      ? equipmentLabel(baseEquipment, lang)
      : t("variant.default");

  return (
    <>
      <button
        type="button"
        data-testid="variant-trigger"
        onClick={() => setOpen(true)}
        style={{ borderColor: "var(--color-line)" }}
        className="flex min-w-0 shrink items-center gap-[3px] rounded-[var(--radius-pill)] border bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[3px]"
      >
        <Icon name="options-outline" size={12} color={active ? "var(--color-brand)" : "var(--color-ink2)"} />
        <AppText variant="caption" color={active ? "primary" : "textMuted"} className="truncate">
          {summary}
        </AppText>
        <Icon name="chevron-down" size={12} color={active ? "var(--color-brand)" : "var(--color-ink2)"} />
      </button>

      {open && root
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center p-[var(--spacing-xl)]">
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setOpen(false)}
                className="absolute inset-0 bg-black/50"
              />
              <div
                role="dialog"
                aria-modal="true"
                data-testid="variant-sheet"
                className="relative max-h-[80%] w-full max-w-[440px] overflow-y-auto rounded-[var(--radius-lg)] bg-(--color-surface) p-[var(--spacing-lg)]"
              >
                <AppText variant="heading">{t("variant.selectTitle")}</AppText>

                {/* 기구 바꾸기 — 같은 동작의 다른 기구 **종목**으로 바뀐다(기록도 그 종목에 쌓인다 · #44) */}
                {canSwap ? (
                  <div className="mt-[var(--spacing-md)]" data-testid="swap-equipment">
                    <div className="mb-[var(--spacing-xs)]">
                      <AppText variant="label" color="textMuted">
                        {t("variant.changeEquipment")}
                      </AppText>
                    </div>
                    <div className="flex flex-wrap gap-[var(--spacing-xs)]">
                      {siblings.map((s) => (
                        <SelectChip
                          key={s.id}
                          label={equipmentLabel(s.equipment as EquipmentType, lang)}
                          active={s.id === exerciseId}
                          testId={`swap-${s.equipment}`}
                          onPress={() => {
                            if (s.id === exerciseId) return;
                            setOpen(false);
                            onSwap?.(s.id);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {isMachine ? (
                  <ChipRow
                    title={t("variant.machineBrand")}
                    testId="slot-brand"
                    keys={MACHINE_BRAND_VARIANT_KEYS}
                    value={brand}
                    label={(k) => equipmentVariantLabel(k, lang, machineVariantLabels)}
                    onPick={(k) => onChange({ ...value, equipment: k })}
                  />
                ) : null}

                {hasAttach ? (
                  <ChipRow
                    title={t("variant.attachment")}
                    testId="slot-attach"
                    keys={axes.attachments as AttachKey[]}
                    value={attach}
                    label={(k) => attachLabel(k, lang)}
                    onPick={(k) => onChange({ ...value, attach: k })}
                  />
                ) : null}

                {hasGrip ? (
                  <ChipRow
                    title={t("variant.grip")}
                    testId="slot-grip"
                    keys={axes.grips as GripKey[]}
                    value={grip}
                    label={(k) => gripLabel(k, lang)}
                    onPick={(k) => onChange({ ...value, grip: k })}
                  />
                ) : null}
              </div>
            </div>,
            root,
          )
        : null}
    </>
  );
}

function SelectChip({
  label,
  active,
  onPress,
  testId,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      data-testid={testId}
      aria-pressed={active}
      style={{
        backgroundColor: active ? "var(--color-brand-muted)" : "var(--color-surface-alt)",
        borderColor: active ? "var(--color-brand)" : "var(--color-line)",
      }}
      className="rounded-[var(--radius-pill)] border px-[var(--spacing-md)] py-[var(--spacing-xs)]"
    >
      <AppText variant="caption" color={active ? "primary" : "text"}>
        {label}
      </AppText>
    </button>
  );
}
