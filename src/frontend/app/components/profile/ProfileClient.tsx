"use client";
// @plm SRS-006  프로필·설정 — app의 features/profile/ProfileTabScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 고르는 값들은 **다른 화면의 계산을 바꾼다**:
//   단위      무게를 kg로 저장하고 표시만 바꾼다(설정을 바꿔도 기록은 그대로다)
//   바 무게    플레이트 계산의 출발점
//   체중      어시스트(체중−보조)·맨몸±가중의 유효무게 기준 — 없으면 세션이 "체중 미설정"을 띄운다
//   가용 기구  대체운동을 내가 쓸 수 있는 것만 보여 줄지
//   머신 라벨  같은 브랜드의 다른 기구를 구분하는 3칸(전역 공용)
//
// 저장은 전부 `userRepo.updateUserSettings` 한 곳으로 간다 — 화면이 값을 직접 만지지 않는다.
//
// **아직 옮기지 않은 것**: 서버 동기·코칭·저장한 게시물·차단·모더레이션.
// 전부 피드/서버 기능이 붙어야 뜻이 있는 화면이라, 누르면 아무것도 없는 버튼을 두지 않았다.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ALL_EQUIPMENT,
  CUSTOM_VARIANT_KEYS,
  CUSTOM_VARIANT_COUNT,
  equipmentLabel,
  fromKg,
  machineVariantLabel,
  toKg,
  type EquipmentType,
  type ExperienceLevel,
  type WeightUnit,
} from "@app/core";
import { ExperienceLevel as ExperienceLevelPB, Role } from "@app/contracts";
import { useUser } from "@app/core/state/userContext";
import { useEffect, useState } from "react";
import { lang, t, type TransKey } from "@/lib/i18n";
import {
  REST_SOUND_KINDS,
  REST_VOLUME_LEVELS,
  getRestSoundKind,
  getRestVolumeLevel,
  playRestSound,
  setRestSoundKind,
  setRestVolumeLevel,
  type RestSoundKind,
  type RestVolumeLevel,
} from "@/lib/restSound";
import { useAuth } from "../AuthProvider";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { NumberStepper, TextField } from "../ui/inputs";
import { AppText, Card, Divider, SectionHeader } from "../ui/primitives";

type Language = "ko" | "en";

const REST_SOUND_LABEL: Record<RestSoundKind, TransKey> = {
  ding: "restSound.ding",
  chime: "restSound.chime",
  triad: "restSound.triad",
  buzz: "restSound.buzz",
};
const REST_VOLUME_LABEL: Record<RestVolumeLevel, TransKey> = {
  mid: "restVolume.mid",
  loud: "restVolume.loud",
  max: "restVolume.max",
};

const LEVELS: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];

/** 도메인 문자열 → 계약 enum. 서버 프로필에 적을 때만 쓴다(로컬은 문자열이 권위다). */
const EXPERIENCE_PB: Record<string, ExperienceLevelPB> = {
  beginner: ExperienceLevelPB.BEGINNER,
  intermediate: ExperienceLevelPB.INTERMEDIATE,
  advanced: ExperienceLevelPB.ADVANCED,
};

