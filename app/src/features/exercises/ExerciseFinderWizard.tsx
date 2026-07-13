// @plm SRS-031  종목 찾기 도우미(스무고개) — 부위 → 동작/자세(또는 기구) 다단계 가이드로 종목을 좁힌다.
// 큰 근육군은 '동작/자세'(밀기·당기기·스쿼트·힌지·서서/앉아서 등)를 한 단계 더 물어 근육군+기구만으론
// 안 되던 세분화를 제공한다(FINDER_TREE 큐레이션). 동작이 균일한 부위는 대신 기구를 묻는다. 결과는
// ExerciseListScreen 필터(부위·기구·유산소·종목집합)로 반영되어 기존 picker 흐름에 합류. @plm SRS-031
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../components';
import {
  ALL_MUSCLE_GROUPS,
  FINDER_EQUIPMENTS,
  equipmentLabel,
  muscleLabel,
  muscleSubgroups,
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
  names: string[] | null; // 큐레이션된 동작/자세 종목 집합(있으면 이 종목들만). null=집합 필터 없음.
  label: string; // 배너 표시용 선택 경로(예: '가슴 · 평평하게 밀기')
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
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);

  React.useEffect(() => {
    if (visible) setMuscle(null); // 열릴 때마다 1단계로 초기화
  }, [visible]);

  const subgroups = muscle ? muscleSubgroups(muscle) : null;
  const step = muscle === null ? 0 : 1;
  const mLabel = muscle ? muscleLabel(muscle, lang) : '';

  function pickCardio() {
    onDone({ muscle: null, equipment: null, kind: 'cardio', names: null, label: t('wizard.cardio') });
  }
  function pickSubgroup(key: string) {
    const opt = subgroups?.find((s) => s.key === key);
    if (!opt || !muscle) return;
    onDone({ muscle, equipment: null, kind: null, names: opt.names, label: `${mLabel} · ${lang === 'ko' ? opt.labelKo : opt.labelEn}` });
  }
  function pickEquipment(eq: EquipmentType | null) {
    if (!muscle) return;
    onDone({ muscle, equipment: eq, kind: null, names: null, label: eq ? `${mLabel} · ${equipmentLabel(eq, lang)}` : mLabel });
  }
  function pickAllOfMuscle() {
    if (!muscle) return;
    onDone({ muscle, equipment: null, kind: null, names: null, label: mLabel });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            {step === 1 ? (
              <Pressable onPress={() => setMuscle(null)} hitSlop={8} style={styles.headBtn}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
            ) : (
              <View style={styles.headBtn} />
            )}
            <View style={{ flex: 1 }}>
              <AppText variant="heading" center>
                {step === 0 ? t('wizard.step1Title') : subgroups ? t('wizard.step2MoveTitle') : t('wizard.step2EquipTitle')}
              </AppText>
              <AppText variant="caption" color="textFaint" center style={{ marginTop: 2 }}>
                {step === 0 ? t('wizard.step1Of2') : `${mLabel} · ${t('wizard.step2Of2')}`}
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
                  <WizardCard key={m} label={muscleLabel(m, lang)} onPress={() => setMuscle(m)} />
                ))}
                <WizardCard label={t('wizard.cardio')} icon="heart-outline" accent onPress={pickCardio} />
              </>
            ) : subgroups ? (
              <>
                {subgroups.map((s) => (
                  <WizardCard key={s.key} wide label={lang === 'ko' ? s.labelKo : s.labelEn} onPress={() => pickSubgroup(s.key)} />
                ))}
                <WizardCard wide label={t('wizard.allOfMuscle', { muscle: mLabel })} icon="apps-outline" onPress={pickAllOfMuscle} />
              </>
            ) : (
              <>
                {FINDER_EQUIPMENTS.map((eq) => (
                  <WizardCard key={eq} label={equipmentLabel(eq, lang)} onPress={() => pickEquipment(eq)} />
                ))}
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
  wide,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: boolean;
  wide?: boolean; // 동작/자세는 문구가 길어 한 줄 전체 폭 카드
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, wide && styles.cardWide, accent && styles.cardAccent, pressed && { opacity: 0.7 }]}
    >
      {icon ? <Ionicons name={icon} size={20} color={accent ? colors.primary : colors.textMuted} style={{ marginBottom: wide ? 0 : 4, marginRight: wide ? 8 : 0 }} /> : null}
      <AppText variant="body" weight="medium" center={!wide} color={accent ? 'primary' : 'text'} numberOfLines={2}>
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
  // 동작/자세 카드는 문구가 길어 한 줄 전체 폭 + 좌측 정렬(아이콘·텍스트 가로 배치).
  cardWide: { width: '100%', minHeight: 52, flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: spacing.lg },
  cardAccent: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
});
