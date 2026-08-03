"use client";
// @plm SRS-028  종목 변형(기구·머신 브랜드) 선택 — app의 components/VariantSelector.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 있는가: 같은 종목이라도 **기구가 다르면 다른 기록**이다(바벨 벤치 100kg ≠ 스미스 벤치 100kg).
// 변형을 고르면 이전기록·PR·볼륨이 **(종목 × variant_key) 버킷**으로 갈라져 추적된다.
//
// 규칙은 전부 도메인에 있다 — 어떤 기구가 레벨1인지(IMPLEMENT_KEYS), 머신 브랜드가 무엇인지
// (MACHINE_BRAND_VARIANT_KEYS), 라벨은 무엇인지(equipmentVariantLabel)까지. 여기 있는 것은 시트뿐이다.
//
// **버킷 불변식(주의)**: 종목 고유 기구를 고르면 `equipment: null` 로 저장한다 — 기본 버킷이
// 곧 고유 기구이고, 여기서 키를 새로 만들면 **기존 기록이 다른 버킷으로 흩어진다.**
// ─────────────────────────────────────────────────────────────────────────────
import {
  IMPLEMENT_KEYS,
  MACHINE_BRAND_VARIANT_KEYS,
  equipmentVariantLabel,
  equipmentVariantShortLabel,
  isMachineEquipSel,
  type EquipmentType,
  type VariantDims,
} from "@app/core";
import { useUser } from "@app/core/state/userContext";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { lang, t } from "@/lib/i18n";
import { Icon } from "./Icon";
import { AppText } from "./primitives";

export function VariantSelector({
  baseEquipment,
  value,
  onChange,
}: {
  baseEquipment: EquipmentType | null;
  value: VariantDims;
  onChange: (dims: VariantDims) => void;
}) {
  const { machineVariantLabels } = useUser();
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => setRoot(document.getElementById("modal-root")), []);

  const equip = value.equipment ?? null;
  const isMachineBase = baseEquipment === "machine";
  // '머신' 칩의 켜짐은 **현재 선택** 기준이다 — 머신 종목이라도 바벨을 고르면 꺼져야 한다
  // (app이 겪은 버그: 종목 기준으로 판정해 항상 켜져 보였다). 머신 종목의 기본(null)은 켜짐으로 본다.
  const machineActive = isMachineEquipSel(equip) || (isMachineBase && equip == null);
  const genericMachine: string | null = isMachineBase ? null : "machine";

  const intrinsicImplement =
    baseEquipment && (IMPLEMENT_KEYS as readonly string[]).includes(baseEquipment) ? baseEquipment : null;
  // 고유 기구가 있으면 '기본' 칩을 생략한다(고유 기구가 곧 기본).
  const level1: (string | null)[] = intrinsicImplement ? [...IMPLEMENT_KEYS] : [null, ...IMPLEMENT_KEYS];
  const l1Selected = equip ?? (isMachineBase ? null : intrinsicImplement);
  const triggerEquip = equip ?? (isMachineBase ? "machine" : intrinsicImplement);
  const active = Boolean(triggerEquip);
  const label = equipmentVariantShortLabel(triggerEquip, lang, machineVariantLabels);

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
          {label}
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

                {/* 레벨1: 베이스 기구 — 머신 종목에서도 상시 노출한다(프리웨이트 대체 변형을 고를 수 있게). */}
                <div className="mt-[var(--spacing-md)] mb-[var(--spacing-xs)]">
                  <AppText variant="label" color="textMuted">
                    {t("variant.equipment")}
                  </AppText>
                </div>
                <div className="flex flex-wrap gap-[var(--spacing-xs)]">
                  {level1.map((k) => (
                    <SelectChip
                      key={k ?? "default"}
                      label={equipmentVariantLabel(k, lang, machineVariantLabels)}
                      active={k === "machine" ? machineActive : (k ?? null) === l1Selected}
                      // 고유 기구 선택 = 기본 버킷(null) — 기존 기록을 그대로 잇기 위해서다.
                      onPress={() => onChange({ ...value, equipment: k === baseEquipment ? null : k })}
                    />
                  ))}
                </div>

                {/* 레벨2: 머신 브랜드 — 한 레벨 아래(좌측 레일). 브랜드 선택은 선택 사항이다. */}
                {machineActive ? (
                  <div className="mt-[var(--spacing-md)] ml-[var(--spacing-md)] border-(--color-brand-muted) border-l-2 pl-[var(--spacing-md)]">
                    <div className="mb-[var(--spacing-xs)]">
                      <AppText variant="label" color="textFaint">
                        {t("variant.machineBrand")}
                      </AppText>
                    </div>
                    <div className="flex flex-wrap gap-[var(--spacing-xs)]">
                      <SelectChip
                        label={t("variant.default")}
                        active={(equip ?? null) === (genericMachine ?? null)}
                        onPress={() => onChange({ ...value, equipment: genericMachine })}
                      />
                      {MACHINE_BRAND_VARIANT_KEYS.map((k) => (
                        <SelectChip
                          key={k}
                          label={equipmentVariantLabel(k, lang, machineVariantLabels)}
                          active={equip === k}
                          onPress={() => onChange({ ...value, equipment: k })}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>,
            root,
          )
        : null}
    </>
  );
}

function SelectChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
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
