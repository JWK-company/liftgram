"use client";
// @plm SRS-042  내 장비함 — app의 features/gear/MyGearScreen.tsx를 웹으로
//
// 벨트·스트랩처럼 자주 쓰는 장비를 저장해 두고, 나중에 글을 쓸 때 그대로 불러 쓴다.
// 브랜드는 선택 입력이다 — 비우면 카테고리 이름으로 돌아간다.
//
// 저장 전 정규화(중복 제거·길이 제한)는 **저장소가 강제한다**. 화면에서 다시 하지 않는다.
import { errorText } from "@/lib/errorText";
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
import { ScreenHeader } from "../ui/ScreenHeader";
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
        toast(errorText(e), "error");
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
      <ScreenHeader
        title={t("gear.myGearEntry")}
        back={
          <a href="/profile" aria-label={t("profile.title")} data-testid="gear-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />

      <div className="flex-1 p-[var(--spacing-lg)]">
        {/* [원본] <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-md)] block">
          {t("gear.myGearHint")}
        </AppText> */}
        {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}

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
                  // [원본] className="pr-[var(--spacing-xs)]" · [개선] 누르는 자리 44px(SPEC-056 F7)
                  className="-ml-[13px] flex h-[44px] w-[44px] shrink-0 items-center justify-center"
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
        {/* [원본] <div className="flex flex-col gap-[var(--spacing-xs)]" data-testid="gear-all"> · [개선] 구분선 목록(SPEC-056 F1) */}
        <div className="flex flex-col border-(--color-line) border-t" data-testid="gear-all">
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
                // [원본] style={{ backgroundColor: on ? "var(--color-brand-muted)" : "var(--color-surface)" }}
                // [원본] className="flex items-center rounded-[var(--radius-md)] px-[var(--spacing-md)] py-[var(--spacing-md)] disabled:opacity-60"
                // [개선] 고른 줄을 채움으로 보이지 않는다 — ✓ 아이콘·글자 진하기로, 줄은 아래 가는 선(SPEC-056 F1·F6)
                className="flex min-h-[44px] items-center border-(--color-line) border-b px-[var(--spacing-xs)] py-[var(--spacing-md)] disabled:opacity-60"
              >
                <Icon
                  name={on ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={on ? "var(--color-brand)" : "var(--color-ink3)"}
                />
                <AppText
                  variant="body"
                  color={on ? "text" : "textMuted"}
                  // [원본] className="ml-[var(--spacing-sm)]" · [개선] 고른 줄은 굵게(SPEC-056 F6)
                  className={`ml-[var(--spacing-sm)] ${on ? "font-semibold" : ""}`}
                >
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
