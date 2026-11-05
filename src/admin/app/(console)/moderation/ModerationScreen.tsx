"use client";

// 신고 검토. 한 줄에 판단에 필요한 것만 놓고, 처리한 줄은 바로 뺀다(페이지와 스크롤이 튀지 않게).
// 막힌 사진은 주소로 열리지 않아 검토자 권한으로 바이트를 받아 그린다. 승인은 모든 장을 풀기 때문에
// 모든 장이 그려져야 승인할 수 있다.
import { Action, type QueueItem, Reason, Role, TargetType } from "@app/contracts";
import { Code, ConnectError } from "@connectrpc/connect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoleGate } from "@/app/components/RoleGate";
import {
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  Empty,
  Loaded,
  PageHeader,
  Pager,
  pageOf,
  RefreshBar,
  Tag,
  useModal,
} from "@/app/components/ui";
import { kst, num } from "@/lib/format";
import { actionErrorText, isStale, moderationApi, moderationMediaApi } from "@/lib/rpc";
import { useQueryState } from "@/lib/useQueryState";
import { useResource } from "@/lib/useResource";

const ROLES = [Role.ADMIN, Role.MODERATOR] as const;
const LIMIT = 200;
const REFRESH_MS = 5 * 60_000;
/** 사유는 고정이다. 자유 입력을 받지 않아 개인정보가 처리 기록에 섞이지 않는다. */
const REMOVE_REASON = "운영자 검토로 제거";
/** 백엔드 요청 제한(읽기 IP당 분당 120회) 안에 머물도록 사진은 동시에 3장만 받는다. */
const IMAGE_CONCURRENCY = 3;

/** 응답 없는 사진이 줄을 영영 붙잡지 않게 끊고 재시도 버튼을 보인다. */
const IMAGE_TIMEOUT_MS = 20_000;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const REASON: Partial<Record<Reason, string>> = {
  [Reason.SPAM]: "스팸",
  [Reason.NUDITY]: "음란물",
  [Reason.HARASSMENT]: "괴롭힘",
  [Reason.VIOLENCE]: "폭력",
  [Reason.SELF_HARM]: "자해",
  [Reason.MINOR_SAFETY]: "미성년자 안전",
  [Reason.MISINFORMATION]: "허위 정보",
  [Reason.OTHER]: "기타",
};

const reasonLabel = (r: Reason) => REASON[r] ?? "자동 감지";
const keyOf = (i: QueueItem) => `${i.targetType}:${i.targetId}`;

function kindOf(i: QueueItem): "story" | "comment" | "post" {
  const kind = i.preview?.kind ?? "";
  if (kind === "story" || i.targetType === TargetType.STORY) return "story";
  if (kind === "comment" || i.targetType === TargetType.COMMENT) return "comment";
  return "post";
}
const KIND_LABEL = { story: "스토리", comment: "댓글", post: "글" } as const;
const KIND_OBJECT = { story: "이 스토리를", comment: "이 댓글을", post: "이 글을" } as const;

