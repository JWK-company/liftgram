// @plm SRS-017  그룹 대화 만들기 — 멤버 다중선택 + 제목 (SAD-011).
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Avatar, Button, Card, ListState, Screen, TextField } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type DiscoverUser } from '../../sync/serverApi';
import { colors, spacing } from '../../theme';
import { useT } from '../../i18n';

export default function NewGroupScreen({ navigation }: RootStackScreenProps<'NewGroup'>) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false); // 멤버 목록 로드 실패(리스트 에러+재시도)
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null); // 그룹 생성 실패(푸터 인라인)

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      setUsers(await serverApi.discover(query.trim() || undefined));
    } catch {
      if (query.trim()) setUsers([]); // 검색 실패 → stale 결과 제거해 에러 카드 노출
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load('');
  }, [load]);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const followable = users.filter((u) => u.isFollowing); // 그룹엔 내가 팔로우한 사람만 추가 가능

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  async function create() {
    if (!selectedIds.length || creating) return;
    setCreating(true);
    setError(null);
    try {
      const names = users
        .filter((u) => selected[u.id])
        .map((u) => u.displayName || t('discover.unnamed'))
        .join(', ');
      const conv = await serverApi.createGroup(selectedIds, title.trim() || undefined);
      navigation.replace('Conversation', {
        conversationId: conv.id,
        title: title.trim() || names, // 제목 없으면 멤버명으로 헤더 표시(대화목록과 일관)
        isGroup: true,
      });
    } catch {
      setError(t('group.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <TextField
          value={title}
          onChangeText={setTitle}
          placeholder={t('group.titlePlaceholder')}
          maxLength={60}
          containerStyle={{ marginBottom: spacing.sm }}
        />
        <TextField
          value={q}
          onChangeText={setQ}
          placeholder={t('discover.searchPlaceholder')}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => load(q)}
          containerStyle={{ marginBottom: 0 }}
        />
      </View>
      <FlatList
        data={followable}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => {
          const on = !!selected[item.id];
          const name = item.displayName || t('discover.unnamed');
          return (
            <Pressable onPress={() => toggle(item.id)}>
              <Card style={styles.row}>
                <Avatar name={item.displayName} url={item.avatarUrl} size={36} />
                <AppText variant="body" weight="medium" numberOfLines={1} style={styles.name}>
                  {name}
                </AppText>
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={on ? colors.primary : colors.textFaint}
                />
              </Card>
            </Pressable>
          );
        }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <ListState
            loading={loading}
            error={loadError}
            onRetry={() => load(q)}
            skeletonVariant="row"
            emptyIcon="people-outline"
            emptyTitle="group.noFollowees"
          />
        }
      />
      <View style={styles.footer}>
        {error ? (
          <AppText variant="caption" color="danger" style={{ marginBottom: spacing.sm }}>
            {error}
          </AppText>
        ) : null}
        <Button
          title={t('group.create', { count: selectedIds.length })}
          loading={creating}
          disabled={!selectedIds.length}
          onPress={create}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  list: { padding: spacing.lg, paddingTop: spacing.md, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  name: { flex: 1, marginHorizontal: spacing.md },
  footer: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
