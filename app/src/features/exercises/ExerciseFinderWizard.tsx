// @plm SRS-031  종목 찾기 도우미(스무고개) — 부위→기구 2단계 가이드로 초보가 이름 몰라도 종목을 좁힌다.
// 선택 결과(부위·기구·유산소)를 ExerciseListScreen 필터로 넘겨 결과 목록으로 합류. 새 분류 데이터 없이
// 기존 카탈로그 축(근육군·기구)만 사용하는 경량판. @plm SRS-031
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../components';
import {
  ALL_EQUIPMENT,
  ALL_MUSCLE_GROUPS,
  equipmentLabel,
  muscleLabel,
  type EquipmentType,
  type ExerciseKind,
  type MuscleGroup,
} from '../../domain';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';

export interface WizardResult {
  muscle: MuscleGroup | null;
  equipment: EquipmentType | null;
  kind: ExerciseKind | null;
}

export function ExerciseFinderWizard({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (r: WizardResult) => void;
}) {
  const { t, lang } = useT();
  const [step, setStep] = useState<0 | 1>(0);
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);

  // 열릴 때마다 처음 단계로 초기화.
  React.useEffect(() => {
    if (visible) {
      setStep(0);
      setMuscle(null);
    }
  }, [visible]);

  function pickMuscle(m: MuscleGroup) {
    setMuscle(m);
    setStep(1);
  }
  function pickEquipment(eq: EquipmentType | null) {
    onDone({ muscle, equipment: eq, kind: null });
  }
  function pickCardio() {
    onDone({ muscle: null, equipment: null, kind: 'cardio' });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            {step === 1 ? (
              <Pressable onPress={() => setStep(0)} hitSlop={8} style={styles.headBtn}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
            ) : (
              <View style={styles.headBtn} />
            )}
            <View style={{ flex: 1 }}>
              <AppText variant="heading" center>
                {step === 0 ? t('wizard.step1Title') : t('wizard.step2Title')}
              </AppText>
              <AppText variant="caption" color="textFaint" center style={{ marginTop: 2 }}>
                {step === 0 ? t('wizard.step1Of2') : t('wizard.step2Of2')}
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.headBtn}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {step === 0 ? (
              <>
                {ALL_MUSCLE_GROUPS.map((m) => (
                  <WizardCard key={m} label={muscleLabel(m, lang)} onPress={() => pickMuscle(m)} />
                ))}
                {/* 유산소 지름길 — 부위를 몰라도 바로 유산소 종목으로. @plm SRS-030 */}
                <WizardCard
                  label={t('wizard.cardio')}
                  icon="heart-outline"
                  accent
                  onPress={pickCardio}
                />
              </>
            ) : (
              <>
                {ALL_EQUIPMENT.map((eq) => (
                  <WizardCard key={eq} label={equipmentLabel(eq, lang)} onPress={() => pickEquipment(eq)} />
                ))}
                {/* 기구를 모르면 건너뛰기 — 부위만으로 결과. */}
                <WizardCard label={t('wizard.anyEquipment')} icon="help-circle-outline" onPress={() => pickEquipment(null)} />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function WizardCard({
  label,
  icon,
  accent,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, accent && styles.cardAccent, pressed && { opacity: 0.7 }]}
    >
      {icon ? <Ionicons name={icon} size={20} color={accent ? colors.primary : colors.textMuted} style={{ marginBottom: 4 }} /> : null}
      <AppText variant="body" weight="medium" center color={accent ? 'primary' : 'text'} numberOfLines={2}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: '82%',
  },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  headBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    justifyContent: 'space-between',
  },
  card: {
    width: '31%',
    minHeight: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  cardAccent: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
});
