"use client";
// @plm SRS-001  커스텀 종목 등록·수정 — app의 features/exercises/ExerciseFormScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// **이름 하나만 있으면 만들 수 있다.** 근육군·기구는 선택이고, 비우면 '기타'로 들어간다 —
// 헬스장에서 급히 만들 때 여덟 칸을 다 채우게 하면 아무도 만들지 않는다.
//
// 저장은 **로컬 저장소**로 간다(계정과 무관하다). 사진만 서버에 올린다 —
// 그것도 실패하면 사진 없이 만들 수 있다.
//
// ── 보조 근육에서 주 근육을 뺀다 ────────────────────────────────────────────
// 같은 근육이 양쪽에 들어가면 볼륨이 두 번 세어진다. 저장 직전에 한 번 정리한다.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ALL_EQUIPMENT,
  ALL_MUSCLE_GROUPS,
  equipmentLabel,
  muscleLabel,
  type EquipmentType,
  type MuscleGroup,
} from "@app/core";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { navigateAfterFlush } from "@/lib/localDb";
import { uploadImage } from "@/lib/mediaClient";
import { mediaSrc } from "@/lib/mediaClient";
import { useToast } from "./Toast";
import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { Icon } from "./ui/Icon";
import { TextField } from "./ui/inputs";
import { AppText } from "./ui/primitives";
import { ScreenHeader } from "./ui/ScreenHeader";

