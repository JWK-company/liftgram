"use client";
// @plm SRS-031  종목 찾기 도우미(스무고개) — app의 features/exercises/ExerciseFinderWizard를 웹으로
//
// 이름을 몰라도 **부위 → 동작/자세(또는 기구)** 두 단계로 종목을 좁힌다. 큰 근육군은 동작/자세를
// 한 단계 더 묻고(FINDER_TREE 큐레이션), 동작이 균일한 부위는 대신 기구를 묻는다.
//
// **판단은 전부 도메인에 있다** — 어떤 부위가 동작 단계를 갖는지(muscleSubgroups),
// 어떤 기구를 물을지(FINDER_EQUIPMENTS)까지 core가 정한다. 여기 있는 것은 시트와 카드뿐이다.
//
// RN의 <Modal>은 웹에 없어 **포털**로 #modal-root에 띄운다(app 셸이 그 자리를 갖고 있다).
import {
  FINDER_EQUIPMENTS,
  muscleSubgroups,
  ALL_MUSCLE_GROUPS,
  type EquipmentType,
  type ExerciseKind,
  type MuscleGroup,
} from "@app/core";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { t, lang } from "@/lib/i18n";
import { equipmentLabelFromDomain, muscleLabelFromDomain } from "@/lib/labels";
import { Icon, type IconName } from "./ui/Icon";
import { AppText } from "./ui/primitives";

export interface WizardResult {
  muscle: MuscleGroup | null;
  equipment: EquipmentType | null;
  kind: ExerciseKind | null;
  /** 큐레이션된 동작/자세 종목 집합(있으면 이 종목들만). null = 집합 필터 없음. */
  names: string[] | null;
  /** 배너에 보여줄 선택 경로(예: '가슴 · 평평하게 밀기'). */
  label: string;
}

