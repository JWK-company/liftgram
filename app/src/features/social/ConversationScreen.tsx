// @plm SRS-017  DM 쓰레드 — 메시지 조회·전송·읽음. 간이 폴링(실시간 전송은 ADR-015 후속). (SAD-011)
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Button, ListState, Screen, TextField } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type DmMessage } from '../../sync/serverApi';
import { resolveMediaUrl } from '../../config';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import { onDmMessage, onDmTyping, emitTyping } from '../../sync/realtime';

export default function ConversationScreen({ route, navigation }: RootStackScreenProps<'Conversation'>) {
  const { conversationId, title, isGroup } = route.params;
  const { t } = useT();
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); // 첫 메시지 로딩(스켈레톤)
  const [loadError, setLoadError] = useState(false); // 첫 로드 실패(에러+재시도)
  const firstLoaded = useRef(false);
  const reqIdRef = useRef(0);
  const listRef = useRef<FlatList<DmMessage>>(null);
  const [typing, setTyping] = useState(false);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  async function leave() {
    setError(null);
    try {
      await serverApi.leaveConversation(conversationId);
      navigation.goBack();
    } catch {
      setError(t('dm.leaveFailed'));
    }
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: title || t('dm.title'),
      headerRight: isGroup
        ? () => (
            <Pressable onPress={leave} hitSlop={8} style={{ paddingHorizontal: spacing.md }}>
              <Ionicons name="exit-outline" size={22} color={colors.danger} />
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, title, t, isGroup]);

  // 폴링 경합 방지 — 최신 요청 결과만 반영.
  const fetchMessages = useCallback(async () => {
    const rid = ++reqIdRef.current;
    try {
      const data = await serverApi.dmMessages(conversationId);
      if (rid !== reqIdRef.current) return;
      // 폴백 폴 결과를 병합(id union·시간순) — 라이브로 먼저 도착한 메시지를 덮어쓰지 않도록.
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const m of data) map.set(m.id, m);
        return [...map.values()].sort((a, b) =>
          a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1,
        );
      });
      if (!firstLoaded.current) {
        firstLoaded.current = true;
        setLoading(false);
        setLoadError(false);
      }
    } catch {
      // 폴링 실패는 무음, 첫 로드 실패만 에러 표면화(그 외엔 기존 목록 유지).
      if (rid === reqIdRef.current && !firstLoaded.current) {
        setLoading(false);
        setLoadError(true);
      }
    }
  }, [conversationId]);

  const retry = useCallback(() => {
    firstLoaded.current = false;
    setLoading(true);
    setLoadError(false);
    void fetchMessages();
  }, [fetchMessages]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void (async () => {
        try {
          const me = await serverApi.me();
          if (mounted) setMeId(me.id);
        } catch {
          // ignore
        }
        await fetchMessages();
        serverApi.markRead(conversationId).catch(() => {});
      })();
      // 실시간 수신 — 이 대화 메시지를 즉시 반영(id 중복 방지) + 읽음 처리.
      const unsubMsg = onDmMessage((m) => {
        if (m.conversationId !== conversationId) return;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        serverApi.markRead(conversationId).catch(() => {});
      });
      // 타이핑 — 서버가 나 외 참여자에게만 relay하므로 수신=상대가 입력 중.
      const unsubTyping = onDmTyping((e) => {
        if (e.conversationId !== conversationId) return;
        setTyping(true);
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
        typingClearRef.current = setTimeout(() => setTyping(false), 3000);
      });
      const id = setInterval(fetchMessages, 15000); // WS 폴백 — 느린 재동기
      return () => {
        mounted = false;
        clearInterval(id);
        unsubMsg();
        unsubTyping();
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
      };
    }, [conversationId, fetchMessages]),
  );

  function onChangeText(v: string) {
    setText(v);
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now;
      emitTyping(conversationId);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await serverApi.sendMessage(conversationId, { kind: 'text', body });
      setText('');
      await fetchMessages(); // 서버 권위 목록으로 갱신(낙관적 append↔폴링 경합 회피)
    } catch {
      setError(t('dm.sendFailed'));
      setText(body); // 재시도 위해 복원
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <Bubble msg={item} mine={item.sender.id === meId} showSender={!!isGroup} />}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <ListState
              loading={loading}
              error={loadError}
              onRetry={retry}
              skeletonVariant="bubble"
              emptyIcon="chatbubble-ellipses-outline"
              emptyTitle="dm.threadEmpty"
            />
          }
        />
        {typing ? (
          <AppText variant="caption" color="textMuted" style={styles.typing}>
            {t('dm.typing')}
          </AppText>
        ) : null}
        {error ? (
          <AppText variant="caption" color="danger" style={styles.error}>
            {error}
          </AppText>
        ) : null}
        <View style={styles.composer}>
          <TextField
            value={text}
            onChangeText={onChangeText}
            placeholder={t('dm.messagePlaceholder')}
            multiline
            containerStyle={{ flex: 1, marginBottom: 0 }}
          />
          <Button
            title={t('dm.send')}
            icon="send"
            size="sm"
            fullWidth={false}
            loading={sending}
            disabled={!text.trim()}
            onPress={send}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ msg, mine, showSender }: { msg: DmMessage; mine: boolean; showSender: boolean }) {
  const imageUrl = msg.kind === 'image' && msg.mediaUrl ? msg.mediaUrl : undefined;
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowOther]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
        {showSender && !mine && msg.sender.displayName ? (
          <AppText variant="label" color="primary" style={{ marginBottom: 2 }}>
            {msg.sender.displayName}
          </AppText>
        ) : null}
        {imageUrl ? (
          <Image source={{ uri: resolveMediaUrl(imageUrl) }} style={styles.bubbleImage} resizeMode="cover" />
        ) : null}
        {msg.body ? (
          <AppText variant="body" style={{ color: mine ? colors.onPrimary : colors.text }}>
            {msg.body}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1, gap: spacing.xs },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.xs },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm },
  bubbleOther: { backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: radius.sm },
  bubbleImage: { width: 200, height: 200, borderRadius: radius.md, marginBottom: spacing.xs },
  error: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, color: colors.danger },
  typing: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
