// @plm SRS-009  규칙기반 프로그램 생성 — 목표·경력·장비·일수 → 요일별 루틴(미리보기·교체·제외·채택)
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Button, AppText, Card, Divider, IconButton } from '../../components';
import { colors, fontWeight, radius, spacing } from '../../theme';
import type { RootStackScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { programRepo } from '../../data';
import type { AdoptRoutineInput } from '../../data';
import {
  ALL_EQUIPMENT,
  equipmentLabel,
  muscleLabel,
  type EquipmentType,
  type MuscleGroup,
  type ProgramExperience,
  type ProgramGoal,
} from '../../domain';
import { useT, type TransKey } from '../../i18n';
import { ExerciseName } from './ExerciseName';

interface EditSlot {
  ring: string[]; // [선택, ...대체후보] — 교체 시 회전
  idx: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number;
}
interface EditDay {
  templateKey: string;
  nameKey: string;
  index: number;
  slots: EditSlot[];
  muscles?: MuscleGroup[]; // 커스텀 분할일 때 이름 표기용
}

type GenMode = 'auto' | 'custom';

const GOALS: ProgramGoal[] = ['strength', 'hypertrophy', 'endurance'];
const EXPERIENCES: ProgramExperience[] = ['beginner', 'intermediate', 'advanced'];
const DAYS = [2, 3, 4, 5, 6];
const MODES: GenMode[] = ['auto', 'custom'];
const SPLIT_COUNTS = [2, 3, 4, 5, 6];
// 분할에 배정 가능한 근육군(전신·기타 제외 — 개별 부위만).
const SPLIT_MUSCLES: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'traps',
];

// 분할 수에 따른 합리적 기본 근육 배치(사용자가 그대로 쓰거나 수정). 결정적.
function defaultSplits(count: number): MuscleGroup[][] {
  const presets: Record<number, MuscleGroup[][]> = {
    2: [['chest', 'shoulders', 'triceps', 'abs'], ['back', 'biceps', 'quads', 'hamstrings']],
    3: [['chest', 'shoulders', 'triceps'], ['back', 'biceps', 'traps'], ['quads', 'hamstrings', 'glutes', 'calves']],
    4: [['chest', 'triceps'], ['back', 'biceps'], ['shoulders', 'abs'], ['quads', 'hamstrings', 'glutes', 'calves']],
    5: [['chest', 'triceps'], ['back', 'biceps'], ['shoulders', 'traps'], ['quads', 'calves'], ['hamstrings', 'glutes', 'abs']],
    6: [['chest'], ['back'], ['shoulders', 'traps'], ['quads', 'calves'], ['hamstrings', 'glutes'], ['biceps', 'triceps', 'abs']],
  };
  return presets[count] ?? Array.from({ length: count }, () => [] as MuscleGroup[]);
}

