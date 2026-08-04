"use client";
// @plm SRS-017  대화방 — app의 features/social/ConversationScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
//   목록   말풍선(내 것은 오른쪽·브랜드색, 남의 것은 왼쪽·회색) · 그룹이면 보낸 사람 이름
//   발     입력 + 전송 · 상대가 치는 중이면 "입력 중…"
//
// ── 실시간과 폴백 ───────────────────────────────────────────────────────────
// 스트림(`WatchMessages`)이 열려 있으면 새 메시지가 즉시 들어온다. 스트림이 끊겨도
// **15초 재동기**가 있어 대화가 멈추지 않는다 — app이 하던 것과 같은 두 겹이다.
//
// ── 보낸 뒤 목록을 다시 읽는 이유 ───────────────────────────────────────────
// 낙관적으로 붙여 두면 곧이어 도착한 스트림/폴링 결과와 겹쳐 같은 말이 두 번 보인다.
// 서버가 준 것 하나만 붙이고(그 id로 중복을 거른다), 나머지는 스트림에 맡긴다.
// ─────────────────────────────────────────────────────────────────────────────
import type { Message } from "@app/contracts";
import { MessageKind, WatchMessagesResponse_Kind } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { t, tw } from "@/lib/i18n";
import { dmClient } from "@/lib/dmClient";
import { restoreSession } from "@/lib/session";
import { feedErrorMessage } from "@/lib/feedClient";
import { mediaSrc, uploadImage } from "@/lib/mediaClient";
import { useAuth } from "../AuthProvider";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextArea } from "../ui/inputs";
import { ListState } from "../ui/ListState";
import { AppText } from "../ui/primitives";
import { ConfirmDialog } from "../ui/Dialog";
import { ScreenHeader } from "../ui/ScreenHeader";
import { conversationTitle } from "./ConversationsClient";

/** 입력 중 표시를 이 시간 동안 유지한다(app과 같은 3초). */
const TYPING_HOLD_MS = 3000;
/** 같은 사람이 계속 쳐도 신호는 이 간격으로만 보낸다. */
const TYPING_THROTTLE_MS = 1500;

