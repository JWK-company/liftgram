// @plm SRS-007  댓글 화면 — 목록·작성·본인 삭제 (SAD-011).
import React, { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Button, EmptyState, Screen, TextField } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type Comment } from '../../sync/serverApi';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';

export default function CommentsScreen({ route }: RootStackScreenProps<'Comments'>) {
  const { postId } = route.params;
  const { t } = useT();
  const [comments, setComments] = useState<Comment[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, me] = await Promise.all([serverApi.comments(postId), serverApi.me()]);
      setComments(list);
      setMeId(me.id);
    } catch {
      // ignore
    }
  }, [postId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function add() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const c = await serverApi.addComment(postId, body);
      setComments((prev) => [...prev, c]);
      setText('');
    } catch {
      setError(t('comments.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id));
    try {
      await serverApi.deleteComment(id);
    } catch {
      setError(t('comments.failed'));
      load();
    }
  }

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <CommentRow comment={item} mine={item.author.id === meId} onDelete={() => remove(item.id)} />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t('comments.empty')} />}
        />
        {error ? (
          <AppText variant="caption" style={styles.error}>
            {error}
          </AppText>
        ) : null}
        <View style={styles.composer}>
          <TextField
            value={text}
            onChangeText={setText}
            placeholder={t('comments.placeholder')}
            multiline
            containerStyle={{ flex: 1, marginBottom: 0 }}
          />
          <Button
            title={t('comments.post')}
            icon="send"
            size="sm"
            fullWidth={false}
            loading={busy}
            disabled={!text.trim()}
            onPress={add}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function CommentRow({
  comment,
  mine,
  onDelete,
}: {
  comment: Comment;
  mine: boolean;
  onDelete: () => void;
}) {
  const { t } = useT();
  const name = comment.author.displayName || t('discover.unnamed');
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <AppText variant="caption" weight="bold" style={{ color: colors.onPrimary }}>
          {name.slice(0, 1).toUpperCase()}
        </AppText>
      </View>
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <AppText variant="caption" weight="medium">
          {name}
        </AppText>
        <AppText variant="body" style={{ marginTop: 2 }}>
          {comment.body}
        </AppText>
      </View>
      {mine ? (
        <Pressable onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  error: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, color: colors.danger },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
