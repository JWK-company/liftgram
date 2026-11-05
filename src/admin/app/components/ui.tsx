"use client";

// 운영 웹 공통 부품. 앱 부품을 가져오지 않고 PC 표 중심으로 새로 만든다(SPEC-033).
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { ago } from "@/lib/format";
import { PAGE_SIZE, pageOf } from "@/lib/paging";
import type { Resource } from "@/lib/useResource";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </header>
  );
}

export function Section({
  title,
  note,
  children,
  testid,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  testid?: string;
}) {
  return (
    <section data-testid={testid} className="mb-6 rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        {note && <p className="mt-0.5 text-muted text-xs">{note}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

type Variant = "primary" | "secondary" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-text border-transparent",
  secondary: "bg-surface text-text border-line hover:bg-surface-2",
  danger: "bg-surface text-danger border-danger hover:bg-danger-bg",
};

export function Button({
  variant = "secondary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-md border px-3 py-1.5 whitespace-nowrap disabled:opacity-50 ${VARIANT[variant]} ${className}`}
    />
  );
}

export type Tone = "neutral" | "accent" | "ok" | "danger";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-surface-2 text-accent",
  ok: "bg-surface-2 text-ok",
  danger: "bg-danger-bg text-danger",
};

export function Tag({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/** 마지막 갱신과 새로고침. 다시 읽기가 실패해도 있던 데이터는 남기고 여기서 알린다. */
/** 「n분 전」 표시가 흐르게 30초마다 다시 그린다. */
export function useTick(): void {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
}

export function RefreshBar({ resource }: { resource: Resource<unknown> }) {
  const { loading, loadedAt, error, reload } = resource;
  useTick();
  return (
    <div className="flex items-center gap-3 text-muted text-xs">
      {error && resource.data !== null && (
        <span data-testid="stale-note" role="status" className="font-medium text-text">
          새로고침 실패 — {loadedAt ? `${ago(loadedAt)} 데이터` : "이전 데이터"}. {error}
        </span>
      )}
      {!error && loadedAt && <span data-testid="loaded-at">{ago(loadedAt)} 갱신</span>}
      <Button data-testid="refresh" disabled={loading} onClick={() => void reload()}>
        {loading ? "불러오는 중…" : "새로고침"}
      </Button>
    </div>
  );
}

/** 처음 불러오기 전 상태와 실패. 데이터가 있으면 children 을 그린다. */
export function Loaded<T>({
  resource,
  children,
}: {
  resource: Resource<T>;
  children: (data: T) => ReactNode;
}) {
  if (resource.data !== null) return <>{children(resource.data)}</>;
  if (resource.error) {
    return (
      <div data-testid="load-error" className="rounded-lg border border-line bg-surface p-6">
        <p role="alert">{resource.error}</p>
        <Button className="mt-3" onClick={() => void resource.reload()}>
          다시 시도
        </Button>
      </div>
    );
  }
  return (
    <p data-testid="loading" className="p-6 text-muted">
      불러오는 중…
    </p>
  );
}

export function Empty({
  testid,
  children,
  action,
}: {
  testid?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div data-testid={testid} className="px-4 py-8 text-center text-muted">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/**
 * 검색칸. 글자는 이 칸이 들고 주소에는 잠시 뒤에 적는다. 주소에서 값을 되읽으면 빠른 입력과 한글 조합이 깨진다.
 * 밖에서 값이 바뀌면(거르기 지우기) 따라간다.
 */
export function SearchInput({
  value,
  onCommit,
  className = "",
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => {
    if (text === committed.current) return;
    const t = setTimeout(() => {
      committed.current = text;
      commit.current(text);
    }, 200);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <input
      {...rest}
      type="search"
      value={text}
      onChange={(e) => setText(e.target.value)}
      className={`rounded-md border bg-surface px-2 py-1.5 ${className}`}
    />
  );
}

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** 동작 열은 오른쪽에 고정한다. */
  sticky?: boolean;
  className?: string;
};

/** 표. 머리글은 표 자체 스크롤 안에서 고정되고, 좁은 폭에서는 표만 가로로 스크롤된다. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  testid,
  rowTestid,
  maxHeight = "70dvh",
  scrollKey,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  testid?: string;
  rowTestid?: string;
  maxHeight?: string;
  /** 값이 바뀌면 표 스크롤을 맨 위로 보낸다(페이지 이동). 처리 뒤에는 그대로 둔다. */
  scrollKey?: unknown;
}) {
  const box = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollKey 는 방아쇠다
  useEffect(() => {
    if (box.current) box.current.scrollTop = 0;
  }, [scrollKey]);
  return (
    <div
      ref={box}
      data-testid={testid}
      className="overflow-auto rounded-md border border-line"
      style={{ maxHeight }}
    >
      <table className="w-full border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`sticky top-0 z-10 border-b border-line bg-surface-2 px-3 py-2 font-medium whitespace-nowrap ${c.sticky ? "right-0 z-20" : ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} data-testid={rowTestid} className="align-top">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`border-b border-line bg-surface px-3 py-2 ${c.sticky ? "sticky right-0" : ""} ${c.className ?? ""}`}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { PAGE_SIZE, pageOf };

export function Pager({
  page,
  total,
  onPage,
  testid = "pager",
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
  testid?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div data-testid={testid} className="mt-3 flex items-center justify-end gap-2 text-muted">
      <Button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        이전
      </Button>
      <span data-testid={`${testid}-label`}>
        {page} / {pages}
      </span>
      <Button disabled={page >= pages} onClick={() => onPage(page + 1)}>
        다음
      </Button>
    </div>
  );
}

/** 되돌릴 수 없는 처리 앞의 확인 창. 브라우저 기본 dialog 로 포커스를 가둔다. */
/** 뜰 때 모달로 열고, 닫히면 연 요소로 포커스를 돌려준다(요소째 지우면 브라우저가 돌려주지 않는다). */
export function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.showModal();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return ref;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  confirmDisabled,
  children,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useModal();
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid="confirm-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-full max-w-md rounded-lg border border-line bg-surface p-5 text-text backdrop:bg-black/40"
    >
      <h2 id={titleId} className="font-semibold">
        {title}
      </h2>
      {body && <div className="mt-2 text-muted">{body}</div>}
      {children && <div className="mt-3">{children}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button data-testid="confirm-cancel" disabled={busy} onClick={onCancel}>
          취소
        </Button>
        <Button
          data-testid="confirm-ok"
          variant={danger ? "danger" : "primary"}
          disabled={busy || confirmDisabled}
          onClick={onConfirm}
        >
          {busy ? "처리 중…" : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
