"use client";

// 운영 피드백. 운영진이 적고, 관리자가 처리한다. 내가 쓴 글은 List 응답과 id 로 합쳐 표시한다.
import { FeedbackCategory, FeedbackKind, Role } from "@app/contracts";
import { useState } from "react";
import { FeedbackTable } from "@/app/components/FeedbackTable";
import { RoleGate } from "@/app/components/RoleGate";
import { Button, Loaded, PageHeader, RefreshBar, Section } from "@/app/components/ui";
import { actionErrorText, feedbackApi } from "@/lib/rpc";
import { useResource } from "@/lib/useResource";

const ROLES = [Role.ADMIN] as const;
const LIMIT = 200;
const REFRESH_MS = 5 * 60_000;
const TITLE_MIN = 3;
const DETAIL_MIN = 5;

function Compose({ onSent }: { onSent: () => void }) {
  const [category, setCategory] = useState(FeedbackCategory.BUG);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // 서버는 글자 수로 센다. 이모지 하나가 .length 로는 2라 그대로 재면 통과한 뒤 서버에서 거절된다.
  const valid = [...title.trim()].length >= TITLE_MIN && [...detail.trim()].length >= DETAIL_MIN;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      await feedbackApi.submit({ category, title: title.trim(), detail: detail.trim() });
      setTitle("");
      setDetail("");
      setSent(true);
      onSent();
    } catch (err) {
      setError(actionErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <fieldset className="flex gap-1">
        <legend className="sr-only">분류</legend>
        {(
          [
            [FeedbackCategory.BUG, "버그·문제", "bug"],
            [FeedbackCategory.IMPROVEMENT, "개선 제안", "improvement"],
          ] as const
        ).map(([value, label, id]) => (
          <Button
            key={id}
            data-testid={`ops-fb-cat-${id}`}
            aria-pressed={category === value}
            variant={category === value ? "primary" : "secondary"}
            onClick={() => setCategory(value)}
          >
            {label}
          </Button>
        ))}
      </fieldset>
      <label className="block space-y-1">
        <span className="text-muted text-xs">제목({TITLE_MIN}자 이상)</span>
        <input
          data-testid="ops-fb-title"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border bg-bg px-2 py-1.5"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-muted text-xs">내용({DETAIL_MIN}자 이상)</span>
        <textarea
          data-testid="ops-fb-detail"
          rows={4}
          maxLength={4000}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          className="w-full rounded-md border bg-bg px-2 py-1.5"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button data-testid="ops-fb-submit" type="submit" variant="primary" disabled={!valid || busy}>
          {busy ? "올리는 중…" : "올리기"}
        </Button>
        {sent && (
          <span data-testid="ops-fb-sent" role="status" className="text-ok text-xs">
            올렸습니다.
          </span>
        )}
        {error && (
          <span data-testid="ops-fb-error" role="alert" className="text-danger text-xs">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

function Screen() {
  const res = useResource(async () => {
    // 표식 목록이 실패해도 표는 보여 준다. 없는 표식이 잘못된 정보는 아니다.
    const [entries, mine] = await Promise.all([
      feedbackApi.listEntries({ kind: FeedbackKind.OPS }),
      feedbackApi.list({}).catch(() => ({ items: [] })),
    ]);
    return {
      entries: entries.entries,
      mine: new Set(mine.items.filter((i) => i.mine).map((i) => String(i.id))),
    };
  }, REFRESH_MS);
  return (
    <div data-testid="ops-feedback-screen">
      <PageHeader title="운영 피드백">
        <RefreshBar resource={res} />
      </PageHeader>
      <Section title="새 글" testid="ops-fb-compose">
        <Compose onSent={() => void res.reload()} />
      </Section>
      <div className="rounded-lg border border-line bg-surface p-4">
        <Loaded resource={res}>
          {(d) => (
            <FeedbackTable
              entries={d.entries}
              limit={LIMIT}
              showCategory
              mine={d.mine}
              emptyText="아직 올라온 글이 없습니다."
              onChange={(next) => {
                res.mutate((prev) => ({
                  ...prev,
                  entries: prev.entries.map((e) => (e.id === next.id ? next : e)),
                }));
                void res.reload();
              }}
              onConflict={() => void res.reload()}
            />
          )}
        </Loaded>
      </div>
    </div>
  );
}

export function OpsFeedbackScreen() {
  return (
    <RoleGate roles={ROLES}>
      <Screen />
    </RoleGate>
  );
}
