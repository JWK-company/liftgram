"use client";

// 의견 표(SPEC-033). 사용자 의견과 운영 피드백이 같은 규칙으로 처리된다.
// 본문은 신뢰할 수 없는 입력이라 글자로만 그린다. 화면은 관리자 전용이고 경계는 서버다.
// 승인은 지금 아무것도 실행하지 않고, 승인 당시의 본문 해시와 메모만 남는다.
import { FeedbackCategory, type FeedbackEntry, FeedbackStatus } from "@app/contracts";
import { useMemo, useState } from "react";
import {
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  Empty,
  Pager,
  pageOf,
  SearchInput,
  Tag,
  type Tone,
} from "@/app/components/ui";
import { kst, num } from "@/lib/format";
import { actionErrorText, feedbackApi, isStale } from "@/lib/rpc";
import { useQueryState } from "@/lib/useQueryState";

const STATUS: Record<FeedbackStatus, { label: string; tone: Tone }> = {
  [FeedbackStatus.UNSPECIFIED]: { label: "새 글", tone: "neutral" },
  [FeedbackStatus.NEW]: { label: "새 글", tone: "accent" },
  [FeedbackStatus.APPROVED]: { label: "승인", tone: "accent" },
  [FeedbackStatus.IN_PROGRESS]: { label: "진행 중", tone: "accent" },
  [FeedbackStatus.REJECTED]: { label: "반려", tone: "neutral" },
  [FeedbackStatus.DONE]: { label: "완료", tone: "ok" },
};

const CATEGORY: Partial<Record<FeedbackCategory, string>> = {
  [FeedbackCategory.BUG]: "버그·문제",
  [FeedbackCategory.IMPROVEMENT]: "개선 제안",
};

type Move = { to: FeedbackStatus; label: string; id: string };
const APPROVE: Move = { to: FeedbackStatus.APPROVED, label: "승인", id: "approve" };
const START: Move = { to: FeedbackStatus.IN_PROGRESS, label: "진행", id: "start" };
const DONE: Move = { to: FeedbackStatus.DONE, label: "완료", id: "done" };
const REJECT: Move = { to: FeedbackStatus.REJECTED, label: "반려", id: "reject" };
const REOPEN: Move = { to: FeedbackStatus.NEW, label: "다시 열기", id: "reopen" };

// 서버 전이표와 같은 값. 안내일 뿐이고 서버가 다시 판정한다.
const MOVES: Partial<Record<FeedbackStatus, Move[]>> = {
  [FeedbackStatus.NEW]: [APPROVE, START, DONE, REJECT],
  [FeedbackStatus.APPROVED]: [START, DONE, REJECT],
  [FeedbackStatus.IN_PROGRESS]: [DONE, REJECT],
  [FeedbackStatus.REJECTED]: [REOPEN],
};

const isOpen = (s: FeedbackStatus) =>
  s === FeedbackStatus.NEW || s === FeedbackStatus.APPROVED || s === FeedbackStatus.IN_PROGRESS;

const STATUS_FILTER: [string, string, (s: FeedbackStatus) => boolean][] = [
  ["open", "미처리", isOpen],
  ["new", "새 글", (s) => s === FeedbackStatus.NEW],
  ["approved", "승인", (s) => s === FeedbackStatus.APPROVED],
  ["progress", "진행 중", (s) => s === FeedbackStatus.IN_PROGRESS],
  ["done", "완료", (s) => s === FeedbackStatus.DONE],
  ["rejected", "반려", (s) => s === FeedbackStatus.REJECTED],
];

const RANK: Partial<Record<FeedbackStatus, number>> = {
  [FeedbackStatus.NEW]: 0,
  [FeedbackStatus.APPROVED]: 1,
  [FeedbackStatus.IN_PROGRESS]: 2,
};

function when(e: FeedbackEntry): number {
  return Number(e.createdAt?.seconds ?? 0n);
}

