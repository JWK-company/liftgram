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
// P4: 머신은 브랜드 + 적재 방식(핀/플레이트), 플레이트면 「한쪽 무게로 입력」(ADR-037). 지난 조합 기본값은 저장소가
// 블록을 만들 때 정하고(resolveStartVariant), 다른 조합 기록 보기는 종목 블록이 띄운다.
// 저장 규칙(정규화)은 저장소가 한다(normalizeVariantDimsV34) — 여기는 고르는 화면뿐이다.
// ─────────────────────────────────────────────────────────────────────────────
import {
  MACHINE_BRAND_VARIANT_KEYS,
  attachLabel,
  equipmentLabel,
  equipmentVariantLabel,
  gripLabel,
  loadLabel,
  LOAD_KEYS,
  type AttachKey,
  type LoadKey,
  type EquipmentType,
  type GripKey,
  type VariantDims,
} from "@app/core";
import { useUser } from "@app/core/state/userContext";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { lang, t } from "@/lib/i18n";
import { AppText } from "./primitives";
import { MetaAction, QuietChip } from "./quiet";

type Sibling = { id: string; equipment: string; nameKo: string };
type Axes = { attachments: string[]; grips: string[]; load: boolean };

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
  plateOneSide,
  plateDefaultLoad,
  onPlateOneSide,
}: {
  exerciseId: string;
  baseEquipment: EquipmentType | null;
  value: VariantDims;
  onChange: (dims: VariantDims) => void;
  /** 같은 family 의 다른 기구 종목으로 바꾼다 — 없으면 기구 줄을 보이지 않는다 */
  onSwap?: (exerciseId: string) => void;
  /** 플레이트 칸에서 「한쪽 무게로 입력」(ADR-037) — 넘기지 않으면 토글을 보이지 않는다 @plm SRS-058 */
  plateOneSide?: boolean;
  /** 플레이트 후보 종목의 흔한 적재 방식(후보 아니면 null) — 주면 빈 적재 칸도 이 방식으로 보고 토글을 정한다(피드백 #63) @plm SRS-084 */
  plateDefaultLoad?: "plate" | "pin" | null;
  onPlateOneSide?: (on: boolean) => void;
}) {
  const { machineVariantLabels } = useUser();
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [axes, setAxes] = useState<Axes>({ attachments: [], grips: [], load: false });
  /** 이 종목을 할 때 최근 쓴 브랜드(≤3, 최신순) — 칸 시트 위 줄(화면 정리 D9) @plm SRS-071 */
  const [recentBrands, setRecentBrands] = useState<string[]>([]);
  useEffect(() => setRoot(document.getElementById("modal-root")), []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [meta, repo] = await Promise.all([
        import("@app/core/data/catalogMeta"),
        import("@app/core/data/workoutRepository"),
      ]);
      const [sib, ax, recent] = await Promise.all([
        meta.familySiblings(exerciseId),
        meta.variantAxesFor(exerciseId),
        repo.getRecentBrands(exerciseId).catch(() => [] as string[]),
      ]);
      if (!alive) return;
      setSiblings(sib);
      setRecentBrands(recent);
      setAxes({ attachments: [...(ax.attachments ?? [])], grips: [...(ax.grips ?? [])], load: !!ax.load });
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
  const load = (value.load ?? null) as LoadKey | null;
  const hasLoad = isMachine && axes.load;
  // [원본] const showOneSide = hasLoad && load === "plate" && !!onPlateOneSide;
  // [개선] 후보 머신은 적재 칸이 비어도 기본이 한쪽이라 토글을 보인다 — 핀 칸에만 없다(피드백 #63) @plm SRS-084
  const showOneSide =
    plateDefaultLoad === undefined
      ? hasLoad && load === "plate" && !!onPlateOneSide
      : plateDefaultLoad != null && (load ?? plateDefaultLoad) === "plate" && !!onPlateOneSide;
  const canSwap = !!onSwap && siblings.length > 1;
  const hasAttach = isCable && axes.attachments.length > 0;
  const hasGrip = axes.grips.length > 0;
  // 고를 것이 아무것도 없는 종목(맨몸 고유 동작 등)은 칩 자체를 두지 않는다.
  if (!canSwap && !isMachine && !hasAttach && !hasGrip) return null; // hasLoad ⊂ isMachine

  // 칩에 보이는 요약 — 고른 조건들, 없으면 종목의 기구.
  const parts = [
    brand ? equipmentVariantLabel(brand, lang, machineVariantLabels) : null,
    load ? loadLabel(load, lang) : null,
    load === "plate" && plateOneSide ? t("variant.plateOneSide") : null,
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
      {/* [원본] 테두리 알약 칩 — 고른 조합이면 빨강(블록 머리에서 빨강이 경쟁하던 곳 · 화면 정리 기준선)
      <button type="button" data-testid="variant-trigger" onClick={() => setOpen(true)} style={{ borderColor: "var(--color-line)" }}
        className="flex min-w-0 shrink items-center gap-[3px] rounded-[var(--radius-pill)] border bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[3px]">
        <Icon name="options-outline" … /> <AppText variant="caption" color={active ? "primary" : "textMuted"}>{summary}</AppText> <Icon name="chevron-down" … />
      </button> */}
      {/* [개선] 회색 메타 조각(점선 밑줄 = 누를 수 있음) — 조합은 「무엇인지」를 알리는 정보라 빨강을 쓰지 않는다 @plm SRS-069 */}
      <MetaAction
        testId="variant-trigger"
        onPress={() => setOpen(true)}
        trailingIcon="chevron-down"
        ariaLabel={`${t("variant.selectTitle")} — ${summary}`}
      >
        {summary}
      </MetaAction>

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

                {/* [원본] 브랜드 16개(이름 없는 커스텀 1~3 포함)를 같은 무게의 테두리 칩으로 한꺼번에 깔았다 — 실제로 쓰는 건 1~2개(화면 정리 D9)
                {isMachine ? (
                  <ChipRow title={t("variant.machineBrand")} testId="slot-brand" keys={MACHINE_BRAND_VARIANT_KEYS} value={brand}
                    label={(k) => equipmentVariantLabel(k, lang, machineVariantLabels)} onPick={(k) => onChange({ ...value, equipment: k })} />
                ) : null} */}
                {/* [개선] 최근 쓴 브랜드(≤3)는 위 줄 보통 칩, 나머지는 작은 무채 칩 · 이름 없는 커스텀은 숨김(고른 칸이면 보임) @plm SRS-071 */}
                {isMachine ? (
                  <BrandRow
                    value={brand}
                    recent={recentBrands}
                    customLabels={machineVariantLabels}
                    onPick={(k) => onChange({ ...value, equipment: k })}
                  />
                ) : null}

                {/* 적재 방식 — 같은 브랜드라도 핀로드와 플레이트는 무게가 다르다(#57 · ADR-034) */}
                {hasLoad ? (
                  <ChipRow
                    title={t("variant.load")}
                    testId="slot-load"
                    keys={LOAD_KEYS}
                    value={load}
                    label={(k) => loadLabel(k, lang)}
                    onPick={(k) => onChange({ ...value, load: k })}
                  />
                ) : null}

                {/* 플레이트 한쪽 입력 — 입력은 한쪽, 볼륨·PR 은 ×2(#53 · ADR-037). 사용자 × 종목 선호라 다음에도 유지된다. */}
                {showOneSide ? (
                  <label
                    data-testid="slot-plate-one-side"
                    className="mt-[var(--spacing-md)] flex cursor-pointer items-start gap-[var(--spacing-sm)] rounded-[var(--radius-md)] bg-(--color-surface-alt) p-[var(--spacing-md)]"
                  >
                    <input
                      type="checkbox"
                      data-testid="slot-plate-one-side-input"
                      checked={!!plateOneSide}
                      onChange={(e) => onPlateOneSide?.(e.target.checked)}
                      className="mt-[3px] h-4 w-4 accent-(--color-brand)"
                    />
                    <span className="min-w-0 flex-1">
                      <AppText variant="body" className="block">
                        {t("variant.plateOneSide")}
                      </AppText>
                      <AppText variant="caption" color="textMuted" className="block">
                        {t("variant.plateOneSideHint")}
                      </AppText>
                    </span>
                  </label>
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

                {/* 기구 바꾸기 — 같은 동작의 다른 기구 **종목**으로 바뀐다(기록도 그 종목에 쌓인다 · #44).
                    가장 드물게 쓰는 줄이라 맨 아래(화면 정리 D9 — [원본] 시트 맨 위) */}
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
              </div>
            </div>,
            root,
          )
        : null}
    </>
  );
}

/**
 * 머신 브랜드 줄 — 최근 쓴 브랜드는 위 줄 보통 칩(기본 포함), 나머지는 아래 작은 무채 칩.
 * 이름을 붙이지 않은 커스텀 슬롯(custom1~3)은 숨긴다 — 지금 고른 칸이면 예외로 보인다(화면 정리 D9) @plm SRS-071
 * 칩마다 testId 는 하나(`slot-brand-<키>`) — 위 줄에 오른 브랜드는 아래 목록에서 뺀다.
 */
function BrandRow({
  value,
  recent,
  customLabels,
  onPick,
}: {
  value: string | null;
  recent: string[];
  customLabels: string[];
  onPick: (k: string | null) => void;
}) {
  const isCustom = (k: string) => k.startsWith("custom");
  const named = (k: string) => {
    if (!isCustom(k)) return true;
    const i = Number(k.slice("custom".length)) - 1;
    return !!customLabels[i]?.trim();
  };
  const visible = MACHINE_BRAND_VARIANT_KEYS.filter((k) => named(k) || k === value);
  const top = recent.filter((k) => visible.includes(k));
  const rest = visible.filter((k) => !top.includes(k));
  const label = (k: string) => equipmentVariantLabel(k, lang, customLabels);
  return (
    <div className="mt-[var(--spacing-md)]" data-testid="slot-brand">
      <div className="mb-[var(--spacing-xs)]">
        <AppText variant="label" color="textMuted">
          {t("variant.machineBrand")}
          {/* 위 줄이 왜 따로 있는지 — 최근에 쓴 브랜드(P3 QA L7) @plm SRS-071 */}
          {top.length ? ` · ${t("variant.recentHint")}` : ""}
        </AppText>
      </div>
      <div className="flex flex-wrap gap-[var(--spacing-xs)]" data-testid="slot-brand-recent">
        <SelectChip label={t("variant.default")} active={value == null} onPress={() => onPick(null)} />
        {top.map((k) => (
          <SelectChip
            key={k}
            label={label(k)}
            active={value === k}
            testId={`slot-brand-${k}`}
            onPress={() => onPick(value === k ? null : k)}
          />
        ))}
      </div>
      {rest.length ? (
        <div className="mt-[var(--spacing-sm)] flex flex-wrap gap-[6px]">
          {rest.map((k) => (
            <QuietChip
              key={k}
              compact
              label={label(k)}
              active={value === k}
              testId={`slot-brand-${k}`}
              onPress={() => onPick(value === k ? null : k)}
            />
          ))}
        </div>
      ) : null}
    </div>
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