export default function ExerciseFinderWizard({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (r: WizardResult) => void;
}) {
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);

  // 포털 대상은 브라우저에만 있다 — 서버 렌더에서는 아무것도 그리지 않는다.
  useEffect(() => setRoot(document.getElementById("modal-root")), []);
  useEffect(() => {
    if (visible) setMuscle(null); // 열릴 때마다 1단계로
  }, [visible]);

  // Esc로 닫기 — app은 안드로이드 뒤로가기(onRequestClose)가 그 역할을 한다.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, onClose]);

  if (!visible || !root) return null;

  const subgroups = muscle ? muscleSubgroups(muscle) : null;
  const step = muscle === null ? 0 : 1;
  const mLabel = muscle ? muscleLabelFromDomain(muscle) : "";

  const pickCardio = () =>
    onDone({ muscle: null, equipment: null, kind: "cardio", names: null, label: t("wizard.cardio") });

  const pickSubgroup = (key: string) => {
    const opt = subgroups?.find((s) => s.key === key);
    if (!opt || !muscle) return;
    onDone({
      muscle,
      equipment: null,
      kind: null,
      names: opt.names,
      label: `${mLabel} · ${lang === "ko" ? opt.labelKo : opt.labelEn}`,
    });
  };

  const pickEquipment = (eq: EquipmentType | null) => {
    if (!muscle) return;
    onDone({
      muscle,
      equipment: eq,
      kind: null,
      names: null,
      label: eq ? `${mLabel} · ${equipmentLabelFromDomain(eq)}` : mLabel,
    });
  };

  const pickAllOfMuscle = () => {
    if (!muscle) return;
    onDone({ muscle, equipment: null, kind: null, names: null, label: mLabel });
  };

  return createPortal(
    // 시트는 아래에서 올라온다 — app의 animationType="slide"와 같은 자리다.
    <div data-testid="finder-wizard" className="fixed inset-0 z-50 flex items-end justify-center">
      {/* 바깥을 눌러 닫는 자리 — 진짜 버튼으로 둔다(정적 요소에 클릭을 매달지 않는다). */}
      <button
        type="button"
        data-testid="wizard-backdrop"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("wizard.open")}
        className="relative flex max-h-[82%] w-full max-w-[560px] flex-col rounded-t-[var(--radius-lg)] bg-(--color-surface) pt-[var(--spacing-md)] pb-[var(--spacing-xl)]"
      >
        <div className="flex items-center px-[var(--spacing-md)] pb-[var(--spacing-md)]">
          {step === 1 ? (
            <button
              type="button"
              data-testid="wizard-back"
              aria-label="이전 단계"
              onClick={() => setMuscle(null)}
              className="flex h-9 w-9 items-center justify-center"
            >
              <Icon name="chevron-back" size={22} color="var(--color-ink)" />
            </button>
          ) : (
            <span className="h-9 w-9" />
          )}

          <div className="flex-1">
            <AppText variant="heading" center className="block">
              {step === 0
                ? t("wizard.step1Title")
                : subgroups
                  ? t("wizard.step2MoveTitle")
                  : t("wizard.step2EquipTitle")}
            </AppText>
            <AppText variant="caption" color="textFaint" center className="mt-[2px] block">
              {step === 0 ? t("wizard.step1Of2") : `${mLabel} · ${t("wizard.step2Of2")}`}
            </AppText>
          </div>

          <button
            type="button"
            data-testid="wizard-close"
            aria-label="닫기"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center"
          >
            <Icon name="close" size={22} color="var(--color-ink2)" />
          </button>
        </div>

        <div className="no-scrollbar flex flex-wrap justify-between gap-[var(--spacing-sm)] overflow-y-auto px-[var(--spacing-lg)] pb-[var(--spacing-lg)]">
          {step === 0 ? (
            <>
              {ALL_MUSCLE_GROUPS.map((m) => (
                <WizardCard
                  key={m}
                  testId={`wizard-muscle-${m}`}
                  label={muscleLabelFromDomain(m)}
                  onPress={() => setMuscle(m)}
                />
              ))}
              <WizardCard
                testId="wizard-cardio"
                label={t("wizard.cardio")}
                icon="heart-outline"
                accent
                onPress={pickCardio}
              />
            </>
          ) : subgroups ? (
            <>
              {subgroups.map((s) => (
                <WizardCard
                  key={s.key}
                  wide
                  testId={`wizard-sub-${s.key}`}
                  label={lang === "ko" ? s.labelKo : s.labelEn}
                  onPress={() => pickSubgroup(s.key)}
                />
              ))}
              <WizardCard
                wide
                testId="wizard-all"
                label={t("wizard.allOfMuscle", { muscle: mLabel })}
                icon="apps-outline"
                onPress={pickAllOfMuscle}
              />
            </>
          ) : (
            <>
              {FINDER_EQUIPMENTS.map((eq) => (
                <WizardCard
                  key={eq}
                  testId={`wizard-equipment-${eq}`}
                  label={equipmentLabelFromDomain(eq)}
                  onPress={() => pickEquipment(eq)}
                />
              ))}
              <WizardCard
                testId="wizard-any-equipment"
                label={t("wizard.anyEquipment")}
                icon="help-circle-outline"
                onPress={() => pickEquipment(null)}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    root,
  );
}

/** 선택지 카드 — 기본은 3열 격자, 동작/자세는 문구가 길어 한 줄 전체 폭(app과 같다). */
function WizardCard({
  label,
  icon,
  accent,
  wide,
  onPress,
  testId,
}: {
  label: string;
  icon?: IconName;
  accent?: boolean;
  wide?: boolean;
  onPress: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onPress}
      style={{
        backgroundColor: accent ? "var(--color-brand-muted)" : "var(--color-surface-alt)",
        borderColor: accent ? "var(--color-brand)" : "var(--color-line)",
      }}
      className={`flex items-center rounded-[var(--radius-md)] border px-[var(--spacing-xs)] py-[var(--spacing-md)] active:opacity-70 ${
        wide
          ? "min-h-[52px] w-full justify-start gap-[var(--spacing-sm)] px-[var(--spacing-lg)]"
          : "min-h-16 w-[31%] flex-col justify-center gap-[4px]"
      }`}
    >
      {icon ? (
        <Icon name={icon} size={20} color={accent ? "var(--color-brand)" : "var(--color-ink2)"} />
      ) : null}
      <AppText variant="body" color={accent ? "primary" : "text"} center={!wide} className="font-semibold">
        {label}
      </AppText>
    </button>
  );
}
