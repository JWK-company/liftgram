"use client";
// @plm SRS-045  첫 실행 안내 — app의 features/onboarding/OnboardingOverlay.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 처음 여는 사람에게 **한 번만** 뭘 할 수 있는지 알려 준다. 두 장이다:
//   ① 이 앱이 뭔지  ② 운동 경력·코칭 의향(선택)
//
// ── 아무것도 막지 않는다 ────────────────────────────────────────────────────
// 둘째 장은 전부 건너뛸 수 있고, 답하지 않아도 어떤 기능도 잠기지 않는다.
// 답을 강요하면 처음 여는 사람이 앱을 닫는다 — 기록은 계정도 경력도 없이 시작돼야 한다.
//
// ── 본 것을 기억하는 자리 ───────────────────────────────────────────────────
// 로컬 저장소(localStorage)에 표시만 남긴다. 서버에 두면 로그인 전에는 알 수 없고,
// 로컬 DB에 두면 계정을 바꿀 때 지워져 다시 뜬다 — 둘 다 "처음 한 번"이 아니게 된다.
//
// ── 경력·의향은 서버에도 적는다 ─────────────────────────────────────────────
// 남이 보는 값이라서다(코칭 상대 찾기). 로컬에만 적으면 본인만 켠 줄 안다.
// ─────────────────────────────────────────────────────────────────────────────
import { ExperienceLevel as ExperienceLevelPB } from "@app/contracts";
import type { ExperienceLevel } from "@app/core";
import { useEffect, useState } from "react";
import { t, type TransKey } from "@/lib/i18n";
import { getPref, setPref } from "@/lib/prefs";
import { useAuth } from "./AuthProvider";
import { Button } from "./ui/Button";
import { AppText } from "./ui/primitives";

/** 본 적 있음 표시. 안내 내용이 크게 바뀌면 뒤의 번호를 올려 다시 보여 준다. */
const SEEN_KEY = "onboarding_seen_v1";

const LEVELS: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];

const EXPERIENCE_PB: Record<string, ExperienceLevelPB> = {
  beginner: ExperienceLevelPB.BEGINNER,
  intermediate: ExperienceLevelPB.INTERMEDIATE,
  advanced: ExperienceLevelPB.ADVANCED,
};