export default function ConversationClient({ conversationId }: { conversationId: string }) {
  const { user } = useAuth();
  const meId = user?.id ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [title, setTitle] = useState("");
  const [isGroup, setIsGroup] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 같은 메시지를 두 번 넣지 않는다(스트림·폴링·직접 전송이 겹칠 수 있다).
  const merge = useCallback((incoming: Message[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const [msgs, convs] = await Promise.all([
          dmClient().listMessages({ conversationId }),
          dmClient().listConversations({}),
        ]);
        setMessages(msgs.messages);
        const conv = convs.conversations.find((c) => c.id === conversationId);
        if (conv) {
          setTitle(conversationTitle(conv, user?.id ?? null));
          setIsGroup(conv.isGroup);
        }
        setLoadError(false);
        // 열어 두는 동안은 계속 읽은 것으로 친다.
        await dmClient().markRead({ conversationId });
      } catch {
        if (!quiet) setLoadError(true);
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [conversationId, user?.id],
  );

  useEffect(() => {
    void load();
    // 스트림이 죽어도 대화가 멈추지 않게 — 조용한 재동기.
    const timer = setInterval(() => void load(true), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  // 실시간 — 열려 있는 동안 새 메시지와 "입력 중"이 흘러온다.
  //
  // ── 로그인이 **끝난 뒤에** 연다 ────────────────────────────────────────────
  // 새로고침 직후에는 access 토큰이 메모리에 없다(refresh로 되살리는 중이다). 그 사이에 열면
  // 토큰 없이 나가 거절당하고, 스트림은 재시도 없이 끝난다 — 실시간이 조용히 죽는다.
  // 단항 호출은 401을 받으면 인터셉터가 갱신 후 다시 보내지만, **스트림은 그 재시도가 통하지 않는다**
  // (오류가 응답이 아니라 반복 도중에 나온다). 그래서 신원이 확정된 뒤에만 연다.
  //
  // 토큰이 도중에 만료돼 끊기면 폴링이 이어받고, 갱신된 뒤 다시 붙는다.
  useEffect(() => {
    if (!user) return;
    const abort = new AbortController();
    let stopped = false;

    void (async () => {
      // 만료로 끊기면 세션을 되살려 한 번 더 붙는다. 그 뒤로는 폴링에 맡긴다.
      for (let attempt = 0; attempt < 2 && !stopped; attempt++) {
        try {
          for await (const ev of dmClient().watchMessages({ conversationId }, { signal: abort.signal })) {
            if (ev.kind === WatchMessagesResponse_Kind.MESSAGE) {
              merge(ev.messages);
              void dmClient().markRead({ conversationId });
            } else if (ev.kind === WatchMessagesResponse_Kind.TYPING) {
              setTyping(true);
              if (typingTimer.current) clearTimeout(typingTimer.current);
              typingTimer.current = setTimeout(() => setTyping(false), TYPING_HOLD_MS);
            }
            // HEARTBEAT는 살아 있다는 표시일 뿐 — 화면은 아무것도 하지 않는다.
          }
          return; // 서버가 정상 종료했다
        } catch {
          if (stopped) return;
          // 끊겼다 — 토큰이 죽었을 수 있으니 되살려 보고 한 번만 다시 붙는다.
          if (!(await restoreSession())) return;
        }
      }
    })();

    return () => {
      stopped = true;
      abort.abort();
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [conversationId, merge, user]);

  // 새 메시지가 오면 맨 아래로.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages.length는 스크롤 방아쇠다
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function onType(v: string) {
    setText(v);
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      lastTypingSent.current = now;
      // 실패해도 아무 일도 없다 — 표시일 뿐이다.
      void dmClient()
        .typing({ conversationId })
        .catch(() => {});
    }
  }

  /**
   * 그룹에서 나간다.
   *
   * 나간 뒤에는 그 방을 볼 수 없으므로 목록으로 돌려보낸다. 실패하면 **그 자리에 남긴다** —
   * 나간 줄 알고 떠났는데 남아 있으면, 이후 메시지를 계속 받으면서 이유를 모른다.
   */
  async function leave() {
    setError(null);
    try {
      await dmClient().leaveConversation({ conversationId });
      location.href = "/messages";
    } catch (e) {
      setConfirmLeave(false);
      setError(feedErrorMessage(e));
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await dmClient().sendMessage({ conversationId, kind: MessageKind.TEXT, body });
      if (res.message) merge([res.message]);
      setText("");
    } catch (e) {
      setError(feedErrorMessage(e));
      setText(body); // 다시 보낼 수 있게 되돌려 둔다
    } finally {
      setSending(false);
    }
  }

  /**
   * 사진 한 장을 보낸다.
   *
   * **올린 다음에 보낸다** — 서버는 우리 저장소의 주소만 받는다(남의 주소를 실을 수 없다).
   * 올리는 데 실패하면 메시지를 보내지 않는다. 빈 말풍선이 남는 것보다 아무 일도 안 일어난 편이 낫다.
   */
  async function sendImage(file: File) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const url = await uploadImage(file);
      const res = await dmClient().sendMessage({
        conversationId,
        kind: MessageKind.IMAGE,
        mediaUrl: url,
        // 사진 메시지에도 본문 자리는 있다 — 지금은 비워 둔다(설명은 다음 메시지로 적는다).
        body: "",
      });
      if (res.message) merge([res.message]);
    } catch (e) {
      setError(feedErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={title || t("dm.title")}
        back={
          <a href="/messages" aria-label={t("dm.title")} data-testid="conv-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
        // 나가기는 **그룹에만** 있다. 1:1은 나갈 곳이 없다(상대와의 대화 자체가 방이다) —
        // 그 자리에 버튼을 두면 "이 사람과 끊기"로 읽혀 차단과 헷갈린다.
        right={
          isGroup ? (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              aria-label={tw("web.dm.leaveGroup")}
              data-testid="conv-leave"
            >
              <Icon name="exit-outline" size={22} color="var(--color-bad)" />
            </button>
          ) : undefined
        }
      />

      {confirmLeave ? (
        <ConfirmDialog
          testId="confirm-leave-group"
          title={tw("web.dm.leaveGroup")}
          message={tw("web.dm.leaveConfirm")}
          confirmLabel={tw("web.dm.leaveGroup")}
          destructive
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => void leave()}
        />
      ) : null}

      <div
        className="flex flex-1 flex-col gap-[var(--spacing-xs)] p-[var(--spacing-lg)]"
        data-testid="conv-messages"
      >
        {messages.length === 0 ? (
          <ListState
            loading={loading}
            error={loadError}
            onRetry={load}
            skeletonVariant="bubble"
            emptyIcon="chatbubble-ellipses-outline"
            emptyTitle="dm.threadEmpty"
          />
        ) : (
          messages.map((m) => <Bubble key={m.id} msg={m} mine={m.sender?.id === meId} showSender={isGroup} />)
        )}
        <div ref={bottomRef} />
      </div>

      {typing ? (
        <div className="px-[var(--spacing-lg)] pb-[var(--spacing-xs)]">
          <AppText variant="caption" color="textMuted" data-testid="conv-typing">
            {t("dm.typing")}
          </AppText>
        </div>
      ) : null}
      {error ? (
        <div className="px-[var(--spacing-lg)] pb-[var(--spacing-xs)]">
          <AppText variant="caption" color="danger" data-testid="conv-error">
            {error}
          </AppText>
        </div>
      ) : null}

      <div className="sticky bottom-0 flex items-end gap-[var(--spacing-sm)] border-(--color-line) border-t bg-(--color-surface) p-[var(--spacing-md)]">
        {/* 사진 — 고르는 즉시 올라가고 보내진다. 미리보기 단계를 두지 않는다(메신저의 관례다). */}
        <label className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] bg-(--color-surface-alt)">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            data-testid="conv-image-file"
            disabled={sending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void sendImage(f);
              // 같은 파일을 다시 고를 수 있게 비운다(값이 같으면 change가 안 뜬다).
              e.target.value = "";
            }}
          />
          <Icon name="image-outline" size={20} color="var(--color-ink2)" />
        </label>
        <div className="flex-1">
          <TextArea
            value={text}
            onChange={(e) => onType(e.target.value)}
            placeholder={t("dm.messagePlaceholder")}
            rows={1}
            testId="conv-input"
            className="mb-0!"
          />
        </div>
        <Button
          title={t("dm.send")}
          icon="send"
          size="sm"
          fullWidth={false}
          loading={sending}
          disabled={!text.trim()}
          onPress={send}
          testId="conv-send"
        />
      </div>
    </div>
  );
}

function Bubble({ msg, mine, showSender }: { msg: Message; mine: boolean; showSender: boolean }) {
  const image = msg.kind === MessageKind.IMAGE && msg.mediaUrl ? msg.mediaUrl : "";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid="conv-bubble">
      <div
        style={{ maxWidth: "78%" }}
        className={`rounded-[var(--radius-lg)] px-[var(--spacing-md)] py-[var(--spacing-sm)] ${
          mine
            ? "rounded-br-[var(--radius-sm)] bg-(--color-brand)"
            : "rounded-bl-[var(--radius-sm)] bg-(--color-surface-alt)"
        }`}
      >
        {/* 그룹에서만 누가 보냈는지 적는다 — 1:1은 물어볼 것도 없다. */}
        {showSender && !mine && msg.sender?.displayName ? (
          <AppText variant="label" color="primary" className="mb-[2px] block">
            {msg.sender.displayName}
          </AppText>
        ) : null}
        {image ? (
          // biome-ignore lint/performance/noImgElement: 스토리지에서 오는 사진 — 최적화 대상이 아니다
          <img
            src={mediaSrc(image)}
            alt=""
            loading="lazy"
            className="mb-[var(--spacing-xs)] h-[200px] w-[200px] rounded-[var(--radius-md)] object-cover"
          />
        ) : null}
        {msg.body ? (
          <AppText
            variant="body"
            style={{ color: mine ? "var(--color-on-brand)" : "var(--color-ink)" }}
            className="whitespace-pre-wrap break-words"
          >
            {msg.body}
          </AppText>
        ) : null}
      </div>
    </div>
  );
}
