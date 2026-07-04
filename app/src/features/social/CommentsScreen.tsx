// @plm SRS-007  댓글 화면 — 목록·작성·본인 삭제 + 좋아요·대댓글(1단계) (SAD-011).
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Button, ListState, Screen, TextField } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type Comment } from '../../sync/serverApi';
import { ReportSheet } from './ReportSheet';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';

export default function CommentsScreen({ route }: RootStackScreenProps<'Comments'>) {
  const { postId } = route.params;
  const { t } = useT();
  const [comments, setComments] = useState<Comment[]>([]);
  const [replies, setReplies] = useState<Record<string, Comment[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [repliesLoading, setRepliesLoading] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const likePending = useRef<Set<string>>(new Set());

  async function submitReport(reason: string) {
    const id = reportId;
    setReportId(null);
    if (!id) return;
    try {
      await serverApi.report('comment', id, reason);
      Alert.alert(t('report.submitted'));
    } catch {
      Alert.alert(t('report.failed'));
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [list, me] = await Promise.all([serverApi.comments(postId), serverApi.me()]);
      setComments(list);
      setMeId(me.id);
      setReplies({});
      setExpanded(new Set());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // 낙관적 좋아요 토글 — comment가 대댓글이면 replies[parentId] 버킷을, 최상위면 comments를 갱신.
  const updateComment = useCallback((id: string, parentId: string | null, fn: (c: Comment) => Comment) => {
    if (parentId) {
      setReplies((prev) => ({ ...prev, [parentId]: (prev[parentId] ?? []).map((c) => (c.id === id ? fn(c) : c)) }));
    } else {
      setComments((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
    }
  }, []);

  async function toggleLike(c: Comment) {
    if (likePending.current.has(c.id)) return;
    likePending.current.add(c.id);
    const liked = c.likedByMe;
    updateComment(c.id, c.parentId, (x) => ({ ...x, likedByMe: !liked, likeCount: x.likeCount + (liked ? -1 : 1) }));
    try {
      const res = liked ? await serverApi.unlikeComment(c.id) : await serverApi.likeComment(c.id);
      updateComment(c.id, c.parentId, (x) => ({ ...x, likeCount: res.likeCount }));
    } catch {
      updateComment(c.id, c.parentId, (x) => ({ ...x, likedByMe: liked, likeCount: x.likeCount + (liked ? 1 : -1) }));
    } finally {
      likePending.current.delete(c.id);
    }
  }

  async function loadReplies(rootId: string) {
    setRepliesLoading((prev) => new Set(prev).add(rootId));
    setExpanded((prev) => new Set(prev).add(rootId));
    try {
      const list = await serverApi.commentReplies(rootId);
      setReplies((prev) => ({ ...prev, [rootId]: list }));
      // 라벨(replyCount)을 서버 실제 목록과 재동기 — 낙관적 증감 누적 드리프트 해소.
      setComments((prev) => prev.map((x) => (x.id === rootId ? { ...x, replyCount: list.length } : x)));
    } catch {
      // 무음 — 토글은 열려있고 빈 상태로 남음
    } finally {
      setRepliesLoading((prev) => {
        const n = new Set(prev);
        n.delete(rootId);
        return n;
      });
    }
  }

  function toggleReplies(rootId: string) {
    if (expanded.has(rootId)) {
      setExpanded((prev) => {
        const n = new Set(prev);
        n.delete(rootId);
        return n;
      });
    } else {
      void loadReplies(rootId);
    }
  }

  function startReply(c: Comment) {
    setReplyingTo({ id: c.id, name: c.author.displayName || t('discover.unnamed') });
  }

  async function add() {
    const body = text.trim();
    if (!body || busy) return;
    const parent = replyingTo;
    setBusy(true);
    setError(null);
    try {
      const c = await serverApi.addComment(postId, body, parent?.id);
      setText('');
      setReplyingTo(null);
      if (c.parentId) {
        // 대댓글 — 서버가 루트로 정규화한 parentId 버킷에 반영 + 루트 replyCount 증가.
        const rootId = c.parentId;
        setComments((prev) => prev.map((x) => (x.id === rootId ? { ...x, replyCount: x.replyCount + 1 } : x)));
        if (replies[rootId]) {
          setReplies((prev) => ({ ...prev, [rootId]: [...(prev[rootId] ?? []), c] }));
          setExpanded((prev) => new Set(prev).add(rootId));
        } else {
          void loadReplies(rootId); // 미로드 → 전체 로드(새 답글 포함)
        }
      } else {
        setComments((prev) => [...prev, c]);
      }
    } catch {
      setError(t('comments.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Comment) {
    if (c.parentId) {
      const rootId = c.parentId;
      setReplies((prev) => ({ ...prev, [rootId]: (prev[rootId] ?? []).filter((x) => x.id !== c.id) }));
      setComments((prev) => prev.map((x) => (x.id === rootId ? { ...x, replyCount: Math.max(0, x.replyCount - 1) } : x)));
    } else {
      setComments((prev) => prev.filter((x) => x.id !== c.id));
      setReplies((prev) => {
        const n = { ...prev };
        delete n[c.id];
        return n;
      });
      setExpanded((prev) => {
        const n = new Set(prev);
        n.delete(c.id);
        return n;
      });
    }
    try {
      await serverApi.deleteComment(c.id);
    } catch {
      setError(t('comments.failed'));
      load();
    }
  }

  const renderComment = (item: Comment) => (
    <View>
      <CommentRow
        comment={item}
        mine={item.author.id === meId}
        onLike={() => toggleLike(item)}
        onReply={() => startReply(item)}
        onDelete={() => remove(item)}
        onReport={() => setReportId(item.id)}
      />
      {item.replyCount > 0 || (replies[item.id]?.length ?? 0) > 0 ? (
        <Pressable onPress={() => toggleReplies(item.id)} hitSlop={6} style={styles.repliesToggle}>
          <Ionicons
            name={expanded.has(item.id) ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.primary}
          />
          <AppText variant="label" color="primary">
            {expanded.has(item.id) ? t('comments.hideReplies') : t('comments.viewReplies', { count: item.replyCount })}
          </AppText>
        </Pressable>
      ) : null}
      {expanded.has(item.id) ? (
        repliesLoading.has(item.id) && !replies[item.id] ? (
          <ActivityIndicator color={colors.primary} style={{ marginLeft: 44, marginVertical: spacing.sm }} />
        ) : (
          (replies[item.id] ?? []).map((r) => (
            <View key={r.id} style={styles.replyIndent}>
              <CommentRow
                comment={r}
                mine={r.author.id === meId}
                onLike={() => toggleLike(r)}
                onReply={() => startReply(r)}
                onDelete={() => remove(r)}
                onReport={() => setReportId(r.id)}
              />
            </View>
          ))
        )
      ) : null}
    </View>
  );

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => renderComment(item)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ListState
              loading={loading}
              error={loadError}
              onRetry={load}
              skeletonVariant="comment"
              emptyIcon="chatbubble-outline"
              emptyTitle="comments.empty"
              emptyMessage="comments.emptyMessage"
            />
          }
        />
        {error ? (
          <AppText variant="caption" style={styles.error}>
            {error}
          </AppText>
        ) : null}
        {replyingTo ? (
          <View style={styles.replyChip}>
            <AppText variant="caption" color="textMuted">
              {t('comments.replyingTo', { name: replyingTo.name })}
            </AppText>
            <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
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
      <ReportSheet visible={!!reportId} onClose={() => setReportId(null)} onSubmit={submitReport} />
    </Screen>
  );
}

function CommentRow({
  comment,
  mine,
  onLike,
  onReply,
  onDelete,
  onReport,
}: {
  comment: Comment;
  mine: boolean;
  onLike: () => void;
  onReply: () => void;
  onDelete: () => void;
  onReport: () => void;
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
        <View style={styles.actions}>
          <Pressable onPress={onLike} hitSlop={6} style={styles.likeBtn}>
            <Ionicons
              name={comment.likedByMe ? 'heart' : 'heart-outline'}
              size={15}
              color={comment.likedByMe ? colors.danger : colors.textMuted}
            />
            {comment.likeCount > 0 ? (
              <AppText variant="label" color="textMuted">
                {comment.likeCount}
              </AppText>
            ) : null}
          </Pressable>
          <Pressable onPress={onReply} hitSlop={6}>
            <AppText variant="label" color="textMuted">
              {t('comments.reply')}
            </AppText>
          </Pressable>
        </View>
      </View>
      {mine ? (
        <Pressable onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
        </Pressable>
      ) : (
        <Pressable onPress={onReport} hitSlop={8}>
          <Ionicons name="flag-outline" size={16} color={colors.textFaint} />
        </Pressable>
      )}
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
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.xs },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  repliesToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 44, marginBottom: spacing.md },
  replyIndent: { marginLeft: spacing.xl },
  replyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceAlt,
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