export function OnboardingOverlay() {
  // 셸에는 `UserProvider`가 없다(화면이 각자 얹는다) — 그래서 로컬 사용자는 **저장할 때**
  // 저장소에서 직접 가져온다. 여기서 훅으로 읽으면 셸 전체가 그 provider를 요구하게 되고,
  // provider가 없는 자리(404 같은)에서 렌더가 죽는다.
  const { user: account } = useAuth();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<0 | 1>(0);
  const [level, setLevel] = useState<ExperienceLevel | null>(null);
  const [intent, setIntent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 서버 렌더에는 localStorage가 없다 — 붙은 뒤에 판단한다(그 전에 그리면 매번 깜빡인다).
    if (getPref(SEEN_KEY) !== "yes") setVisible(true);
  }, []);

  function finish() {
    setVisible(false);
    setPref(SEEN_KEY, "yes");
  }

  /**
   * 답한 것만 저장한다. 저장이 실패해도 안내는 끝낸다 — 여기서 막을 이유가 없다.
   *
   * **끝나기를 기다린 뒤 닫는다.** 닫자마자 다른 화면으로 옮기는 사람이 대부분인데,
   * 그 전환이 JS 컨텍스트를 갈아치우므로 진행 중이던 저장은 그대로 사라진다.
   */
  async function saveAndFinish() {
    if (level != null || intent) {
      setSaving(true);
      await (async () => {
        try {
          const userRepo = await import("@app/core/data/userRepository");
          const local = await userRepo.getOrCreateLocalUser();
          await userRepo.updateUserSettings(local.id, {
            experienceLevel: level,
            trainerIntent: intent ? true : null,
          });
          // 안내를 닫자마자 다른 화면으로 가는 사람이 대부분이다. 화면 전환은 JS 컨텍스트를
          // 갈아치우므로, 여기서 내려쓰지 않으면 방금 답한 것이 그대로 사라진다.
          const { flushLocalDb } = await import("@/lib/localDb");
          await flushLocalDb();
          // 로그인 상태면 서버 프로필에도 — 코칭 검색이 이 값을 본다.
          if (account) {
            const { authClient } = await import("@/lib/session");
            await authClient()
              .updateProfile({
                experienceLevel: EXPERIENCE_PB[level ?? ""] ?? ExperienceLevelPB.UNSPECIFIED,
                setExperienceLevel: true,
                trainerIntent: intent,
                setTrainerIntent: true,
              })
              .catch(() => {});
          }
        } catch {
          // 무시 — 선택 항목이다.
        }
      })();
      setSaving(false);
    }
    finish();
  }

  if (!visible) return null;

  return (
    // 포털을 쓰지 않는다 — 셸 최상단에 뜨고, 이 판이 떠 있는 동안은 뒤를 만질 일이 없다.
    <div
      data-testid="onboarding"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-[var(--spacing-xl)]"
    >
      <div className="w-full max-w-[380px] rounded-[var(--radius-lg)] bg-(--color-surface) p-[var(--spacing-lg)]">
        {step === 0 ? (
          <>
            <div className="flex justify-center">
              <span className="flex h-[56px] w-[56px] items-center justify-center rounded-[var(--radius-lg)] bg-(--color-brand)">
                <AppText variant="display" style={{ color: "var(--color-on-brand)" }} className="font-bold!">
                  L
                </AppText>
              </span>
            </div>
            <AppText variant="title" className="mt-[var(--spacing-md)] block text-center">
              {t("onboarding.title")}
            </AppText>
            <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-xs)] block text-center">
              {t("onboarding.subtitle")}
            </AppText>

            <div className="mt-[var(--spacing-lg)] flex flex-col gap-[var(--spacing-sm)]">
              {(["onboarding.point1", "onboarding.point2", "onboarding.point3"] as const).map((k) => (
                <div
                  key={k}
                  className="rounded-[var(--radius-md)] bg-(--color-surface-alt) p-[var(--spacing-sm)]"
                >
                  <AppText variant="body">{t(k)}</AppText>
                </div>
              ))}
            </div>

            <div className="mt-[var(--spacing-lg)]">
              <Button title={t("onboarding.cta")} onPress={() => setStep(1)} testId="onboarding-next" />
            </div>
          </>
        ) : (
          <>
            <AppText variant="title" className="block text-center">
              {t("onboarding.expTitle")}
            </AppText>
            <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-xs)] block text-center">
              {t("onboarding.expSubtitle")}
            </AppText>

            <div className="mt-[var(--spacing-lg)] flex flex-col gap-[var(--spacing-xs)]">
              {LEVELS.map((lv) => (
                <Option
                  key={lv}
                  active={level === lv}
                  testId={`onboarding-level-${lv}`}
                  // 같은 것을 다시 누르면 해제 — "고르지 않음"으로 돌아갈 길을 남긴다.
                  onPress={() => setLevel((cur) => (cur === lv ? null : lv))}
                  title={t(`experience.level.${lv}` as TransKey)}
                  hint={t(`experience.levelHint.${lv}` as TransKey)}
                />
              ))}
              <Option
                active={intent}
                testId="onboarding-intent"
                onPress={() => setIntent((v) => !v)}
                title={t("onboarding.trainerIntentOption")}
                hint={t("experience.trainerDisclaimer")}
              />
            </div>

            <div className="mt-[var(--spacing-lg)]">
              <Button
                title={t("onboarding.expDone")}
                loading={saving}
                onPress={() => void saveAndFinish()}
                testId="onboarding-done"
              />
            </div>
            <button
              type="button"
              onClick={finish}
              data-testid="onboarding-skip"
              className="mt-[var(--spacing-sm)] block w-full text-center"
            >
              <AppText variant="caption" color="textFaint">
                {t("onboarding.skip")}
              </AppText>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Option({
  active,
  title,
  hint,
  onPress,
  testId,
}: {
  active: boolean;
  title: string;
  hint: string;
  onPress: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={active}
      data-testid={testId}
      className={`rounded-[var(--radius-md)] border p-[var(--spacing-sm)] text-left ${
        active
          ? "border-(--color-brand) bg-(--color-brand-muted)"
          : "border-(--color-line) bg-(--color-surface-alt)"
      }`}
    >
      <AppText
        variant="body"
        color={active ? "primary" : "text"}
        className={active ? "block font-bold!" : "block"}
      >
        {title}
      </AppText>
      <AppText variant="caption" color="textMuted" className="block">
        {hint}
      </AppText>
    </button>
  );
}
