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
import { AppBar } from "../ui/AppBar";
import {
  ALL_EQUIPMENT,
  CUSTOM_VARIANT_KEYS,
  CUSTOM_VARIANT_COUNT,
  equipmentLabel,
  fromKg,
  machineVariantLabel,
  toKg,
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
import { ActionSheet, SheetShell } from "../ui/Dialog";
import { NumberStepper, TextField } from "../ui/inputs";
import { AppText, Card } from "../ui/primitives";
import { ListGroup, ListRow, SectionLabel } from "../ui/rows";
// 버전 = package.json(SemVer) · 빌드 번호·커밋 = 배포 스크립트가 찍는다(deploy-h2500-3.sh). 개발 중엔 "dev".
import { PREFS_EVENT } from "@/lib/prefs";
import { BusinessInfo } from "../BusinessInfo";
import { EffortLoggingRow } from "./EffortLoggingRow"; // 세트 힘든 정도 기록 스위치 @plm SRS-073
import { MuscleMapRow } from "./MuscleMapRow"; // 근육 그림 보기 스위치 @plm SRS-075
import { BodyweightRow } from "./BodyweightRow"; // 체중 칸(최신값 + 기록 + 전체 기록) @plm SRS-077
import { WeighInSettingRow } from "./WeighInSettingRow"; // 운동 전 체중 체크인 스위치 @plm SRS-077
import { getTheme, setTheme, type ThemeChoice } from "@/lib/theme";
import { version as APP_VERSION } from "../../../package.json";
import buildInfo from "../../build-info.json";
import { LogoSpinner } from "../ui/LogoSpinner";

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
    // bodyweightKg, — 체중 칸은 BodyweightRow 가 읽는다(옛 스테퍼는 주석으로 보존) @plm SRS-077
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
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [restVol, setRestVolState] = useState<RestVolumeLevel>("loud");
  const [sheet, setSheet] = useState<
    null | "unit" | "theme" | "language" | "sound" | "equipment" | "machine" | "experience"
  >(null);

  useEffect(() => {
    // 알림음은 계정과 함께 동기된다 — 다른 기기에서 바뀌면 PrefsBridge가 PREFS_EVENT를 쏜다.
    const read = () => {
      setThemeState(getTheme());
      setRestSoundState(getRestSoundKind());
      setRestVolState(getRestVolumeLevel());
    };
    read();
    window.addEventListener(PREFS_EVENT, read);
    return () => window.removeEventListener(PREFS_EVENT, read);
  }, []);

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-[var(--spacing-xl)]">
        <span role="status" className="inline-flex">
          <LogoSpinner size={36} label="불러오는 중" />
        </span>
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

  const levelLabel = experienceLevel ? t(`experience.level.${experienceLevel}` as TransKey) : null;
  const themeLabel: Record<ThemeChoice, string> = {
    system: t("profile.themeSystem"),
    light: t("profile.themeLight"),
    dark: t("profile.themeDark"),
  };
  const displayName = account?.displayName || account?.email || "나";

  return (
    <div className="flex flex-1 flex-col">
      <AppBar title={t("profile.title")} />
      <div className="flex flex-1 flex-col px-[var(--spacing-lg)] pt-[var(--spacing-lg)] pb-[var(--spacing-xl)]">
        {/* ── 나(시안 09): 맨 위는 사람 — 아바타 · 이름 · 경력/코칭 의향 + 편집. 계정 주소 카드는 아래 「계정과 데이터」 로. */}
        <Card className="mb-[var(--spacing-xl)]">
          <div className="flex items-center gap-[var(--spacing-md)]" data-testid="profile-me">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-(--color-brand) font-bold text-(--color-on-brand) text-[length:var(--text-lg)]">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-bold text-(--color-ink) text-[length:var(--text-lg)]">
                {account ? displayName : t("profile.title")}
              </span>
              <span className="truncate text-(--color-ink2) text-[length:var(--text-sm)]">
                {[levelLabel, trainerIntent === true ? t("experience.intentYes") : null]
                  .filter(Boolean)
                  .join(" · ") || "경력·코칭 의향을 알려 주세요"}
              </span>
            </span>
            <button
              type="button"
              data-testid="btn-edit-experience"
              onClick={() => setSheet("experience")}
              className="h-9 shrink-0 rounded-[var(--radius-pill)] border border-(--color-line) px-[var(--spacing-md)] font-medium text-(--color-ink) text-[length:var(--text-sm)] active:bg-(--color-surface-alt)"
            >
              {t("common.edit")}
            </button>
          </div>
        </Card>

        {/* ── 설정: 줄 + 현재값. 누르면 선택 시트(시안 09) — 토글이 한 화면에 줄지어 있던 것을 줄 하나씩으로. */}
        <SectionLabel title={t("profile.settings")} />
        <ListGroup className="mb-[var(--spacing-xl)]">
          {/* [원본] 무게 단위 줄 — 한 헬스장 안에 kg·lb 기구가 섞여 있어 전역 단위 대신 운동 블록마다 토글한다(2026-10-27 · Q3 A) @plm SRS-067
          <ListRow
            testId="unit"
            title={t("profile.unit")}
            value={weightUnit}
            onPress={() => setSheet("unit")}
          /> */}
          <ListRow
            testId="theme"
            title={t("profile.theme")}
            value={themeLabel[theme]}
            onPress={() => setSheet("theme")}
          />
          <ListRow
            testId="language"
            title={t("profile.language")}
            value={language === "en" ? t("profile.languageEnglish") : t("profile.languageKorean")}
            onPress={() => setSheet("language")}
          />
          <ListRow
            title={t("profile.barWeight")}
            subtitle={t("profile.barWeightCaption")}
            trailing={
              <NumberStepper
                testId="bar-weight"
                value={barDisplay}
                step={weightStep}
                min={0}
                suffix={weightUnit}
                onChange={(v) => save({ barWeightKg: toKg(v, weightUnit) })}
              />
            }
          />
          {/* [원본] 체중 스테퍼 — onChange 마다 저장해 + 한 번에 이력 한 줄씩 쌓였다(U-9). 최신값 읽기 전용 + 「기록」 시트 + 「체중 기록 전체」로 바꾼다.
              (0 = 설정 안 함은 「체중 기록 전체 › 체중 미설정으로 두기」가 같은 core 경로 updateUserSettings({ bodyweightKg: null })로 잇는다) @plm SRS-077
          <ListRow
            title={t("profile.bodyweight")}
            subtitle={t("profile.bodyweightCaption")}
            trailing={
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
            }
          />
          */}
          {/* [개선] 체중 = 이력의 최신값(읽기 전용) + 「기록」 · 「체중 기록 전체」 @plm SRS-077 */}
          <BodyweightRow />
          <ListRow
            testId="row-rest-sound"
            title={t("profile.restSound")}
            value={`${t(REST_SOUND_LABEL[restSound])} · ${t(REST_VOLUME_LABEL[restVol])}`}
            onPress={() => setSheet("sound")}
          />
          <EffortLoggingRow />
          <MuscleMapRow />
          <WeighInSettingRow />
          <ListRow
            testId="row-equipment"
            title={t("profile.availableEquipment")}
            value={availableEquipment.length ? `${availableEquipment.length}개` : "전체"}
            onPress={() => setSheet("equipment")}
          />
          <ListRow
            testId="row-machine-labels"
            title={t("machineVariant.settingsTitle")}
            onPress={() => setSheet("machine")}
          />
        </ListGroup>

        {/* ── 계정과 데이터: 로그인·보안과 백업은 하위 화면(/account)으로 모은다. */}
        <SectionLabel title="계정과 데이터" />
        <ListGroup className="mb-[var(--spacing-xl)]">
          <ListRow
            testId="account-card"
            icon="lock-closed-outline"
            title={account ? "로그인·보안" : t("auth.login")}
            subtitle={account ? account.email || t("profile.account") : t("auth.offlineNote")}
            href="/account"
          />
          <ListRow
            testId="row-backup"
            icon="download-outline"
            title="백업 파일"
            subtitle="내보내기 · 가져오기"
            href="/account#backup"
          />
          <ListRow testId="btn-gear" icon="fitness-outline" title={t("gear.myGearEntry")} href="/gear" />
          {account ? (
            <>
              <ListRow
                testId="btn-coaching"
                icon="people-outline"
                title={t("coaching.entry")}
                href="/coaching"
              />
              <ListRow
                testId="btn-bookmarks"
                icon="bookmark-outline"
                title={t("bookmark.entry")}
                href="/bookmarks"
              />
              <ListRow
                testId="btn-blocked"
                icon="shield-checkmark-outline"
                title={t("block.entry")}
                href="/blocked"
              />
              {/* 모더레이션 큐는 **역할이 있는 사람에게만** 보인다. 권한이 없으면 서버가 거절하지만,
                누를 수 없는 문을 그려 두지 않는다. */}
              {account.role === Role.MODERATOR || account.role === Role.ADMIN ? (
                <ListRow
                  testId="btn-moderation"
                  icon="flag-outline"
                  title={t("moderation.entry")}
                  href="/moderation"
                />
              ) : null}
            </>
          ) : null}
        </ListGroup>

        <div className="pb-[var(--spacing-xl)]">
          <AppText
            variant="caption"
            color="textMuted"
            className="block font-semibold"
            data-testid="app-version"
          >
            Liftgram v{APP_VERSION} ({buildInfo.build})
          </AppText>
          <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-md)] block">
            {t("wellness.noMedicalClaimNotice")}
          </AppText>
          <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-sm)] block">
            {t("wellness.safetyNotice")}
          </AppText>
          <p className="mt-[var(--spacing-sm)] flex gap-[var(--spacing-md)] text-xs text-(--color-ink3)">
            <a href="/terms" className="underline">
              이용약관
            </a>
            <a href="/privacy" className="underline">
              개인정보처리방침
            </a>
          </p>
          <BusinessInfo className="mt-[var(--spacing-md)]" />
        </div>
      </div>

      {/* ── 선택 시트들 ── */}
      {sheet === "unit" ? (
        <ActionSheet
          title={t("profile.unit")}
          testId="unit-sheet"
          onClose={() => setSheet(null)}
          options={(["kg", "lb"] as WeightUnit[]).map((u) => ({
            label: u,
            selected: weightUnit === u,
            testId: `unit-${u}`,
            onPress: () => u !== weightUnit && save({ weightUnit: u }),
          }))}
        />
      ) : null}
      {sheet === "theme" ? (
        <ActionSheet
          title={t("profile.theme")}
          testId="theme-sheet"
          onClose={() => setSheet(null)}
          options={(["system", "light", "dark"] as ThemeChoice[]).map((v) => ({
            label: themeLabel[v],
            selected: theme === v,
            testId: `theme-${v}`,
            onPress: () => {
              setThemeState(v);
              setTheme(v);
            },
          }))}
        />
      ) : null}
      {sheet === "language" ? (
        <ActionSheet
          title={t("profile.language")}
          testId="language-sheet"
          onClose={() => setSheet(null)}
          options={(["ko", "en"] as Language[]).map((v) => ({
            label: v === "ko" ? t("profile.languageKorean") : t("profile.languageEnglish"),
            selected: language === v,
            testId: `language-${v}`,
            onPress: () => v !== language && save({ preferredLanguage: v }),
          }))}
        />
      ) : null}
      {sheet === "sound" ? (
        <SheetShell title={t("profile.restSound")} onClose={() => setSheet(null)} testId="sound-sheet">
          <AppText variant="caption" color="textMuted" className="block">
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
          <div className="mt-[var(--spacing-lg)] flex items-center justify-between">
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
        </SheetShell>
      ) : null}
      {sheet === "equipment" ? (
        <SheetShell
          title={t("profile.availableEquipment")}
          onClose={() => setSheet(null)}
          testId="equipment-sheet"
        >
          <AppText variant="caption" color="textMuted" className="block">
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
        </SheetShell>
      ) : null}
      {sheet === "machine" ? (
        <SheetShell
          title={t("machineVariant.settingsTitle")}
          onClose={() => setSheet(null)}
          testId="machine-sheet"
        >
          <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-sm)] block">
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
        </SheetShell>
      ) : null}
      {sheet === "experience" ? (
        <SheetShell title={t("experience.title")} onClose={() => setSheet(null)} testId="experience-sheet">
          {/* 경력·코칭 의향 — 선택 사항이고, 답하지 않아도 아무 기능도 막히지 않는다. 자주 바꾸지 않아 편집 안에 둔다. */}
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
        </SheetShell>
      ) : null}
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
