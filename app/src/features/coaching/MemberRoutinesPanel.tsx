// @plm SRS-048  회원 루틴 처방 편집(트레이너 — 슬라이스2). 서버가 회원 SyncRecord를 갱신하고
// 회원 앱이 기존 sync pull로 받아 다음 세션부터 처방이 렌더된다(SRS-043 어휘 재사용).
// 행 편집 UI는 루틴 에디터와 공용(PrescriptionRows) — 처방 언어가 양쪽에서 동일하게 유지된다.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import type { PrescribedSet } from '../../domain';
import { PrescriptionRows, emptyRxRow, rxSummary } from '../routines/PrescriptionRows';
import { serverApi, type CoachingPeer, type CoachingRoutine, type CoachingRoutineExercise } from '../../sync/serverApi';

export function MemberRoutinesPanel({ peer, onClose }: { peer: CoachingPeer; onClose: () => void }) {
  const { t } = useT();
  const [routines, setRoutines] = useState<CoachingRoutine[] | null>(null);
  const [editing, setEditing] = useState<{ routine: CoachingRoutine; re: CoachingRoutineExercise } | null>(null);
  const [rows, setRows] = useState<PrescribedSet[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRoutines(await serverApi.coachingMemberRoutines(peer.id));
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
      setRoutines([]);
    }
  }, [peer.id, t]);
  useEffect(() => {
    load();
  }, [load]);

  function openEditor(routine: CoachingRoutine, re: CoachingRoutineExercise) {
    setRows(
      re.prescription && re.prescription.length > 0
        ? re.prescription.map((r) => ({ ...r }))
        : Array.from({ length: Math.max(1, re.targetSets || 1) }, emptyRxRow),
    );
    setEditing({ routine, re });
  }

  async function save() {
    if (!editing || saving) return;
    const hasAny = rows.some((r) => r.setType !== 'normal' || r.targetRir != null || r.repMin != null || r.repMax != null);
    setSaving(true);
    try {
      await serverApi.coachingSetPrescription(peer.id, editing.routine.id, editing.re.id, hasAny ? rows : null);
      setEditing(null);
      await load(); // 저장 결과 재조회(요약 갱신)
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.headRow}>
        <AppText variant="heading" style={{ flex: 1 }} numberOfLines={1}>
          {t('coaching.routinesTitle', { name: peer.displayName ?? '?' })}
        </AppText>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
      <AppText variant="caption" color="textFaint" style={{ marginTop: 2, marginBottom: spacing.sm }}>
        {t('coaching.routinesHint')}
      </AppText>
      {routines === null ? (
        <AppText variant="caption" color="textMuted">{t('common.loading')}</AppText>
      ) : routines.length === 0 ? (
        <AppText variant="caption" color="textMuted">{t('coaching.routinesEmpty')}</AppText>
      ) : (
        routines.map((r) => (
          <View key={r.id} style={styles.routineBox}>
            <AppText variant="body" weight="bold" numberOfLines={1}>
              {r.name || '?'}
            </AppText>
            {r.exercises.map((re) => {
              const summary = rxSummary(re.prescription);
              return (
                <Pressable key={re.id} onPress={() => openEditor(r, re)} style={styles.exRow}>
                  <AppText variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                    {re.exerciseName ?? re.exerciseId}
                  </AppText>
                  <AppText variant="label" color={summary ? 'primary' : 'textFaint'} weight={summary ? 'bold' : 'regular'}>
                    {summary ? t('routines.rxSummary', { summary }) : t('coaching.rxNone')}
                  </AppText>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </Pressable>
              );
            })}
          </View>
        ))
      )}

      {/* 처방 편집 모달 — 공용 행 에디터. 저장은 서버 경유(감사 로그 자동). */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {editing ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <AppText variant="heading" numberOfLines={1}>
                  {editing.re.exerciseName ?? '?'}
                </AppText>
                <AppText variant="caption" color="textMuted" style={{ marginTop: 2, marginBottom: spacing.sm }}>
                  {t('coaching.rxEditorHint', { name: peer.displayName ?? '?' })}
                </AppText>
                <PrescriptionRows rows={rows} onChange={setRows} />
                <View style={styles.actions}>
                  <Button title={t('common.cancel')} variant="secondary" fullWidth={false} onPress={() => setEditing(null)} style={{ flex: 1 }} />
                  <Button title={t('common.save')} loading={saving} fullWidth={false} onPress={save} style={{ flex: 1 }} />
                </View>
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  routineBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  sheet: { width: '100%', maxWidth: 400, maxHeight: '85%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
