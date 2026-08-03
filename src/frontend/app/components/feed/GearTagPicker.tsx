"use client";
// @plm SRS-038  글 쓸 때 착용장비 태그 — app의 features/social/GearTagPicker.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 고른 것은 칩으로 보이고(누르면 뺀다), 버튼을 누르면 8종 목록이 뜬다.
// 브랜드는 **선택 입력**이다 — 비우면 카테고리 검색으로 돌아간다(ADR-027 D5).
//
// ── 배열 조작은 전부 도메인을 거친다 ────────────────────────────────────────
// 화이트리스트·중복·상한이 `normalizeGearTags` 한 곳에서만 강제되도록, 여기서 직접 배열을
// 만들어 넘기지 않는다. 서버도 같은 규칙을 다시 확인한다(둘 다 통과해야 저장된다).
//
// ── 내 장비함에서 한 번에 ───────────────────────────────────────────────────
// 프로필의 장비함(SRS-042)에 담아 둔 것은 여기서 한 번의 탭으로 붙인다 — 매번 8종을
// 뒤지지 않게. 이미 고른 것은 제안에서 뺀다(같은 것을 두 번 보여 주면 노이즈다).
// ─────────────────────────────────────────────────────────────────────────────
import {
  GEAR_CATEGORIES,
  MAX_GEAR_BRAND_LEN,
  gearLabelKey,
  normalizeGearTags,
  type GearCategory,
  type GearTag,
} from "@app/core";
import { useUser } from "@app/core/state/userContext";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { Overlay } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/inputs";
import { AppText } from "../ui/primitives";

export function GearTagPicker({
  value,
  onChange,
  disabled,
}: {
  value: GearTag[];
  onChange: (next: GearTag[]) => void;
  disabled?: boolean;
}) {
  const { myGear } = useUser();
  const [open, setOpen] = useState(false);

  const selected = new Set(value.map((g) => g.category));
  const suggestions = myGear.filter((g) => !selected.has(g.category));

  function toggle(c: GearCategory) {
    const next = selected.has(c)
      ? value.filter((g) => g.category !== c)
      : [...value, { category: c, source: "user" as const }];
    onChange(normalizeGearTags(next));
  }

  function setBrand(c: GearCategory, brand: string) {
    onChange(
      normalizeGearTags(
        value.map((g) => (g.category === c ? { ...g, brand, brandSource: "user" as const } : g)),
      ),
    );
  }

  return (
    <>
      {value.length > 0 ? (
        <div className="mb-[var(--spacing-xs)] flex flex-wrap gap-[var(--spacing-xs)]">
          {value.map((g) => (
            <button
              key={g.category}
              type="button"
              onClick={() => onChange(normalizeGearTags(value.filter((x) => x.category !== g.category)))}
              data-testid="gear-chip"
              className="flex items-center rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[5px]"
            >
              <AppText variant="caption">
                {g.brand ? `${g.brand} ${t(gearLabelKey(g.category))}` : t(gearLabelKey(g.category))}
              </AppText>
              <span className="ml-[4px] flex">
                <Icon name="close" size={13} color="var(--color-ink2)" />
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-testid="gear-open"
        className="flex items-center py-[var(--spacing-xs)] disabled:opacity-60"
      >
        <Icon name="fitness-outline" size={16} color="var(--color-brand)" />
        <AppText variant="caption" color="primary" className="ml-[4px] font-medium!">
          {value.length > 0 ? t("gear.editTags", { count: value.length }) : t("gear.addTags")}
        </AppText>
      </button>

      {open ? (
        <Overlay onClose={() => setOpen(false)} testId="gear-sheet">
          <AppText variant="heading">{t("gear.pickerTitle")}</AppText>
          <div className="mt-[var(--spacing-xs)] mb-[var(--spacing-md)]">
            <AppText variant="caption" color="textMuted">
              {t("gear.pickerHint")}
            </AppText>
          </div>

          {suggestions.length > 0 ? (
            <div className="mb-[var(--spacing-md)]">
              <AppText variant="label" color="textFaint" className="mb-[var(--spacing-xs)] block">
                {t("gear.myGearQuick")}
              </AppText>
              <div className="flex flex-wrap gap-[var(--spacing-xs)]">
                {suggestions.map((g) => (
                  <button
                    key={g.category}
                    type="button"
                    onClick={() => toggle(g.category)}
                    data-testid="gear-quick"
                    className="flex items-center rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[4px]"
                  >
                    <Icon name="add" size={13} color="var(--color-brand)" />
                    <AppText variant="caption" color="primary" className="ml-[2px]">
                      {t(gearLabelKey(g.category))}
                    </AppText>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {value.length > 0 ? (
            <div className="mb-[var(--spacing-md)]">
              <AppText variant="label" color="textFaint" className="mb-[var(--spacing-xs)] block">
                {t("gear.brandSection")}
              </AppText>
              {/* 브랜드는 선택 입력이다 — 비우면 카테고리 검색으로 돌아간다. */}
              {value.map((g) => (
                <div key={g.category} className="flex items-center gap-[var(--spacing-sm)]">
                  <AppText variant="caption" color="textMuted" className="w-[72px] shrink-0 truncate">
                    {t(gearLabelKey(g.category))}
                  </AppText>
                  <div className="flex-1">
                    <TextField
                      value={g.brand ?? ""}
                      onChange={(e) => setBrand(g.category, e.target.value)}
                      placeholder={t("gear.brandPlaceholder")}
                      maxLength={MAX_GEAR_BRAND_LEN}
                      testId={`gear-brand-${g.category}`}
                      className="mb-[var(--spacing-xs)]!"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <ul className="max-h-[240px] overflow-y-auto">
            {GEAR_CATEGORIES.map((c) => {
              const on = selected.has(c);
              return (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => toggle(c)}
                    data-testid="gear-option"
                    aria-pressed={on}
                    className="flex w-full items-center py-[var(--spacing-sm)] text-left"
                  >
                    <Icon
                      name={on ? "checkmark-circle" : "ellipse-outline"}
                      size={16}
                      color={on ? "var(--color-brand)" : "var(--color-ink3)"}
                    />
                    <AppText
                      variant="body"
                      color={on ? "text" : "textMuted"}
                      className="ml-[var(--spacing-sm)]"
                    >
                      {t(gearLabelKey(c))}
                    </AppText>
                  </button>
                </li>
              );
            })}
          </ul>
        </Overlay>
      ) : null}
    </>
  );
}