export default function ProgramGeneratorScreen({ navigation }: RootStackScreenProps<'ProgramGenerator'>) {
  const { t, lang } = useT();
  const { availableEquipment } = useUser();

  const [mode, setMode] = useState<GenMode>('auto');
  const [goal, setGoal] = useState<ProgramGoal>('hypertrophy');
  const [experience, setExperience] = useState<ProgramExperience>('intermediate');
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [splitCount, setSplitCount] = useState(3);
  const [splitMuscles, setSplitMuscles] = useState<MuscleGroup[][]>(() => defaultSplits(3));
  const [equipment, setEquipment] = useState<EquipmentType[]>(availableEquipment);
  const [days, setDays] = useState<EditDay[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [adopting, setAdopting] = useState(false);

  function toggleEquip(eq: EquipmentType) {
    setEquipment((prev) => (prev.includes(eq) ? prev.filter((e) => e !== eq) : [...prev, eq]));
  }

  // 모드/분할수 변경 시 이전 미리보기는 무효화(혼동 방지).
  function changeMode(m: GenMode) {
    setMode(m);
    setDays(null);
  }
  function changeSplitCount(n: number) {
    setSplitCount(n);
    setSplitMuscles(defaultSplits(n));
    setDays(null);
  }
  function toggleSplitMuscle(si: number, m: MuscleGroup) {
    setSplitMuscles((prev) =>
      prev.map((arr, i) => (i !== si ? arr : arr.includes(m) ? arr.filter((x) => x !== m) : [...arr, m])),
    );
  }

  async function onGenerate() {
    const cleanedSplits = splitMuscles.filter((s) => s.length > 0);
    if (mode === 'custom' && !cleanedSplits.length) {
      Alert.alert(t('common.error'), t('program.splitMusclesHint'));
      return;
    }
    setGenerating(true);
    try {
      const program =
        mode === 'custom'
          ? await programRepo.buildFromSplits({ splits: cleanedSplits, equipment, goal, experience })
          : await programRepo.buildProgram({ goal, experience, daysPerWeek, equipment });
      setDays(
        program.days.map((d) => ({
          templateKey: d.templateKey,
          nameKey: d.nameKey,
          index: d.index,
          muscles: d.muscles,
          slots: d.slots.map((s) => ({
            ring: [s.exerciseId, ...s.alternatives],
            idx: 0,
            targetSets: s.targetSets,
            targetRepsMin: s.targetRepsMin,
            targetRepsMax: s.targetRepsMax,
            restSeconds: s.restSeconds,
          })),
        })),
      );
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setGenerating(false);
    }
  }

  function swapSlot(di: number, si: number) {
    setDays((prev) => {
      if (!prev) return prev;
      const next = prev.map((d) => ({ ...d, slots: d.slots.map((s) => ({ ...s })) }));
      const slot = next[di].slots[si];
      if (slot.ring.length > 1) slot.idx = (slot.idx + 1) % slot.ring.length;
      return next;
    });
  }

  function removeSlot(di: number, si: number) {
    setDays((prev) => {
      if (!prev) return prev;
      const next = prev.map((d) => ({ ...d, slots: d.slots.slice() }));
      next[di].slots.splice(si, 1);
      return next;
    });
  }

  // 같은 템플릿이 2회 이상 등장하면 A/B/… 접미사.
  const repeated = new Set<string>();
  if (days) {
    const counts = new Map<string, number>();
    days.forEach((d) => counts.set(d.templateKey, (counts.get(d.templateKey) ?? 0) + 1));
    counts.forEach((c, k) => c > 1 && repeated.add(k));
  }
  function dayName(d: EditDay): string {
    if (d.templateKey === 'custom') {
      const names = (d.muscles ?? []).map((m) => muscleLabel(m, lang));
      return names.length ? names.join(' · ') : `${t('program.day.custom')} ${d.index + 1}`;
    }
    const base = t(d.nameKey as TransKey);
    return repeated.has(d.templateKey) ? `${base} ${String.fromCharCode(65 + d.index)}` : base;
  }

  const programName =
    mode === 'custom'
      ? t('program.customName')
      : t('program.namePattern', { goal: t(`program.goal.${goal}` as TransKey), days: daysPerWeek });

  async function onAdopt() {
    if (!days) return;
    const routinesInput: AdoptRoutineInput[] = days
      .filter((d) => d.slots.length > 0)
      .map((d) => ({
        name: `${programName} · ${dayName(d)}`,
        slots: d.slots.map((s) => ({
          exerciseId: s.ring[s.idx],
          targetSets: s.targetSets,
          targetRepsMin: s.targetRepsMin,
          targetRepsMax: s.targetRepsMax,
          restSeconds: s.restSeconds,
        })),
      }));
    if (!routinesInput.length) return;
    setAdopting(true);
    try {
      await programRepo.adoptProgram(programName, routinesInput);
      Alert.alert(t('program.adoptedTitle'), t('program.adoptedMessage'), [
        { text: t('common.confirm'), onPress: () => navigation.navigate('Tabs') },
      ]);
    } catch (e) {
      setAdopting(false);
      Alert.alert(t('common.error'), String(e));
    }
  }

  return (
    <Screen scroll>
      <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.lg }}>
        {t('program.intro')}
      </AppText>

      <ChipSelect<GenMode>
        label={t('program.mode')}
        options={MODES.map((m) => ({ value: m, label: t(`program.mode.${m}` as TransKey) }))}
        value={mode}
        onChange={changeMode}
      />

      <ChipSelect<ProgramGoal>
        label={t('program.goal')}
        options={GOALS.map((g) => ({ value: g, label: t(`program.goal.${g}` as TransKey) }))}
        value={goal}
        onChange={setGoal}
      />
      <ChipSelect<ProgramExperience>
        label={t('program.experience')}
        options={EXPERIENCES.map((x) => ({ value: x, label: t(`program.experience.${x}` as TransKey) }))}
        value={experience}
        onChange={setExperience}
      />
      {mode === 'auto' ? (
        <ChipSelect<number>
          label={t('program.days')}
          options={DAYS.map((d) => ({ value: d, label: String(d) }))}
          value={daysPerWeek}
          onChange={setDaysPerWeek}
        />
      ) : (
        <>
          <ChipSelect<number>
            label={t('program.splitCount')}
            options={SPLIT_COUNTS.map((n) => ({ value: n, label: String(n) }))}
            value={splitCount}
            onChange={changeSplitCount}
          />
          <View style={styles.field}>
            <AppText variant="caption" color="textFaint" style={{ marginBottom: spacing.sm }}>
              {t('program.splitMusclesHint')}
            </AppText>
            {splitMuscles.map((sel, si) => (
              <View key={si} style={{ marginBottom: spacing.md }}>
                <AppText variant="label" color="textMuted">
                  {t('program.splitLabel', { n: si + 1 })}
                </AppText>
                <View style={styles.chips}>
                  {SPLIT_MUSCLES.map((m) => {
                    const active = sel.includes(m);
                    return (
                      <Pressable
                        key={m}
                        onPress={() => toggleSplitMuscle(si, m)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <AppText
                          variant="caption"
                          style={{ color: active ? colors.onPrimary : colors.textMuted, fontWeight: active ? fontWeight.bold : fontWeight.medium }}
                        >
                          {muscleLabel(m, lang)}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* 가용 기구(다중) — 미선택 시 전체 */}
      <View style={styles.field}>
        <AppText variant="label" color="textMuted">
          {t('program.equipment')}
        </AppText>
        <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
          {t('program.equipmentHint')}
        </AppText>
        <View style={styles.chips}>
          {ALL_EQUIPMENT.map((eq) => {
            const active = equipment.includes(eq);
            return (
              <Pressable
                key={eq}
                onPress={() => toggleEquip(eq)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <AppText
                  variant="caption"
                  style={{ color: active ? colors.onPrimary : colors.textMuted, fontWeight: active ? fontWeight.bold : fontWeight.medium }}
                >
                  {equipmentLabel(eq, lang)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button
        title={days ? t('program.regenerate') : t('program.generate')}
        icon="sparkles"
        loading={generating}
        onPress={onGenerate}
        style={{ marginTop: spacing.md }}
      />

      {/* 생성 결과 미리보기 */}
      {days ? (
        <View style={{ marginTop: spacing.xl }}>
          <AppText variant="heading" style={{ marginBottom: spacing.xs }}>
            {programName}
          </AppText>
          <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.md }}>
            {t('program.generatedTitle')}
          </AppText>

          {days.map((d, di) => (
            <Card key={di} style={styles.dayCard}>
              <AppText variant="heading">{dayName(d)}</AppText>
              {d.slots.length === 0 ? (
                <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.sm }}>
                  {t('program.emptyDay')}
                </AppText>
              ) : (
                d.slots.map((s, si) => (
                  <View key={si}>
                    {si > 0 ? <Divider /> : null}
                    <View style={styles.slotRow}>
                      <View style={{ flex: 1 }}>
                        <ExerciseName exerciseId={s.ring[s.idx]} variant="body" />
                        <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
                          {s.targetSets} × {s.targetRepsMin}–{s.targetRepsMax}
                        </AppText>
                      </View>
                      {s.ring.length > 1 ? (
                        <Button title={t('routines.swap')} size="sm" variant="ghost" fullWidth={false} onPress={() => swapSlot(di, si)} />
                      ) : null}
                      <IconButton icon="close" size={18} color="textMuted" onPress={() => removeSlot(di, si)} />
                    </View>
                  </View>
                ))
              )}
            </Card>
          ))}

          <Button
            title={t('program.adopt')}
            icon="checkmark"
            loading={adopting}
            onPress={onAdopt}
            style={{ marginTop: spacing.md, marginBottom: spacing.xxl }}
          />
        </View>
      ) : null}
    </Screen>
  );
}

// 단일 선택 칩 행.
function ChipSelect<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.field}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <View style={styles.chips}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={String(opt.value)}
              onPress={() => onChange(opt.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <AppText
                variant="caption"
                style={{ color: active ? colors.onPrimary : colors.textMuted, fontWeight: active ? fontWeight.bold : fontWeight.medium }}
              >
                {opt.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayCard: { marginBottom: spacing.md },
  slotRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.xs },
});
