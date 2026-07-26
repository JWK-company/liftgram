// @plm SRS-002  루틴 목록 + 세션 시작 + 진행중 세션 복구 배너
// @plm SRS-044  주단위 스케줄·블록(요일→루틴, N주+1주 디로딩) — 오늘 운동·주차 스트립·편집
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReorderableList, { useReorderableDrag, type ReorderableListReorderEvent } from 'react-native-reorderable-list';

// 모바일 웹(PWA)에서 핸들 터치가 브라우저 스크롤로 가로채지지 않게 — 드래그 활성화(RN-web 전용). 데스크톱은 grab 커서.
const webDragHandleStyle: object | undefined =
  Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'grab', userSelect: 'none' } as object) : undefined;
import { useFocusEffect } from '@react-navigation/native';
import {
  Screen,
  Button,
  IconButton,
  AppText,
  Card,
  SectionHeader,
  EmptyState,
} from '../../components';
import type { TabScreenProps } from '../../navigation/types';
import { useSession } from '../../state/sessionContext';
import { useUser } from '../../state/userContext';
import { useQueryData } from '../../db/hooks';
import { routineRepo, workoutRepo, analyticsRepo, userRepo, exerciseRepo } from '../../data';
import type Routine from '../../db/models/Routine';
import { muscleLabel, todayPlan, currentBlockWeek, CONCEPT_ROUTINES, type ConceptRoutine, type ScheduleDay, type WeeklySchedule } from '../../domain';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';