// 사진 받기 줄. 화면 전체가 공유한다.
let running = 0;
const waiting: (() => void)[] = [];
async function inImageQueue<T>(fn: () => Promise<T>): Promise<T> {
  // 슬롯을 다음 차례에 직접 넘긴다. 세고 깨우면 깨어나는 틈에 새 요청이 끼어 네 개가 될 수 있다.
  if (running >= IMAGE_CONCURRENCY) await new Promise<void>((r) => waiting.push(r));
  else running++;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

type Shot = { src: string; state: "drawn" } | { state: "failed"; message: string };

/** 보이는 줄의 사진만 받는다. */
function Thumb({
  url,
  label,
  onState,
  onOpen,
}: {
  url: string;
  label: string;
  onState: (url: string, drawn: boolean) => void;
  onOpen: (src: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((list) => {
      if (list.some((x) => x.isIntersecting)) setVisible(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 는 다시 받기 방아쇠다
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    let objectUrl: string | null = null;
    const abort = new AbortController();
    void inImageQueue(async () => {
      if (!alive) return;
      const res = await moderationMediaApi.getReviewMedia(
        { mediaUrl: url },
        { timeoutMs: IMAGE_TIMEOUT_MS, signal: abort.signal },
      );
      if (!alive) return;
      // 서버가 저장 때 판별하는 네 형식만 그린다. 다른 저장 경로가 생겨도 SVG 등이 「확인됨」으로 승인되지 않는다.
      if (!IMAGE_TYPES.has(res.contentType)) {
        setShot({ state: "failed", message: "지원하지 않는 형식" });
        onState(url, false);
        return;
      }
      objectUrl = URL.createObjectURL(new Blob([new Uint8Array(res.data)], { type: res.contentType }));
      setShot({ src: objectUrl, state: "drawn" });
    }).catch((e: unknown) => {
      if (!alive) return;
      const limited = e instanceof ConnectError && e.code === Code.ResourceExhausted;
      setShot({ state: "failed", message: limited ? "요청 제한, 잠시 뒤 다시" : "못 불러옴, 다시" });
      onState(url, false);
    });
    return () => {
      alive = false;
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      // 그림이 사라지면 「봤다」도 사라진다. 페이지를 오간 뒤 사진 없이 승인되면 안 된다.
      onState(url, false);
    };
  }, [visible, url, attempt]);

  const failed = (message: string) => {
    setShot({ state: "failed", message });
    onState(url, false);
  };

  return (
    <div ref={box} className="size-20 shrink-0 overflow-hidden rounded bg-surface-2">
      {shot?.state === "failed" ? (
        <button
          type="button"
          data-testid="mod-image-retry"
          className="size-full p-1 text-danger text-xs underline"
          onClick={() => {
            setShot(null);
            setAttempt((n) => n + 1);
          }}
        >
          {shot.message}
        </button>
      ) : shot?.state === "drawn" ? (
        <button
          type="button"
          className="size-full"
          aria-label={`${label} 크게 보기`}
          onClick={() => onOpen(shot.src)}
        >
          {/* biome-ignore lint/performance/noImgElement: 검토 원본의 blob 미리보기라 최적화 대상이 아니다 */}
          <img
            data-testid="mod-image"
            src={shot.src}
            alt=""
            className="size-full object-cover"
            onLoad={() => onState(url, true)}
            onError={() => failed("못 그림, 다시")}
          />
        </button>
      ) : (
        <div className="size-full">
          <span className="sr-only">{label} 불러오는 중</span>
        </div>
      )}
    </div>
  );
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const ref = useModal();
  return (
    <dialog
      ref={ref}
      aria-label="사진 원본"
      data-testid="mod-lightbox"
      onCancel={onClose}
      className="m-auto max-h-[92dvh] max-w-[92vw] rounded-lg border border-line bg-surface p-3 text-text backdrop:bg-black/60"
    >
      {/* biome-ignore lint/performance/noImgElement: 검토 원본의 blob 미리보기라 최적화 대상이 아니다 */}
      <img src={src} alt="검토 중인 사진 원본" className="max-h-[80dvh] max-w-full object-contain" />
      <div className="mt-2 text-right">
        <Button data-testid="mod-lightbox-close" onClick={onClose}>
          닫기
        </Button>
      </div>
    </dialog>
  );
}

function Screen() {
  const res = useResource(async () => (await moderationApi.listQueue({ limit: LIMIT })).items, REFRESH_MS);
  const [query, setQuery] = useQueryState();
  const kind = query.get("kind") ?? "";
  const source = query.get("source") ?? "";
  // 대상별 처리 시각. 그보다 먼저 시작한 읽기에는 처리 결과가 없으니 가리고, 뒤에 시작한 읽기는 믿는다.
  // 그래야 늦게 온 옛 응답이 처리한 줄을 되살리지 않고, 다시 신고된 대상은 돌아온다.
  const [done, setDone] = useState<Map<string, number>>(new Map());
  const [drawn, setDrawn] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<QueueItem | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const focusRow = useRef<number | null>(null);

  const markDrawn = useCallback((key: string, url: string, ok: boolean) => {
    setDrawn((prev) => {
      const id = `${key}|${url}`;
      if (prev.has(id) === ok) return prev;
      const next = new Set(prev);
      if (ok) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const startedAt = res.dataStartedAt ?? 0;
  const all = useMemo(
    () =>
      (res.data ?? []).filter((i) => {
        const doneAt = done.get(keyOf(i));
        return doneAt === undefined || startedAt >= doneAt;
      }),
    [res.data, done, startedAt],
  );
  const filtered = useMemo(
    () =>
      all
        .filter((i) => !kind || kindOf(i) === kind)
        .filter((i) => !source || (source === "auto" ? i.source === "auto" : i.source !== "auto")),
    [all, kind, source],
  );
  const { page, rows } = pageOf(filtered, Number(query.get("page")) || 1);

  // 처리한 줄이 사라지면 포커스가 갈 곳이 없어진다. 같은 자리의 줄로 옮긴다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 처리 뒤 줄이 바뀔 때만 돈다
  useEffect(() => {
    if (focusRow.current === null) return;
    const list = document.querySelectorAll<HTMLElement>('[data-testid="mod-item"]');
    const target =
      list[Math.min(focusRow.current, list.length - 1)] ??
      document.querySelector("[data-testid=mod-screen] h1");
    focusRow.current = null;
    const button = target?.querySelector?.<HTMLElement>("button:not(:disabled)");
    (button ?? (target as HTMLElement | null))?.focus?.();
  }, [done]);

  async function act(item: QueueItem, remove: boolean) {
    const key = keyOf(item);
    if (busy) return;
    setBusy(key);
    setActionError(null);
    try {
      await moderationApi.resolve({
        targetType: item.targetType,
        targetId: item.targetId,
        action: remove ? Action.REMOVE : Action.APPROVE,
        reason: remove ? REMOVE_REASON : "",
      });
      // 줄은 바로 빼고 서버를 다시 읽는다. 상한에 닿은 큐는 이 읽기로 남은 건이 이어서 올라온다.
      focusRow.current = rows.findIndex((r) => keyOf(r) === key);
      setDone((prev) => new Map(prev).set(key, Date.now()));
      setRemoving(null);
      void res.reload();
    } catch (e) {
      setActionError(actionErrorText(e));
      if (isStale(e)) {
        setRemoving(null);
        void res.reload();
      }
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<QueueItem>[] = [
    {
      key: "content",
      header: "내용",
      className: "min-w-72 max-w-xl",
      cell: (i) => (
        <>
          {(i.preview?.mediaUrls.length ?? 0) > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {i.preview?.mediaUrls.map((url, n, list) => (
                <Thumb
                  key={url}
                  url={url}
                  label={`사진 ${n + 1}/${list.length}`}
                  onState={(u, ok) => markDrawn(keyOf(i), u, ok)}
                  onOpen={setLightbox}
                />
              ))}
            </div>
          )}
          {i.preview?.text && <div className="whitespace-pre-wrap break-words">{i.preview.text}</div>}
        </>
      ),
    },
    { key: "kind", header: "종류", cell: (i) => <Tag tone="accent">{KIND_LABEL[kindOf(i)]}</Tag> },
    {
      key: "author",
      header: "글쓴이",
      className: "whitespace-nowrap",
      cell: (i) => i.author?.displayName || "이름 없음",
    },
    {
      key: "source",
      header: "감지",
      className: "whitespace-nowrap",
      cell: (i) => (i.source === "auto" ? <Tag>자동 감지</Tag> : "신고"),
    },
    {
      key: "reasons",
      header: "사유",
      cell: (i) => (
        <div className="flex flex-wrap gap-1">
          {i.reasons.map((r) => (
            <Tag key={r}>{reasonLabel(r)}</Tag>
          ))}
        </div>
      ),
    },
    { key: "count", header: "건수", className: "text-right tabular-nums", cell: (i) => num(i.reportCount) },
    { key: "at", header: "시각", className: "whitespace-nowrap tabular-nums", cell: (i) => kst(i.createdAt) },
    {
      key: "actions",
      header: "동작",
      sticky: true,
      cell: (i) => {
        const key = keyOf(i);
        const urls = i.preview?.mediaUrls ?? [];
        const unseen = urls.filter((u) => !drawn.has(`${key}|${u}`)).length;
        return (
          <div className="flex flex-col items-stretch gap-1">
            <Button
              data-testid="mod-approve"
              disabled={Boolean(busy) || unseen > 0}
              onClick={() => void act(i, false)}
            >
              승인
            </Button>
            <Button
              data-testid="mod-remove"
              variant="danger"
              disabled={Boolean(busy)}
              onClick={() => {
                setActionError(null);
                setRemoving(i);
              }}
            >
              제거(숨김)
            </Button>
            {unseen > 0 && (
              <span data-testid="mod-unseen" className="max-w-24 text-muted text-xs">
                사진 {unseen}장 확인 전
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div data-testid="mod-screen">
      <PageHeader title="신고 검토">
        <RefreshBar resource={res} />
      </PageHeader>
      <div className="rounded-lg border border-line bg-surface p-4">
        <Loaded resource={res}>
          {() => (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select
                  aria-label="종류"
                  data-testid="mod-filter-kind"
                  value={kind}
                  onChange={(e) => setQuery({ kind: e.target.value || null, page: null })}
                  className="rounded-md border bg-surface px-2 py-1.5"
                >
                  <option value="">종류 전체</option>
                  <option value="post">글</option>
                  <option value="comment">댓글</option>
                  <option value="story">스토리</option>
                </select>
                <select
                  aria-label="감지"
                  data-testid="mod-filter-source"
                  value={source}
                  onChange={(e) => setQuery({ source: e.target.value || null, page: null })}
                  className="rounded-md border bg-surface px-2 py-1.5"
                >
                  <option value="">감지 전체</option>
                  <option value="auto">자동 감지</option>
                  <option value="report">신고</option>
                </select>
                <span data-testid="mod-count" className="ml-auto text-muted text-xs">
                  {num(filtered.length)}건
                </span>
              </div>
              {(res.data?.length ?? 0) >= LIMIT && (
                <p data-testid="mod-capped" className="mb-2 text-muted text-xs">
                  최근 {num(LIMIT)}건만 표시합니다. 처리하면 오래된 건이 이어서 보입니다.
                </p>
              )}
              {actionError && !removing && (
                <p data-testid="mod-action-error" role="alert" className="mb-2 text-danger">
                  {actionError}
                </p>
              )}
              {all.length === 0 && done.size > 0 && (res.loading || res.error) ? (
                // 다시 읽기 전에는 남은 건이 있는지 모른다(상한에 닿은 큐). 「처리할 일이 없습니다」라고 하지 않는다.
                <Empty testid="mod-rechecking">
                  {res.error
                    ? "남은 건을 확인하지 못했습니다. 새로고침하세요."
                    : "남은 건을 확인하는 중입니다."}
                </Empty>
              ) : all.length === 0 ? (
                <Empty testid="mod-empty">처리할 일이 없습니다. 새 신고가 들어오면 여기에 표시됩니다.</Empty>
              ) : filtered.length === 0 ? (
                <Empty
                  testid="mod-filter-empty"
                  action={
                    <Button
                      data-testid="mod-filter-clear"
                      onClick={() => setQuery({ kind: null, source: null, page: null })}
                    >
                      거르기 지우기
                    </Button>
                  }
                >
                  거르기 결과가 없습니다.
                </Empty>
              ) : (
                <>
                  <DataTable
                    testid="mod-table"
                    rowTestid="mod-item"
                    columns={columns}
                    rows={rows}
                    rowKey={keyOf}
                    scrollKey={page}
                  />
                  <Pager
                    page={page}
                    total={filtered.length}
                    onPage={(p) => setQuery({ page: p > 1 ? String(p) : null })}
                  />
                </>
              )}
            </>
          )}
        </Loaded>
      </div>
      {removing && (
        <ConfirmDialog
          title={`${KIND_OBJECT[kindOf(removing)]} 제거(숨김)할까요?`}
          body={`작성자 외에는 볼 수 없게 됩니다. 처리 사유는 「${REMOVE_REASON}」로 남습니다.`}
          confirmLabel="제거(숨김)"
          danger
          busy={Boolean(busy)}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void act(removing, true)}
        >
          {actionError && (
            <p data-testid="mod-action-error" role="alert" className="text-danger text-xs">
              {actionError}
            </p>
          )}
        </ConfirmDialog>
      )}
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

export function ModerationScreen() {
  return (
    <RoleGate roles={ROLES}>
      <Screen />
    </RoleGate>
  );
}