export default function ExerciseFormClient({ exerciseId }: { exerciseId?: string }) {
  const toast = useToast();
  const isEdit = !!exerciseId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [nameKo, setNameKo] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [primary, setPrimary] = useState<MuscleGroup[]>([]);
  const [secondary, setSecondary] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState<EquipmentType | null>(null);
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // 수정이면 기존 값을 채운다.
  useEffect(() => {
    if (!exerciseId) return;
    let alive = true;
    void (async () => {
      try {
        const repo = await import("@app/core/data/exerciseRepository");
        const ex = await repo.getExercise(exerciseId);
        if (!alive) return;
        setNameKo(ex.nameKo);
        setNameEn(ex.nameEn ?? "");
        setPrimary(ex.primaryMuscles);
        setSecondary(ex.secondaryMuscles);
        setEquipment(ex.equipment);
        setCategory(ex.category ?? "");
        setImageUrl(ex.imageUrl);
      } catch {
        toast(t("common.error"), "error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [exerciseId, toast]);

  function toggle<T>(setter: (fn: (prev: T[]) => T[]) => void, v: T) {
    setter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  async function pickImage(file: File) {
    if (uploading) return;
    setUploading(true);
    try {
      setImageUrl(await uploadImage(file));
    } catch {
      // 사진이 없어도 종목은 만들 수 있다 — 여기서 막지 않는다.
      toast(t("exercises.imageUploadFailed"), "error");
    } finally {
      setUploading(false);
    }
  }

  const valid = nameKo.trim().length > 0;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      // 미지정은 '기타'로 — 이름만으로 만들 수 있게 하는 것이 이 화면의 전제다.
      const primaryClean: MuscleGroup[] = primary.length ? primary : ["other"];
      // 같은 근육이 주·보조 양쪽에 들어가면 볼륨이 두 번 세어진다.
      const secondaryClean = secondary.filter((m) => !primaryClean.includes(m));
      const input = {
        nameKo: nameKo.trim(),
        nameEn: nameEn.trim() || null,
        primaryMuscles: primaryClean,
        secondaryMuscles: secondaryClean,
        equipment: equipment ?? ("other" as EquipmentType),
        category: category.trim() || null,
        imageUrl,
      };

      const repo = await import("@app/core/data/exerciseRepository");
      if (isEdit && exerciseId) await repo.updateExercise(exerciseId, input);
      else await repo.createCustomExercise(input);

      // 로컬 저장소는 비동기로 내려쓴다 — 목록으로 옮겨 가기 전에 확실히 남긴다.
      await navigateAfterFlush("/exercises");
    } catch {
      toast(t("common.error"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={isEdit ? t("exercises.editTitle") : t("exercises.customTitle")}
        back={
          <a href="/exercises" aria-label={t("exercises.title")} data-testid="form-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-[var(--spacing-xl)]">
          <span
            role="status"
            className="h-5 w-5 animate-spin rounded-full border-2 border-(--color-brand) border-t-transparent"
          />
        </div>
      ) : (
        <div className="flex-1 p-[var(--spacing-lg)]" data-testid="exercise-form">
          <TextField
            label={t("exercises.nameKoLabel")}
            placeholder={t("exercises.nameKoPlaceholder")}
            value={nameKo}
            onChange={(e) => setNameKo(e.target.value)}
            testId="form-name-ko"
          />
          <TextField
            label={t("exercises.nameEnLabel")}
            placeholder={t("exercises.nameEnPlaceholder")}
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            testId="form-name-en"
          />

          <FieldLabel text={t("exercises.imageLabel")} hint={t("exercises.optionalHint")} />
          <div className="mb-[var(--spacing-lg)] flex items-center gap-[var(--spacing-md)]">
            {imageUrl ? (
              // biome-ignore lint/performance/noImgElement: 스토리지에서 오는 사진
              <img
                src={mediaSrc(imageUrl)}
                alt=""
                data-testid="form-image"
                className="h-[88px] w-[88px] rounded-[var(--radius-md)] bg-(--color-surface-alt) object-cover"
              />
            ) : (
              <span className="flex h-[88px] w-[88px] items-center justify-center rounded-[var(--radius-md)] bg-(--color-surface-alt)">
                <Icon name="image-outline" size={28} color="var(--color-ink3)" />
              </span>
            )}
            <div className="flex flex-1 flex-col gap-[var(--spacing-xs)]">
              <label className="block">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  data-testid="form-image-file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void pickImage(f);
                    e.target.value = "";
                  }}
                />
                <span className="flex h-[46px] items-center justify-center rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface-alt)">
                  <AppText variant="body" color={uploading ? "textMuted" : "text"}>
                    {uploading
                      ? t("feed.uploading")
                      : imageUrl
                        ? t("exercises.changeImage")
                        : t("exercises.addImage")}
                  </AppText>
                </span>
              </label>
              {imageUrl ? (
                <Button
                  title={t("exercises.removeImage")}
                  variant="danger"
                  onPress={() => setImageUrl(null)}
                  disabled={uploading}
                  testId="form-image-remove"
                />
              ) : null}
            </div>
          </div>

          <FieldLabel text={t("exercises.primaryMusclesLabel")} hint={t("exercises.optionalHint")} />
          <ChipGrid>
            {ALL_MUSCLE_GROUPS.map((m) => (
              <Chip
                key={m}
                label={muscleLabel(m, "ko")}
                active={primary.includes(m)}
                onPress={() => toggle(setPrimary, m)}
              />
            ))}
          </ChipGrid>

          <FieldLabel text={t("exercises.secondaryMusclesLabel")} hint={t("exercises.optionalHint")} />
          <ChipGrid>
            {ALL_MUSCLE_GROUPS.map((m) => (
              <Chip
                key={m}
                label={muscleLabel(m, "ko")}
                active={secondary.includes(m)}
                onPress={() => toggle(setSecondary, m)}
              />
            ))}
          </ChipGrid>

          <FieldLabel text={t("exercises.equipmentLabel")} hint={t("exercises.optionalHint")} />
          <ChipGrid>
            {ALL_EQUIPMENT.map((eq) => (
              <Chip
                key={eq}
                label={equipmentLabel(eq, "ko")}
                active={equipment === eq}
                onPress={() => setEquipment((prev) => (prev === eq ? null : eq))}
              />
            ))}
          </ChipGrid>

          <div className="mt-[var(--spacing-lg)]">
            <TextField
              label={t("exercises.categoryLabel")}
              placeholder={t("exercises.categoryPlaceholder")}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              testId="form-category"
            />
          </div>

          <div className="mt-[var(--spacing-lg)] mb-[var(--spacing-xl)]">
            <Button
              title={isEdit ? t("common.save") : t("common.add")}
              onPress={save}
              disabled={!valid}
              loading={saving}
              testId="form-save"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function FieldLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="mb-[var(--spacing-xs)] flex items-baseline gap-[var(--spacing-xs)]">
      <AppText variant="label" color="textMuted">
        {text}
      </AppText>
      {hint ? (
        <AppText variant="label" color="textFaint">
          {hint}
        </AppText>
      ) : null}
    </div>
  );
}

function ChipGrid({ children }: { children: React.ReactNode }) {
  return <div className="mb-[var(--spacing-lg)] flex flex-wrap gap-[var(--spacing-xs)]">{children}</div>;
}
