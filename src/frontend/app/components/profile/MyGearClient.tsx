"use client";
// @plm SRS-042  내 장비함 — app의 features/gear/MyGearScreen.tsx를 웹으로
//
// 벨트·스트랩처럼 자주 쓰는 장비를 저장해 두고, 나중에 글을 쓸 때 그대로 불러 쓴다.
// 브랜드는 선택 입력이다 — 비우면 카테고리 이름으로 돌아간다.
//
// 저장 전 정규화(중복 제거·길이 제한)는 **저장소가 강제한다**. 화면에서 다시 하지 않는다.
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
import { useToast } from "../Toast";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/inputs";
import { AppText, Card, EmptyState } from "../ui/primitives";

export default function MyGearClient() {
  const { user, myGear, refresh } = useUser();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const owned = new Set(myGear.map((g) => g.category));

  const save = (next: GearTag[]) =>
    void (async () => {
      if (!user || saving) return;
      setSaving(true);
      try {
        const userRepo = await import("@app/core/data/userRepository");
        await userRepo.updateUserSettings(user.id, { myGear: normalizeGearTags(next) });
        const { flushLocalDb } = await import("@/lib/localDb");
        await flushLocalDb();
        await refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
      } finally {
        setSaving(false);
      }
    })();

  const toggle = (c: GearCategory) =>
    save(
      owned.has(c)
        ? myGear.filter((g) => g.category !== c)
        : [...myGear, { category: c, source: "user" as const }],
    );

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-[var(--spacing-sm)] bg-(--color-surface) px-[var(--spacing-md)] py-[var(--spacing-md)]">
        <a
          href="/profile"
          aria-label={t("profile.title")}
          className="flex h-10 w-10 items-center justify-center"
        >
          <Icon name="chevron-back" size={22} color="var(--color-ink)" />
        </a>
        <AppText variant="heading">{t("gear.myGearEntry")}</AppText>
      </header>

      <div className="flex-1 p-[var(--spacing-lg)]">
        <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-md)] block">
          {t("gear.myGearHint")}
        </AppText>

        {myGear.length === 0 ? (
          <EmptyState
            icon="fitness-outline"
            title={t("gear.myGearEmptyTitle")}
            message={t("gear.myGearEmptyMessage")}
          />
        ) : (
          <Card className="mb-[var(--spacing-md)]">
            <AppText variant="label" color="textFaint" className="mb-[var(--spacing-sm)] block">
              {t("gear.myGearSaved", { count: myGear.length })}
            </AppText>
            {myGear.map((g) => (
              <div key={g.category} className="mb-[var(--spacing-xs)] flex items-center">
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  data-testid={`gear-remove-${g.category}`}
                  onClick={() => toggle(g.category)}
                  className="pr-[var(--spacing-xs)]"
                >
                  <Icon name="close-circle" size={18} color="var(--color-ink3)" />
                </button>
                <span className="w-[72px]">
                  <AppText variant="caption" className="block truncate">
                    {t(gearLabelKey(g.category))}
                  </AppText>
                </span>
                <div className="flex-1">
                  <TextField
                    testId={`gear-brand-${g.category}`}
                    value={g.brand ?? ""}
                    placeholder={t("gear.brandPlaceholder")}
                    maxLength={MAX_GEAR_BRAND_LEN}
                    className="mb-0!"
                    onChange={(e) =>
                      save(
                        myGear.map((x) =>
                          x.category === g.category
                            ? { ...x, brand: e.target.value, brandSource: "user" as const }
                            : x,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </Card>
        )}

        <AppText variant="label" color="textFaint" className="mb-[var(--spacing-sm)] block">
          {t("gear.myGearAll")}
        </AppText>
        <div className="flex flex-col gap-[var(--spacing-xs)]" data-testid="gear-all">
          {GEAR_CATEGORIES.map((c) => {
            const on = owned.has(c);
            return (
              <button
                key={c}
                type="button"
                data-testid={`gear-${c}`}
                aria-pressed={on}
                disabled={saving}
                onClick={() => toggle(c)}
                style={{ backgroundColor: on ? "var(--color-brand-muted)" : "var(--color-surface)" }}
                className="flex items-center rounded-[var(--radius-md)] px-[var(--spacing-md)] py-[var(--spacing-md)] disabled:opacity-60"
              >
                <Icon
                  name={on ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={on ? "var(--color-brand)" : "var(--color-ink3)"}
                />
                <AppText variant="body" color={on ? "text" : "textMuted"} className="ml-[var(--spacing-sm)]">
                  {t(gearLabelKey(c))}
                </AppText>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
