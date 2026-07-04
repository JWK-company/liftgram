// @plm SRS-018  차단 목록 관리 — 조회·해제 (SAD-011).
import React, { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Avatar, Button, Card, ListState, Screen } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type BlockedUser } from '../../sync/serverApi';
import { colors, spacing } from '../../theme';
import { useT } from '../../i18n';

export default function BlockedUsersScreen(_props: RootStackScreenProps<'BlockedUsers'>) {
  const { t } = useT();
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pending = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setUsers(await serverApi.blockedUsers());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function unblock(u: BlockedUser) {
    if (pending.current.has(u.id)) return;
    pending.current.add(u.id);
    setUsers((prev) => prev.filter((x) => x.id !== u.id)); // 낙관적 제거
    try {
      await serverApi.unblockUser(u.id);
    } catch {
      Alert.alert(t('moderation.actionFailed'));
      load(); // 실패 → 목록 재조회로 롤백
    } finally {
      pending.current.delete(u.id);
    }
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <Avatar name={item.displayName} url={item.avatarUrl} size={40} />
            <AppText variant="body" weight="medium" numberOfLines={1} style={styles.name}>
              {item.displayName || t('discover.unnamed')}
            </AppText>
            <Button
              title={t('profile.unblock')}
              size="sm"
              variant="secondary"
              fullWidth={false}
              onPress={() => unblock(item)}
            />
          </Card>
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          <ListState
            loading={loading}
            error={error}
            onRetry={load}
            skeletonVariant="row"
            emptyIcon="ban-outline"
            emptyTitle="block.emptyTitle"
            emptyMessage="block.emptyMessage"
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  name: { flex: 1, marginHorizontal: spacing.md },
});
