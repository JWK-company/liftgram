// @plm SRS-017  DM 쓰레드 — 메시지 조회·전송·읽음. 간이 폴링(실시간 전송은 ADR-015 후속). (SAD-011)
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Button, Screen, TextField } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type DmMessage } from '../../sync/serverApi';
import { resolveMediaUrl } from '../../config';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';

export default function ConversationScreen({ route, navigation }: RootStackScreenProps<'Conversation'>) {
  const { conversationId, title } = route.params;
  const { t } = useT();
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  const listRef = useRef<FlatList<DmMessage>>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: title || t('dm.title') });
  }, [navigation, title, t]);

  // 폴링 경합 방지 — 최신 요청 결과만 반영.
  const fetchMessages = useCallback(async () => {
    const rid = ++reqIdRef.current;
    try {
      const data = await serverApi.dmMessages(conversationId);
      if (rid === reqIdRef.current) setMessages(data);
    } catch {
      // ignore
    }
  }, [conversationId]);

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
      const id = setInterval(fetchMessages, 3000); // 간이 폴링
      return () => {
        mounted = false;
        clearInterval(id);
      };
    }, [conversationId, fetchMessages]),
  );

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
          renderItem={({ item }) => <Bubble msg={item} mine={item.sender.id === meId} />}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
        {error ? (
          <AppText variant="caption" color="danger" style={styles.error}>
            {error}
          </AppText>
        ) : null}
        <View style={styles.composer}>
          <TextField
            value={text}
            onChangeText={setText}
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

function Bubble({ msg, mine }: { msg: DmMessage; mine: boolean }) {
  const imageUrl = msg.kind === 'image' && msg.mediaUrl ? msg.mediaUrl : undefined;
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowOther]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
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
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