export default function ProfileClient() {
  const {
    user,
    weightUnit,
    language,
    barWeightKg,
    bodyweightKg,
    availableEquipment,
    machineVariantLabels,
    experienceLevel,
    trainerIntent,
    refresh,
  } = useUser();
  const toast = useToast();
  const { user: account } = useAuth();
  const [busy, setBusy] = useState(false);
  const [customLabels, setCustomLabels] = useState<string[]>(() => {
    const a = machineVariantLabels.slice(0, CUSTOM_VARIANT_COUNT);
    while (a.length < CUSTOM_VARIANT_COUNT) a.push("");
    return a;
  });
  const [restSound, setRestSoundState] = useState<RestSoundKind>("ding");
  const [restVol, setRestVolState] = useState<RestVolumeLevel>("loud");

  useEffect(() => {
    setRestSoundState(getRestSoundKind());
    setRestVolState(getRestVolumeLevel());
  }, []);

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-[var(--spacing-xl)]">
        <span
          role="status"
          aria-label={t("common.loading")}
          className="h-6 w-6 animate-spin rounded-full border-2 border-(--color-brand) border-t-transparent"
        />
      </div>
    );
  }

  const userId = user.id;

  const patch = (fn: () => Promise<void>) =>
    void (async () => {
      if (busy) return;
      setBusy(true);
      try {
        await fn();
        const { flushLocalDb } = await import("@/lib/localDb");
        await flushLocalDb();
        await refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
      } finally {
        setBusy(false);
      }
    })();

  const save = (settings: Record<string, unknown>) =>
    patch(async () => {
      const userRepo = await import("@app/core/data/userRepository");
      await userRepo.updateUserSettings(userId, settings);
    });

  /**
   * 경력·코칭 의향은 **서버 프로필에도** 적는다.
   *
   * 이 둘은 남이 보는 값이다 — 코칭 상대를 찾을 때 서버가 이 값으로 걸러 낸다. 로컬에만 적으면
   * 본인만 켠 줄 알고 아무에게도 안 보인다. 서버 반영이 실패해도 로컬 저장은 남긴다
   * (오프라인에서 설정을 못 바꾸면 안 된다) — 다음에 같은 값을 다시 누르면 맞춰진다.
   */
  const saveShared = (
    settings: Record<string, unknown>,
    server: { experienceLevel?: string | null; trainerIntent?: boolean },
  ) =>
    patch(async () => {
      const userRepo = await import("@app/core/data/userRepository");
      await userRepo.updateUserSettings(userId, settings);
      if (!account) return;
      const { authClient } = await import("@/lib/session");
      await authClient()
        .updateProfile({
          ...(server.experienceLevel !== undefined
            ? {
                experienceLevel: EXPERIENCE_PB[server.experienceLevel ?? ""] ?? ExperienceLevelPB.UNSPECIFIED,
                setExperienceLevel: true,
              }
            : {}),
          ...(server.trainerIntent !== undefined
            ? { trainerIntent: server.trainerIntent, setTrainerIntent: true }
            : {}),
        })
        .catch(() => {});
    });

  const weightStep = weightUnit === "kg" ? 2.5 : 5;
  const barDisplay = Number(fromKg(barWeightKg, weightUnit).toFixed(1));

  return (
    <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
      <AppText variant="display" className="mb-[var(--spacing-lg)] block">
        {t("profile.title")}
      </AppText>

      {/* 계정 — **선택이다.** 로그인하지 않아도 기록은 기기에 남는다(ADR-002). */}
      <SectionHeader title={t("profile.account")} />
      <a href="/account" className="mb-[var(--spacing-xl)] block">
        <Card>
          <div className="flex items-center gap-[var(--spacing-md)]" data-testid="account-card">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-pill)] bg-(--color-surface-alt)">
              <Icon name="person" size={20} color="var(--color-ink2)" />
            </span>
            <span className="min-w-0 flex-1">
              <AppText variant="body" className="block truncate font-semibold">
                {account ? account.displayName || account.email : t("auth.login")}
              </AppText>
              <AppText variant="caption" color="textMuted" className="mt-[2px] block truncate">
                {account ? account.email : t("auth.offlineNote")}
              </AppText>
            </span>
            <Icon name="chevron-forward" size={18} color="var(--color-ink2)" />
          </div>
        </Card>
      </a>

      {/* 경력·코칭 의향 — 선택 사항이고, 답하지 않아도 아무 기능도 막히지 않는다. */}
      <SectionHeader title={t("experience.title")} />
      <Card className="mb-[var(--spacing-xl)]">
        <AppText variant="label" color="textMuted">
          {t("experience.levelLabel")}
        </AppText>
        <div className="mt-[var(--spacing-xs)] flex flex-wrap gap-[var(--spacing-xs)]">
          {LEVELS.map((lv) => (
            <Chip
              key={lv}
              testId={`level-${lv}`}
              label={t(`experience.level.${lv}` as TransKey)}
              active={experienceLevel === lv}
              // 같은 것을 다시 누르면 해제 — "고르지 않음"으로 돌아갈 길을 남긴다.
              onPress={() => {
                const next = experienceLevel === lv ? null : lv;
                saveShared({ experienceLevel: next }, { experienceLevel: next });
              }}
            />
          ))}
        </div>

        <div className="mt-[var(--spacing-md)]">
          <AppText variant="label" color="textMuted">
            {t("experience.intentLabel")}
          </AppText>
        </div>
        <div className="mt-[var(--spacing-xs)] flex flex-wrap gap-[var(--spacing-xs)]">
          <Chip
            testId="trainer-intent"
            label={t("experience.intentYes")}
            active={trainerIntent === true}
            onPress={() => {
              const next = trainerIntent === true ? null : true;
              // 서버는 boolean만 안다 — 해제(null)는 false로 옮긴다.
              saveShared({ trainerIntent: next }, { trainerIntent: next === true });
            }}
          />
        </div>
        {trainerIntent === true ? (
          <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-xs)] block">
            {t("experience.trainerDisclaimer")}
          </AppText>
        ) : null}
      </Card>

      <SectionHeader title={t("profile.settings")} />
      <Card>
        <SettingRow label={t("profile.unit")} caption={t("profile.unitCaption")}>
          <Segmented<WeightUnit>
            testId="unit"
            options={[
              { value: "kg", label: "kg" },
              { value: "lb", label: "lb" },
            ]}
            value={weightUnit}
            disabled={busy}
            onChange={(v) => v !== weightUnit && save({ weightUnit: v })}
          />
        </SettingRow>

        <Divider />

        <SettingRow label={t("profile.language")} caption={t("profile.languageCaption")}>
          <Segmented<Language>
            testId="language"
            options={[
              { value: "ko", label: t("profile.languageKorean") },
              { value: "en", label: t("profile.languageEnglish") },
            ]}
            value={language}
            disabled={busy}
            onChange={(v) => v !== language && save({ preferredLanguage: v })}
          />
        </SettingRow>

        <Divider />

        <div className="flex items-center justify-between py-[var(--spacing-sm)]">
          <div className="mr-[var(--spacing-md)] flex-1">
            <AppText variant="body" className="block font-semibold">
              {t("profile.barWeight")}
            </AppText>
            <AppText variant="caption" color="textMuted" className="mt-[2px] block">
              {t("profile.barWeightCaption")}
            </AppText>
          </div>
          <NumberStepper
            testId="bar-weight"
            value={barDisplay}
            step={weightStep}
            min={0}
            suffix={weightUnit}
            onChange={(v) => save({ barWeightKg: toKg(v, weightUnit) })}
          />
        </div>

        <div className="flex items-center justify-between py-[var(--spacing-sm)]">
          <div className="mr-[var(--spacing-md)] flex-1">
            <AppText variant="body" className="block font-semibold">
              {t("profile.bodyweight")}
            </AppText>
            <AppText variant="caption" color="textMuted" className="mt-[2px] block">
              {t("profile.bodyweightCaption")}
            </AppText>
          </div>
          <NumberStepper
            testId="bodyweight"
            value={bodyweightKg != null ? Number(fromKg(bodyweightKg, weightUnit).toFixed(1)) : 0}
            step={weightStep === 2.5 ? 0.5 : 1}
            min={0}
            max={weightUnit === "kg" ? 300 : 660}
            suffix={weightUnit}
            // 0은 "설정 안 함"이다 — 그래야 세션이 체중 기반 계산을 건너뛴다.
            onChange={(v) => save({ bodyweightKg: v > 0 ? toKg(v, weightUnit) : null })}
          />
        </div>

        <Divider />

        <div className="py-[var(--spacing-sm)]">
          <AppText variant="body" className="block font-semibold">
            {t("profile.availableEquipment")}
          </AppText>
          <AppText variant="caption" color="textMuted" className="mt-[2px] block">
            {t("profile.availableEquipmentCaption")}
          </AppText>
          <div className="mt-[var(--spacing-sm)] flex flex-wrap gap-[var(--spacing-xs)]">
            {ALL_EQUIPMENT.map((eq) => (
              <Chip
                key={eq}
                testId={`equip-${eq}`}
                label={equipmentLabel(eq, lang)}
                active={availableEquipment.includes(eq)}
                onPress={() =>
                  save({
                    availableEquipment: availableEquipment.includes(eq)
                      ? availableEquipment.filter((e) => e !== eq)
                      : [...availableEquipment, eq],
                  })
                }
              />
            ))}
          </div>
        </div>

        <Divider />

        <div className="py-[var(--spacing-sm)]">
          <AppText variant="body" className="block font-semibold">
            {t("machineVariant.settingsTitle")}
          </AppText>
          <AppText variant="caption" color="textMuted" className="mt-[2px] mb-[var(--spacing-sm)] block">
            {t("machineVariant.settingsHint")}
          </AppText>
          {CUSTOM_VARIANT_KEYS.map((k, i) => (
            <TextField
              key={k}
              testId={`machine-label-${i}`}
              value={customLabels[i] ?? ""}
              placeholder={machineVariantLabel(k, lang)}
              onChange={(e) =>
                setCustomLabels((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
              }
              onBlur={() => save({ machineVariantLabels: customLabels.map((s) => s.trim()) })}
            />
          ))}
        </div>

        <Divider />

        <div className="py-[var(--spacing-sm)]">
          <AppText variant="body" className="block font-semibold">
            {t("profile.restSound")}
          </AppText>
          <AppText variant="caption" color="textMuted" className="mt-[2px] block">
            {t("profile.restSoundCaption")}
          </AppText>
          <div className="mt-[var(--spacing-sm)] flex flex-wrap gap-[var(--spacing-xs)]">
            {REST_SOUND_KINDS.map((k) => (
              <Chip
                key={k}
                testId={`sound-${k}`}
                label={t(REST_SOUND_LABEL[k])}
                active={restSound === k}
                // 고르는 즉시 들려 준다 — 이름만 보고는 무엇인지 알 수 없다.
                onPress={() => {
                  setRestSoundState(k);
                  setRestSoundKind(k);
                  playRestSound(k);
                }}
              />
            ))}
          </div>

          <div className="mt-[var(--spacing-md)] flex items-center justify-between">
            <AppText variant="body" className="font-semibold">
              {t("profile.restVolume")}
            </AppText>
            <Segmented<RestVolumeLevel>
              testId="rest-volume"
              options={REST_VOLUME_LEVELS.map((v) => ({ value: v, label: t(REST_VOLUME_LABEL[v]) }))}
              value={restVol}
              onChange={(v) => {
                setRestVolState(v);
                setRestVolumeLevel(v);
                playRestSound(restSound);
              }}
            />
          </div>
        </div>
      </Card>

      {/* 코칭 — 계정이 있을 때만 뜻이 있다(관계는 서버에 있다). */}
      {account ? (
        <div className="mt-[var(--spacing-md)]">
          <a href="/coaching" className="block">
            <Button
              title={t("coaching.entry")}
              icon="people-outline"
              variant="secondary"
              testId="btn-coaching"
            />
          </a>
        </div>
      ) : null}

      <div className="mt-[var(--spacing-md)]">
        <a href="/gear" className="block">
          <Button
            title={t("gear.myGearEntry")}
            icon="fitness-outline"
            variant="secondary"
            testId="btn-gear"
          />
        </a>
      </div>

      {/* 소셜 관리 — 계정이 있을 때만 뜻이 있다(차단·저장은 서버에 있다). */}
      {account ? (
        <>
          <div className="mt-[var(--spacing-sm)]">
            <a href="/bookmarks" className="block">
              <Button
                title={t("bookmark.entry")}
                icon="bookmark-outline"
                variant="secondary"
                testId="btn-bookmarks"
              />
            </a>
          </div>
          <div className="mt-[var(--spacing-sm)]">
            <a href="/blocked" className="block">
              <Button
                title={t("block.entry")}
                icon="shield-checkmark-outline"
                variant="secondary"
                testId="btn-blocked"
              />
            </a>
          </div>
          {/* 모더레이션 큐는 **역할이 있는 사람에게만** 보인다. 권한이 없으면 서버가 거절하지만,
              누를 수 없는 문을 그려 두지 않는다. */}
          {account.role === Role.MODERATOR || account.role === Role.ADMIN ? (
            <div className="mt-[var(--spacing-sm)]">
              <a href="/moderation" className="block">
                <Button
                  title={t("moderation.entry")}
                  icon="flag-outline"
                  variant="secondary"
                  testId="btn-moderation"
                />
              </a>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="mt-[var(--spacing-xl)] pb-[var(--spacing-xl)]">
        <AppText variant="caption" color="textMuted" className="block font-semibold">
          Liftgram
        </AppText>
        <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-md)] block">
          {t("wellness.noMedicalClaimNotice")}
        </AppText>
        <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-sm)] block">
          {t("wellness.safetyNotice")}
        </AppText>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  caption,
  children,
}: {
  label: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-[var(--spacing-sm)]">
      <div className="mr-[var(--spacing-md)] flex-1">
        <AppText variant="body" className="block font-semibold">
          {label}
        </AppText>
        {caption ? (
          <AppText variant="caption" color="textMuted" className="mt-[2px] block">
            {caption}
          </AppText>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** 두세 개 중 하나를 고르는 붙은 버튼(단위·언어·음량). */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  testId,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex gap-[2px] rounded-[var(--radius-pill)] bg-(--color-surface-alt) p-[2px]"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-testid={testId ? `${testId}-${o.value}` : undefined}
          // 선택 여부가 색으로만 남으면 읽어 줄 방법이 없다 — 보조기술도, 테스트도 이 값을 본다.
          // (저장이 끝나야 이 값이 뒤집힌다 — 저장→flush→재조회 뒤에 상태가 바뀌기 때문이다.)
          aria-pressed={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          style={{ backgroundColor: o.value === value ? "var(--color-brand)" : "transparent" }}
          className="rounded-[var(--radius-pill)] px-[var(--spacing-md)] py-[4px] disabled:opacity-60"
        >
          <AppText
            variant="caption"
            style={{ color: o.value === value ? "var(--color-on-brand)" : "var(--color-ink2)" }}
            className={o.value === value ? "font-bold" : ""}
          >
            {o.label}
          </AppText>
        </button>
      ))}
    </div>
  );
}

/** 켜고 끄는 알약(경력·기구·알림음). */
function Chip({
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
      data-testid={testId}
      aria-pressed={active}
      onClick={onPress}
      style={{
        backgroundColor: active ? "var(--color-brand-muted)" : "var(--color-surface-alt)",
        borderColor: active ? "var(--color-brand)" : "var(--color-line)",
      }}
      className="rounded-[var(--radius-pill)] border px-[var(--spacing-md)] py-[var(--spacing-xs)]"
    >
      <AppText variant="caption" color={active ? "primary" : "text"} className={active ? "font-bold" : ""}>
        {label}
      </AppText>
    </button>
  );
}