export function FeedbackTable({
  entries,
  limit,
  showCategory,
  mine,
  emptyText,
  onChange,
  onConflict,
}: {
  entries: FeedbackEntry[];
  limit: number;
  /** 사용자 의견에는 분류가 없다(앱 입력칸이 본문뿐). 빈 열과 결과 없는 거르기를 보이지 않는다. */
  showCategory: boolean;
  mine?: Set<string>;
  emptyText: string;
  onChange: (next: FeedbackEntry) => void;
  onConflict: () => void;
}) {
  const [query, setQuery] = useQueryState();
  const status = query.get("status") ?? "";
  // 분류를 안 보이는 표에서는 주소에 남은 값도 무시한다. 안 보이는 거르기로 빈 표가 되면 안 된다.
  const category = showCategory ? (query.get("category") ?? "") : "";
  const search = query.get("q") ?? "";
  const [pending, setPending] = useState<{ entry: FeedbackEntry; move: Move } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const test = STATUS_FILTER.find(([k]) => k === status)?.[2];
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => !test || test(e.status))
      .filter(
        (e) =>
          !category ||
          (category === "bug"
            ? e.category === FeedbackCategory.BUG
            : e.category === FeedbackCategory.IMPROVEMENT),
      )
      .filter((e) => !q || `${e.title} ${e.body} ${e.authorName} ${e.resolution}`.toLowerCase().includes(q))
      .sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || when(b) - when(a));
  }, [entries, status, category, search]);

  const hasFilter = Boolean(status || category || search);
  const { page, rows } = pageOf(filtered, Number(query.get("page")) || 1);

  function open(entry: FeedbackEntry, move: Move) {
    setPending({ entry, move });
    setNote("");
    setError(null);
    setNotice(null);
  }

  async function apply() {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await feedbackApi.setStatus({
        id: pending.entry.id,
        status: pending.move.to,
        note: note.trim(),
      });
      // 응답에는 작성자 이름이 없고, 메모를 비우면 응답 메모도 빈 값이다(DB 는 기존 메모를 유지한다).
      // 보던 값을 유지하고, 페이지와 스크롤은 그대로 둔다.
      if (res.entry) {
        onChange({
          ...res.entry,
          authorName: pending.entry.authorName,
          resolution: res.entry.resolution || pending.entry.resolution,
        });
      }
      setPending(null);
    } catch (e) {
      if (isStale(e)) {
        // 다시 눌러도 소용없다. 창을 닫고 표를 다시 읽는다.
        setPending(null);
        setNotice(actionErrorText(e));
        onConflict();
      } else {
        // 요청 제한·연결 실패는 창을 유지한다. 다시 읽으면 제한만 더 먹는다.
        setError(actionErrorText(e));
      }
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<FeedbackEntry>[] = [
    {
      key: "status",
      header: "상태",
      cell: (e) => (
        <span data-testid="fb-status">
          <Tag tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Tag>
        </span>
      ),
    },
    ...(showCategory
      ? [
          {
            key: "category",
            header: "분류",
            className: "whitespace-nowrap",
            cell: (e: FeedbackEntry) => CATEGORY[e.category] ?? "—",
          },
        ]
      : []),
    {
      key: "body",
      header: "내용",
      className: "min-w-72 max-w-xl",
      cell: (e) => (
        <>
          {e.title && <div className="font-medium break-words">{e.title}</div>}
          <div className="whitespace-pre-wrap break-words">{e.body}</div>
          {mine?.has(String(e.id)) && (
            <div className="mt-1">
              <Tag>내가 쓴 글</Tag>
            </div>
          )}
        </>
      ),
    },
    {
      key: "author",
      header: "작성자",
      className: "whitespace-nowrap",
      cell: (e) => e.authorName || "—",
    },
    {
      key: "client",
      header: "플랫폼·버전",
      className: "whitespace-nowrap text-muted",
      cell: (e) => [e.platform, e.appVersion].filter(Boolean).join(" · ") || "—",
    },
    { key: "at", header: "시각", className: "whitespace-nowrap tabular-nums", cell: (e) => kst(e.createdAt) },
    {
      key: "note",
      header: "처리 메모",
      className: "min-w-40 max-w-xs whitespace-pre-wrap break-words text-muted",
      cell: (e) => e.resolution || "—",
    },
    {
      key: "actions",
      header: "동작",
      sticky: true,
      cell: (e) => (
        <div className="flex flex-col items-stretch gap-1 lg:flex-row">
          {(MOVES[e.status] ?? []).map((m) => (
            <Button key={m.id} data-testid={`fb-${m.id}`} onClick={() => open(e, m)}>
              {m.label}
            </Button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="상태"
          data-testid="filter-status"
          value={status}
          onChange={(e) => setQuery({ status: e.target.value || null, page: null })}
          className="rounded-md border bg-surface px-2 py-1.5"
        >
          <option value="">상태 전체</option>
          {STATUS_FILTER.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        {showCategory && (
          <select
            aria-label="분류"
            data-testid="filter-category"
            value={category}
            onChange={(e) => setQuery({ category: e.target.value || null, page: null })}
            className="rounded-md border bg-surface px-2 py-1.5"
          >
            <option value="">분류 전체</option>
            <option value="bug">버그·문제</option>
            <option value="improvement">개선 제안</option>
          </select>
        )}
        <SearchInput
          aria-label="검색"
          placeholder="내용 검색"
          data-testid="filter-search"
          value={search}
          onCommit={(v) => setQuery({ q: v || null, page: null })}
          className="min-w-48 flex-1 md:max-w-xs"
        />
        <span data-testid="fb-count" className="ml-auto text-muted text-xs">
          {num(filtered.length)}건{hasFilter ? ` / 전체 ${num(entries.length)}건` : ""}
        </span>
      </div>
      {notice && (
        <p data-testid="fb-notice" role="alert" className="mb-2 text-danger">
          {notice}
        </p>
      )}
      {entries.length >= limit && (
        <p data-testid="fb-capped" className="mb-2 text-muted text-xs">
          최근 {num(limit)}건만 표시합니다.
        </p>
      )}
      {entries.length === 0 ? (
        <Empty testid="fb-empty">{emptyText}</Empty>
      ) : filtered.length === 0 ? (
        <Empty
          testid="fb-filter-empty"
          action={
            <Button
              data-testid="filter-clear"
              onClick={() => setQuery({ status: null, category: null, q: null, page: null })}
            >
              거르기 지우기
            </Button>
          }
        >
          {status === "open" && !category && !search ? "처리할 일이 없습니다." : "거르기 결과가 없습니다."}
        </Empty>
      ) : (
        <>
          <DataTable
            testid="fb-table"
            rowTestid="fb-item"
            columns={columns}
            rows={rows}
            rowKey={(e) => String(e.id)}
            scrollKey={page}
          />
          <Pager
            page={page}
            total={filtered.length}
            onPage={(p) => setQuery({ page: p > 1 ? String(p) : null })}
          />
        </>
      )}
      {pending && (
        <ConfirmDialog
          title={`「${pending.move.label}」(으)로 바꿀까요?`}
          body={
            pending.move.to === FeedbackStatus.DONE
              ? "완료하면 다시 바꿀 수 없습니다."
              : pending.move.to === FeedbackStatus.APPROVED
                ? "승인 당시의 본문과 메모를 기록합니다. 처리 내용을 적어 주세요."
                : undefined
          }
          confirmLabel={pending.move.label}
          danger={pending.move.to === FeedbackStatus.REJECTED}
          busy={busy}
          confirmDisabled={pending.move.to === FeedbackStatus.APPROVED && !note.trim()}
          onCancel={() => setPending(null)}
          onConfirm={() => void apply()}
        >
          <label className="block space-y-1">
            <span className="text-muted text-xs">
              처리 메모(다른 운영자도 봅니다. 개인정보를 적지 마세요)
            </span>
            <textarea
              data-testid="fb-note"
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border bg-bg px-2 py-1.5"
            />
          </label>
          {error && (
            <p data-testid="fb-action-error" role="alert" className="mt-2 text-danger text-xs">
              {error}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
