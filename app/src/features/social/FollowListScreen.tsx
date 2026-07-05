// @plm SRS-018  팔로워/팔로잉 목록 — 프로필 카운트 탭 진입, 팔로우 토글 (SAD-011).
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Avatar, Button, Card, ListState, Screen } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type DiscoverUser } from '../../sync/serverApi';
import { colors, spacing } from '../../theme';
import { useT } from '../../i18n';

export default function FollowListScreen({ route, navigation }: RootStackScreenProps<'FollowList'>) {
  const { userId, mode } = route.params;
  const { t } = useT();
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pending = useRef<Set<string>>(new Set());
  const loadGen = useRef(0); // 새로고침 세대 — stale 재조회가 낙관 토글을 덮어쓰지 않게

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t(mode === 'followers' ? 'follow.followersTitle' : 'follow.followingTitle'),
    });
  }, [navigation, mode, t]);

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    setLoading(true);
    setError(false);
    try {
      const next = mode === 'followers' ? await serverApi.followers(userId) : await serverApi.following(userId);
      if (gen !== loadGen.current) return; // 더 새로운 새로고침이 시작됨 → 폐기
      // in-flight 낙관 토글 보존 — 진행 중인 행은 로컬 상태 유지(서버 응답이 아직 stale일 수 있음).
      setUsers((prev) => {
        if (!pending.current.size) return next;
        const byId = new Map(prev.map((x) => [x.id, x]));
        return next.map((n) => (pending.current.has(n.id) ? byId.get(n.id) ?? n : n));
      });
    } catch {
      if (gen === loadGen.current) setError(true);
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [userId, mode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function toggle(u: DiscoverUser) {
    if (pending.current.has(u.id)) return;
    pending.current.add(u.id);
    const was = u.isFollowing;
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isFollowing: !was } : x))); // 낙관적
    try {
      if (was) await serverApi.unfollowUser(u.id);
      else await serverApi.followUser(u.id);
      // 성공 시 목표값 재확정 — 그 사이 stale load가 덮어썼어도 최종 정합.
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isFollowing: !was } : x)));
    } catch {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isFollowing: was } : x))); // 롤백
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
            <Pressable style={styles.main} onPress={() => navigation.push('UserProfile', { userId: item.id })}>
              <Avatar name={item.displayName} url={item.avatarUrl} size={40} />
              <AppText variant="body" weight="medium" numberOfLines={1} style={styles.name}>
                {item.displayName || t('discover.unnamed')}
              </AppText>
            </Pressable>
            {!item.isSelf ? (
              <Button
                title={item.isFollowing ? t('discover.following') : t('discover.follow')}
                size="sm"
                variant={item.isFollowing ? 'secondary' : 'primary'}
                fullWidth={false}
                onPress={() => toggle(item)}
              />
            ) : null}
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
            emptyIcon="people-outline"
            emptyTitle={mode === 'followers' ? 'follow.emptyFollowers' : 'follow.emptyFollowing'}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  main: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  name: { flex: 1, marginHorizontal: spacing.md },
});
