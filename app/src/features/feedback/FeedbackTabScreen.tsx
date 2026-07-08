// @plm SRS-006  개발 피드백 탭 (coworker/admin 전용) — 자연어 문제·개선을 PLM 아이디어보드로 등록.
// 서버 /feedback(RolesGuard: coworker/admin)이 실제 인가 경계. 이 화면은 UX 게이팅 + 폼/목록.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Button, Card, EmptyState, ListState, Screen, Tag, TextField } from '../../components';
import type { TabScreenProps } from '../../navigation/types';
import { serverApi, type FeedbackItem } from '../../sync/serverApi';
import { colors, fontWeight, radius, spacing } from '../../theme';
import { useT, type TransKey } from '../../i18n';

type Category = 'bug' | 'improvement';

function stateLabel(t: (k: TransKey) => string, state: string): string {
  switch (state) {
    case 'submitted':
      return t('feedback.state.submitted');
    case 'discussion':
      return t('feedback.state.discussion');
    case 'voting':
      return t('feedback.state.voting');
    case 'adopted':
    case 'adopted_pending_promotion':
      return t('feedback.state.adopted');
    case 'rejected':
      return t('feedback.state.rejected');
    case 'hold':
    case 'deferred':
      return t('feedback.state.hold');
    default:
      return state;
  }
}

function stateTone(state: string): 'default' | 'primary' | 'pr' | 'muted' {
  if (state === 'adopted' || state === 'adopted_pending_promotion') return 'primary';
  if (state === 'rejected') return 'muted';
  if (state === 'voting' || state === 'discussion') return 'pr';
  return 'default';
}

export default function FeedbackTabScreen(_props: TabScreenProps<'FeedbackTab'>) {
  const { t } = useT();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [gateError, setGateError] = useState(false); // 권한 확인 자체 실패(네트워크 등) — 재시도 가능
  const [category, setCategory] = useState<Category>('bug');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await serverApi.feedbackList());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // 권한 확인 — 성공: allowed=true/false 확정. 실패(오프라인/타임아웃): gateError로 재시도 유도
  // (조용히 '권한 없음'으로 오도하지 않음 — fail-closed 하되 원인 구분).
  const runGate = useCallback(() => {
    setGateError(false);
    serverApi
      .isLoggedIn()
      .then((logged) => (logged ? serverApi.me() : null))
      .then((me) => {
        const ok = !!me && (me.role === 'coworker' || me.role === 'admin');
        setAllowed(ok);
        if (ok) void load();
      })
      .catch(() => setGateError(true));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      runGate();
    }, [runGate]),
  );

  async function onSubmit() {
    const tt = title.trim();
    const dd = detail.trim();
    if (tt.length < 3 || dd.length < 5) {
      Alert.alert(t('common.error'), t('feedback.validationMessage'));
      return;
    }
    setBusy(true);
    try {
      await serverApi.submitFeedback({ category, title: tt, detail: dd });
      setTitle('');
      setDetail('');
      Alert.alert(t('feedback.submitSuccessTitle'), t('feedback.submitSuccessMessage'));
      void load();
    } catch {
      Alert.alert(t('common.error'), t('feedback.errorMessage'));
    } finally {
      setBusy(false);
    }
  }

  // 권한 확인 실패(네트워크 등) → 재시도. '권한 없음'과 구분해 오도 방지.
  if (gateError) {
    return (
      <Screen>
        <EmptyState
          tone="error"
          icon="cloud-offline-outline"
          title={t('common.loadError')}
          message={t('common.loadErrorMessage')}
          action={<Button title={t('common.retry')} variant="secondary" icon="refresh" fullWidth={false} onPress={runGate} />}
        />
      </Screen>
    );
  }
  // 권한 미확정 → 로딩 인디케이터. 비허용 → 안내(탭이 노출됐더라도 방어).
  if (allowed === null) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }
  if (!allowed) {
    return (
      <Screen>
        <EmptyState icon="lock-closed-outline" title={t('feedback.noAccessTitle')} message={t('feedback.noAccessMessage')} />
      </Screen>
    );
  }

  const header = (
    <View>
      <AppText variant="display" style={{ marginBottom: spacing.xs }}>
        {t('feedback.title')}
      </AppText>
      <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.lg }}>
        {t('feedback.intro')}
      </AppText>

      <Card style={{ marginBottom: spacing.xl }}>
        <AppText variant="label" color="textMuted" style={{ marginBottom: spacing.xs }}>
          {t('feedback.category')}
        </AppText>
        <View style={styles.segmented}>
          <CatChip label={t('feedback.cat.bug')} active={category === 'bug'} onPress={() => setCategory('bug')} />
          <CatChip label={t('feedback.cat.improvement')} active={category === 'improvement'} onPress={() => setCategory('improvement')} />
        </View>

        <View style={{ height: spacing.md }} />
        <TextField
          label={t('feedback.titleLabel')}
          value={title}
          onChangeText={setTitle}
          placeholder={t('feedback.titlePlaceholder')}
          maxLength={120}
        />
        <TextField
          label={t('feedback.detailLabel')}
          value={detail}
          onChangeText={setDetail}
          placeholder={t('feedback.detailPlaceholder')}
          multiline
          numberOfLines={6}
          maxLength={4000}
          style={styles.detailInput}
        />
        <Button
          title={t('feedback.submit')}
          icon="send-outline"
          onPress={onSubmit}
          loading={busy}
          disabled={busy}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <AppText variant="heading" style={{ marginBottom: spacing.md }}>
        {t('feedback.listTitle')}
      </AppText>
    </View>
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <Card style={styles.itemCard}>
            <View style={styles.itemHead}>
              <Tag label={item.category === 'bug' ? t('feedback.cat.bug') : t('feedback.cat.improvement')} tone={item.category === 'bug' ? 'pr' : 'primary'} />
              <Tag label={stateLabel(t, item.state)} tone={stateTone(item.state)} />
              {item.mine ? <Tag label={t('feedback.mine')} tone="muted" /> : null}
            </View>
            <AppText variant="body" weight="medium" style={{ marginTop: spacing.sm }}>
              {item.title}
            </AppText>
            {item.detail ? (
              <AppText variant="caption" color="textMuted" numberOfLines={3} style={{ marginTop: 2 }}>
                {item.detail}
              </AppText>
            ) : null}
            {item.promotedCode ? (
              <AppText variant="label" color="primary" style={{ marginTop: spacing.sm }}>
                {t('feedback.promoted', { code: item.promotedCode })}
              </AppText>
            ) : null}
          </Card>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <ListState
            loading={loading}
            error={error}
            onRetry={load}
            skeletonVariant="row"
            emptyIcon="chatbox-ellipses-outline"
            emptyTitle="feedback.empty"
            emptyMessage="feedback.emptyMessage"
          />
        }
      />
    </Screen>
  );
}

function CatChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, { opacity: pressed ? 0.85 : 1 }]}
    >
      <AppText
        variant="caption"
        style={{
          color: active ? colors.onPrimary : colors.textMuted,
          fontWeight: active ? fontWeight.bold : fontWeight.medium,
        }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg, flexGrow: 1 },
  segmented: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  detailInput: { minHeight: 120, textAlignVertical: 'top' },
  itemCard: { marginTop: spacing.md },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
});