export default function WorkoutTabScreen({ navigation }: TabScreenProps<'WorkoutTab'>) {
  const { t, lang } = useT();
  const { activeWorkoutId, setActiveWorkoutId } = useSession();
  const [busy, setBusy] = useState(false);

  const routines = useQueryData(() => routineRepo.queryRoutines(), []);

  // 오늘의 추천 루틴 (SRS-034) — 완료 이력 기반 예측. 화면 포커스/루틴변경/세션종료 시 갱신.
  const [reco, setReco] = useState<analyticsRepo.TodayRoutineReco | null>(null);
  const loadReco = useCallback(async () => {
    try {
      setReco(await analyticsRepo.getTodayRoutineRecommendation());
    } catch {
      setReco(null);
    }
  }, []);
  useFocusEffect(useCallback(() => { loadReco(); }, [loadReco]));
  useEffect(() => { loadReco(); }, [routines.length, activeWorkoutId, loadReco]);

  async function doStartBlank() {
    if (busy) return;
    setBusy(true);
    try {
      const w = await workoutRepo.startBlankWorkout();
      setActiveWorkoutId(w.id);
      navigation.navigate('ActiveWorkout', { workoutId: w.id });
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doStartFromRoutine(routineId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const w = await workoutRepo.startWorkoutFromRoutine(routineId);
      setActiveWorkoutId(w.id);
      navigation.navigate('ActiveWorkout', { workoutId: w.id });
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  }

  // 활성 운동이 있으면 새 운동 시작 전 확인(#3) — 바로 바뀌지 않게.
  function guardActive(start: () => void) {
    if (!activeWorkoutId) {
      start();
      return;
    }
    Alert.alert(t('routines.activeExistsTitle'), t('routines.activeExistsMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('routines.resumeInstead'), onPress: () => navigation.navigate('ActiveWorkout', { workoutId: activeWorkoutId }) },
      {
        text: t('routines.discardAndStart'),
        style: 'destructive',
        onPress: async () => {
          try {
            await workoutRepo.discardWorkout(activeWorkoutId);
          } catch {
            /* 이미 없으면 무시 */
          }
          setActiveWorkoutId(null);
          start();
        },
      },
    ]);
  }

  // 진행 중 운동 폐기(#4) — 이어서 하기 대신 기록 버리기.
  function discardActive() {
    if (!activeWorkoutId) return;
    Alert.alert(t('routines.discardWorkoutTitle'), t('routines.discardWorkoutMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await workoutRepo.discardWorkout(activeWorkoutId);
          } catch (e) {
            Alert.alert(t('common.error'), String(e));
          }
          setActiveWorkoutId(null);
        },
      },
    ]);
  }

  function confirmDelete(routine: Routine) {
    Alert.alert(t('routines.deleteTitle'), t('routines.deleteConfirm', { routineName: routine.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await routineRepo.deleteRoutine(routine.id);
          } catch (e) {
            Alert.alert(t('common.error'), String(e));
          }
        },
      },
    ]);
  }

  async function duplicate(routine: Routine) {
    try {
      await routineRepo.duplicateRoutine(routine.id);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  function openActions(routine: Routine) {
    Alert.alert(routine.name, undefined, [
      { text: t('routines.edit'), onPress: () => navigation.navigate('RoutineEditor', { routineId: routine.id }) },
      { text: t('routines.duplicate'), onPress: () => duplicate(routine) },
      { text: t('common.delete'), style: 'destructive', onPress: () => confirmDelete(routine) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  // 헤더(제목·추천·버튼·헬스장) — '내 루틴' 리스트 위 콘텐츠. FlatList 헤더로 넣어 탭 전체가 함께 스크롤된다.
  const header = (
    <View>
      <View style={styles.headerRow}>
        <AppText variant="display">{t('routines.title')}</AppText>
        {activeWorkoutId ? (
          <Button
            title={t('routines.resumeWorkout')}
            icon="play"
            size="sm"
            fullWidth={false}
            onPress={() => navigation.navigate('ActiveWorkout', { workoutId: activeWorkoutId })}
          />
        ) : null}
      </View>

      {/* 진행 중 운동 — 폐기(#4) */}
      {activeWorkoutId ? (
        <Card style={styles.resumeCard}>
          <View style={styles.resumeRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="heading">{t('routines.activeWorkout')}</AppText>
              <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                {t('routines.resumePrompt')}
              </AppText>
            </View>
            <Button title={t('routines.discardWorkoutButton')} variant="danger" size="sm" fullWidth={false} onPress={discardActive} />
          </View>
        </Card>
      ) : null}

      {/* 주단위 스케줄(SRS-044) — 오늘 운동·주차 스트립·디로딩 표시. 미설정 시 만들기 엔트리. */}
      <WeeklyScheduleCard
        routines={routines}
        busy={busy}
        onStartRoutine={(rid) => guardActive(() => doStartFromRoutine(rid))}
      />

      {/* 오늘의 추천 루틴(SRS-034) — 아직 운동 전일 때만, '새 루틴' 위에 표시 */}
      {!activeWorkoutId && reco && !reco.alreadyWorkedOutToday ? (
        reco.status === 'ok' ? (
          <Card style={styles.recoCard}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <AppText variant="label" color="primary">{t('routines.todayRecoLabel')}</AppText>
              <AppText variant="heading" numberOfLines={1} style={{ marginTop: 2 }}>
                {reco.routineName}
              </AppText>
              <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                {t('routines.todayRecoHint', { muscle: muscleLabel(reco.muscle!, lang) })}
              </AppText>
            </View>
            <Button
              title={t('routines.start')}
              icon="play"
              size="sm"
              fullWidth={false}
              disabled={busy}
              onPress={() => guardActive(() => doStartFromRoutine(reco.routineId!))}
            />
          </Card>
        ) : (
          <Card style={styles.recoCardMuted}>
            <AppText variant="label" color="textMuted">{t('routines.todayRecoLabel')}</AppText>
            <AppText variant="caption" color="textMuted" style={{ marginTop: 4 }}>
              {t('routines.todayRecoInsufficient')}
            </AppText>
          </Card>
        )
      ) : null}

      {/* 새 운동 진입 3버튼 — 같은 크기로 연달아(#6) */}
      <Button title={t('routines.newRoutine')} icon="add" variant="secondary" onPress={() => navigation.navigate('RoutineEditor')} style={{ marginBottom: spacing.sm }} />
      <Button title={t('routines.quickStart')} icon="flash" loading={busy} onPress={() => guardActive(doStartBlank)} style={{ marginBottom: spacing.sm }} />
      <Button title={t('program.title')} icon="sparkles" variant="secondary" onPress={() => navigation.navigate('ProgramGenerator')} style={{ marginBottom: spacing.sm }} />

      {/* 콘셉트 루틴(SRS-047) — "원하는 몸" 기준 프리셋. 탭→스토리·구성 미리보기→내 루틴에 저장. */}
      <ConceptRoutinesSection existingNames={routines.map((r) => r.name)} />

      {/* 주변 헬스장 발견(SRS-035) — 위치 기반 추천. 맥락상 '어디서 운동할까'. */}
      <Pressable onPress={() => navigation.navigate('NearbyGyms')} style={styles.gymEntry}>
        <Ionicons name="location" size={18} color={colors.primary} />
        <AppText variant="body" weight="medium" style={{ flex: 1 }}>{t('gyms.entry')}</AppText>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <SectionHeader title={t('routines.myRoutines')} />
    </View>
  );

  // 루틴 목록 드래그 재배치 — 순서 변경 후 sort_order 영속(꾹 눌러 三 핸들 드래그). @plm SRS-002
  function handleReorder({ from, to }: ReorderableListReorderEvent) {
    if (from === to) return;
    const ids = routines.map((r) => r.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    routineRepo.reorderRoutines(ids).catch((e) => Alert.alert(t('common.error'), String(e)));
  }

  return (
    <Screen padded={false}>
      {/* 탭 전체 스크롤 — 헤더를 리스트 헤더로 넣어 '내 루틴'이 좁은 칸에 갇히지 않게. 三 핸들 꾹 눌러 드래그 재배치. */}
      <ReorderableList
        data={routines}
        keyExtractor={(r) => r.id}
        onReorder={handleReorder}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <RoutineRow
            routine={item}
            busy={busy}
            onStart={() => guardActive(() => doStartFromRoutine(item.id))}
            onActions={() => openActions(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title={t('routines.listEmptyTitle')}
            message={t('routines.listEmptyMessage')}
            action={
              <Button
                title={t('routines.createRoutine')}
                icon="add"
                fullWidth={false}
                onPress={() => navigation.navigate('RoutineEditor')}
              />
            }
          />
        }
      />
    </Screen>
  );
}

// ── 주단위 스케줄 카드 + 편집 모달 (SRS-044). 디로딩 볼륨은 표시만 — 자동 조정 없음(ADR-028). ──
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const BLOCK_OPTIONS: (number | null)[] = [null, 4, 5, 6];

function WeeklyScheduleCard({
  routines,
  busy,
  onStartRoutine,
}: {
  routines: Routine[];
  busy: boolean;
  onStartRoutine: (routineId: string) => void;
}) {
  const { t } = useT();
  const { user, weeklySchedule } = useUser();
  const [editing, setEditing] = useState(false);
  const [draftDays, setDraftDays] = useState<ScheduleDay[]>([]);
  const [draftBlock, setDraftBlock] = useState<number | null>(null);

  const now = Date.now();
  const plan = todayPlan(weeklySchedule, now);
  const block = currentBlockWeek(weeklySchedule, now);
  const todayIdx = (new Date(now).getDay() + 6) % 7; // 월=0
  const nameOf = (id: string) => routines.find((r) => r.id === id)?.name ?? null;
  const todayRoutineName = plan.kind === 'routine' ? nameOf(plan.routineId) : null;

  function openEdit() {
    setDraftDays(weeklySchedule?.days ? [...weeklySchedule.days] : Array.from({ length: 7 }, () => null));
    setDraftBlock(weeklySchedule?.blockWeeks ?? null);
    setEditing(true);
  }
  function pickDay(i: number) {
    // Alert 선택지는 최대 8개 루틴만(그 이상은 목록 UI가 필요 — 루틴 정렬 상위 우선). 필요 시 후속 개선.
    Alert.alert(t(`schedule.day.${DAY_KEYS[i]}`), t('schedule.pickPrompt'), [
      ...routines.slice(0, 8).map((r) => ({
        text: r.name,
        onPress: () => setDraftDays((d) => d.map((v, idx) => (idx === i ? r.id : v))),
      })),
      { text: t('schedule.rest'), onPress: () => setDraftDays((d) => d.map((v, idx) => (idx === i ? ('rest' as ScheduleDay) : v))) },
      { text: t('schedule.unassigned'), onPress: () => setDraftDays((d) => d.map((v, idx) => (idx === i ? null : v))) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }
  async function saveSchedule() {
    if (!user) return;
    const hasAny = draftDays.some((d) => d !== null) || draftBlock != null;
    // blockStartAt: 최초 설정·주기 변경 시 지금부터 1주차. 동일 주기 유지 시 보존(모듈로 롤오버 — 이력 보존).
    const next: WeeklySchedule | null = hasAny
      ? {
          days: draftDays,
          blockWeeks: draftBlock,
          blockStartAt:
            draftBlock == null ? null : weeklySchedule?.blockWeeks === draftBlock ? weeklySchedule?.blockStartAt ?? Date.now() : Date.now(),
        }
      : null;
    try {
      await userRepo.updateUserSettings(user.id, { weeklySchedule: next });
      setEditing(false);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  if (!weeklySchedule) {
    return (
      <Pressable onPress={openEdit} style={wsStyles.entry}>
        <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        <AppText variant="body" weight="medium" style={{ flex: 1 }}>{t('schedule.createEntry')}</AppText>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        <ScheduleEditModal
          visible={editing}
          onClose={() => setEditing(false)}
          onSave={saveSchedule}
          days={draftDays}
          blockWeeks={draftBlock}
          onPickDay={pickDay}
          onPickBlock={setDraftBlock}
          nameOf={nameOf}
        />
      </Pressable>
    );
  }

  return (
    <Card style={[wsStyles.card, block?.isDeload && wsStyles.cardDeload]}>
      <View style={wsStyles.headRow}>
        <AppText variant="label" color="primary">{t('schedule.title')}</AppText>
        {block ? (
          <View style={[wsStyles.weekBadge, block.isDeload && wsStyles.weekBadgeDeload]}>
            <AppText variant="label" color={block.isDeload ? 'warning' : 'primary'} weight="bold">
              {block.isDeload ? t('schedule.deloadWeek') : t('schedule.weekN', { week: block.week })}
            </AppText>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <IconButton icon="pencil" size={16} color="textMuted" onPress={openEdit} />
      </View>
      <View style={wsStyles.strip}>
        {DAY_KEYS.map((k, i) => {
          const entry = weeklySchedule.days[i];
          const label = entry === 'rest' ? t('schedule.restShort') : entry ? (nameOf(entry) ?? '?') : '–';
          return (
            <View key={k} style={[wsStyles.dayChip, i === todayIdx && wsStyles.dayChipToday]}>
              <AppText variant="label" color={i === todayIdx ? 'primary' : 'textFaint'} weight={i === todayIdx ? 'bold' : 'regular'}>
                {t(`schedule.dayShort.${k}`)}
              </AppText>
              <AppText
                variant="label"
                color={i === todayIdx ? 'primary' : 'textMuted'}
                numberOfLines={1}
                style={{ maxWidth: 44 }}
              >
                {label}
              </AppText>
            </View>
          );
        })}
      </View>
      {plan.kind === 'routine' && todayRoutineName ? (
        <Button
          title={t('schedule.startToday', { routine: todayRoutineName })}
          icon="play"
          loading={busy}
          onPress={() => onStartRoutine(plan.routineId)}
          style={{ marginTop: spacing.sm }}
        />
      ) : plan.kind === 'rest' ? (
        <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
          {t('schedule.todayRest')}
        </AppText>
      ) : null}
      <ScheduleEditModal
        visible={editing}
        onClose={() => setEditing(false)}
        onSave={saveSchedule}
        days={draftDays}
        blockWeeks={draftBlock}
        onPickDay={pickDay}
        onPickBlock={setDraftBlock}
        nameOf={nameOf}
      />
    </Card>
  );
}

function ScheduleEditModal({
  visible,
  onClose,
  onSave,
  days,
  blockWeeks,
  onPickDay,
  onPickBlock,
  nameOf,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  days: ScheduleDay[];
  blockWeeks: number | null;
  onPickDay: (i: number) => void;
  onPickBlock: (w: number | null) => void;
  nameOf: (id: string) => string | null;
}) {
  const { t } = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={wsStyles.backdrop} onPress={onClose}>
        <Pressable style={wsStyles.sheet} onPress={() => {}}>
          <AppText variant="heading">{t('schedule.editTitle')}</AppText>
          {DAY_KEYS.map((k, i) => {
            const entry = days[i];
            const label = entry === 'rest' ? t('schedule.rest') : entry ? (nameOf(entry) ?? '?') : t('schedule.unassigned');
            return (
              <Pressable key={k} onPress={() => onPickDay(i)} style={wsStyles.editRow}>
                <AppText variant="body" style={{ width: 32 }}>{t(`schedule.dayShort.${k}`)}</AppText>
                <AppText variant="body" color={entry ? 'text' : 'textFaint'} numberOfLines={1} style={{ flex: 1 }}>
                  {label}
                </AppText>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            );
          })}
          <AppText variant="label" color="textMuted" style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
            {t('schedule.blockLabel')}
          </AppText>
          <View style={wsStyles.blockRow}>
            {BLOCK_OPTIONS.map((w) => (
              <Pressable
                key={String(w)}
                onPress={() => onPickBlock(w)}
                style={[wsStyles.blockOpt, blockWeeks === w && wsStyles.blockOptOn]}
              >
                <AppText variant="caption" color={blockWeeks === w ? 'primary' : 'text'} weight={blockWeeks === w ? 'bold' : 'regular'}>
                  {w == null ? t('schedule.blockNone') : t('schedule.blockOption', { weeks: w })}
                </AppText>
              </Pressable>
            ))}
          </View>
          <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
            {t('schedule.blockHint')}
          </AppText>
          <View style={wsStyles.actions}>
            <Button title={t('common.cancel')} variant="secondary" fullWidth={false} onPress={onClose} style={{ flex: 1 }} />
            <Button title={t('common.save')} fullWidth={false} onPress={onSave} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const wsStyles = StyleSheet.create({
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  card: { marginBottom: spacing.sm },
  cardDeload: { borderColor: colors.pr, borderWidth: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weekBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primaryMuted },
  weekBadgeDeload: { backgroundColor: colors.surfaceAlt },
  strip: { flexDirection: 'row', gap: 4, marginTop: spacing.sm },
  dayChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  dayChipToday: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  sheet: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  blockRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  blockOpt: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  blockOptOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});

// ── 콘셉트 루틴 카탈로그 (SRS-047 — BS-004 C2). "원하는 몸" 네이밍 + 스토리 + Day 구성 미리보기 → 저장. ──
function ConceptRoutinesSection({ existingNames }: { existingNames: string[] }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState<ConceptRoutine | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveConcept(c: ConceptRoutine) {
    if (saving) return;
    const routineName = (d: (typeof c.days)[number]) => `${lang === 'ko' ? c.nameKo : c.nameEn} — ${lang === 'ko' ? d.nameKo : d.nameEn}`;
    // 중복 생성 방지(spec qa c1) — 같은 이름 루틴이 이미 있으면 확인 후 진행.
    const dupe = c.days.some((d) => existingNames.includes(routineName(d)));
    const proceed = async () => {
      setSaving(true);
      try {
        const allNames = [...new Set(c.days.flatMap((d) => d.exercises))];
        const idByName = await exerciseRepo.getExerciseIdsByNames(allNames);
        for (const d of c.days) {
          const exs = d.exercises
            .map((n) => idByName.get(n))
            .filter((id): id is string => !!id)
            .map((exerciseId) => ({ exerciseId }));
          if (exs.length > 0) await routineRepo.importRoutine(routineName(d), exs);
        }
        setOpen(null);
        Alert.alert(t('concept.savedTitle'), t('concept.savedMessage', { count: c.days.length }));
      } catch (e) {
        Alert.alert(t('common.error'), String(e));
      } finally {
        setSaving(false);
      }
    };
    if (dupe) {
      Alert.alert(t('concept.dupeTitle'), t('concept.dupeMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.save'), onPress: proceed },
      ]);
    } else {
      await proceed();
    }
  }

  return (
    <View style={{ marginBottom: spacing.sm }}>
      <AppText variant="label" color="textMuted" style={{ marginBottom: spacing.xs }}>
        {t('concept.sectionTitle')}
      </AppText>
      <View style={conceptStyles.row}>
        {CONCEPT_ROUTINES.map((c) => (
          <Pressable key={c.id} onPress={() => setOpen(c)} style={conceptStyles.card}>
            <AppText variant="body" weight="bold" numberOfLines={1}>
              {lang === 'ko' ? c.nameKo : c.nameEn}
            </AppText>
            <AppText variant="label" color="textMuted">
              {t('concept.dayCount', { count: c.days.length })}
            </AppText>
          </Pressable>
        ))}
      </View>
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={conceptStyles.backdrop} onPress={() => setOpen(null)}>
          <Pressable style={conceptStyles.sheet} onPress={() => {}}>
            {open ? (
              <>
                <AppText variant="title">{lang === 'ko' ? open.nameKo : open.nameEn}</AppText>
                <AppText variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
                  {lang === 'ko' ? open.storyKo : open.storyEn}
                </AppText>
                {open.days.map((d) => (
                  <View key={d.nameKo} style={conceptStyles.dayBox}>
                    <AppText variant="caption" weight="bold" color="primary">
                      {lang === 'ko' ? d.nameKo : d.nameEn}
                    </AppText>
                    <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                      {d.exercises.join(' · ')}
                    </AppText>
                  </View>
                ))}
                <View style={conceptStyles.actions}>
                  <Button title={t('common.cancel')} variant="secondary" fullWidth={false} onPress={() => setOpen(null)} style={{ flex: 1 }} />
                  <Button title={t('concept.saveButton')} loading={saving} fullWidth={false} onPress={() => saveConcept(open)} style={{ flex: 1 }} />
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const conceptStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  card: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  sheet: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  dayBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});

function RoutineRow({
  routine,
  busy,
  onStart,
  onActions,
}: {
  routine: Routine;
  busy: boolean;
  onStart: () => void;
  onActions: () => void;
}) {
  const { t } = useT();
  const drag = useReorderableDrag();
  const exercises = useQueryData(() => routineRepo.queryRoutineExercises(routine.id), [routine.id]);
  return (
    <Card style={styles.routineCard}>
      {/* 꾹 눌러 드래그 재배치 핸들(三). @plm SRS-002 */}
      <Pressable onPressIn={drag} hitSlop={8} style={[styles.dragHandle, webDragHandleStyle]} accessibilityLabel={t('routines.reorderHandle')}>
        <Ionicons name="reorder-three" size={24} color={colors.textMuted} />
      </Pressable>
      <View style={styles.routineInfo}>
        <AppText variant="heading" numberOfLines={1}>
          {routine.name}
        </AppText>
        <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
          {routine.folder ? `${routine.folder} · ` : ''}
          {t('routines.exerciseCount', { count: exercises.length })}
        </AppText>
      </View>
      <View style={styles.routineActions}>
        <Button title={t('routines.start')} size="sm" fullWidth={false} disabled={busy} onPress={onStart} />
        <IconButton icon="ellipsis-vertical" color="textMuted" onPress={onActions} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  resumeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  resumeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  recoCardMuted: {
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.sm,
  },
  gymEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  routineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  routineInfo: { flex: 1, marginRight: spacing.md },
  routineActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dragHandle: { width: 30, alignItems: 'center', marginRight: spacing.xs }, // 三 드래그 핸들
  listContent: { paddingBottom: spacing.xxl },
  emptyContainer: { flexGrow: 1 },
});
