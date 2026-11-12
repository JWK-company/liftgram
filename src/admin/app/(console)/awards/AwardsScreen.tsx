"use client";

// 이달의 리프터 운영(SPEC-063 Phase 3 · SRS-117). 관리자만.
//   후보 보기 → 인기상·운영진 픽 고르기 → 추첨 미리보기(고른 두 사람 뺌) → 화면 안 확인 → 확정 → 쿠폰 등록.
//   씨앗은 서버가 미리 정해 둔 것만 쓴다(입력 칸 없음). 쿠폰 번호는 뒤 4자리만 보인다.
//   처리 동작이 있는 화면이라 cacheKey 를 쓰지 않는다(확정 전 값이 되살아나 보이면 안 된다).
import type {
  AdminAward,
  Candidate,
  CandidatesResponse,
  DrawPreviewResponse,
  ListAwardsResponse,
} from "@app/contracts";
import { Role } from "@app/contracts";
import { useState } from "react";
import { RoleGate } from "@/app/components/RoleGate";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Empty,
  Loaded,
  PageHeader,
  RefreshBar,
  Section,
  Tag,
} from "@/app/components/ui";
import { kst } from "@/lib/format";
import { actionErrorText, awardAdminApi } from "@/lib/rpc";
import { useResource } from "@/lib/useResource";

const ROLES = [Role.ADMIN] as const;
/** 행사 첫 달 — 서버 award.FirstMonth 와 같다 */
export const FIRST_MONTH = "2026-11";
const KST_MS = 9 * 3600 * 1000;
const REASON_MAX = 200;

export function kstMonth(ms = Date.now()): string {
  const d = new Date(ms + KST_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 고를 수 있는 달 — 첫 달부터 이번 달까지, 최근이 위 */
export function monthOptions(now = Date.now()): string[] {
  const out: string[] = [];
  for (let m = kstMonth(now); m >= FIRST_MONTH; m = shiftMonth(m, -1)) out.push(m);
  return out;
}

/** 기본 달 — 지난 달(첫 달보다 이르면 첫 달) */
export function defaultMonth(now = Date.now()): string {
  const prev = shiftMonth(kstMonth(now), -1);
  return prev < FIRST_MONTH ? FIRST_MONTH : prev;
}

const REASON_LABEL: Record<string, string> = {
  new: "가입 7일 안 됨",
  email: "메일 미확인",
  age: "만 14세 미확인",
  role: "운영진 계정",
  excluded: "통계 제외",
  withdrawn: "탈퇴",
};

const CATEGORY_LABEL: Record<string, string> = { steady: "꾸준상", popular: "인기상", pick: "운영진 픽" };

function Eligibility({ c }: { c: Candidate }) {
  if (c.eligibility?.eligible) return <Tag tone="ok">대상</Tag>;
  return (
    <span className="flex flex-wrap gap-1" data-testid="award-reasons">
      {(c.eligibility?.reasons ?? []).map((r) => (
        <Tag key={r} tone="danger">
          {REASON_LABEL[r] ?? r}
        </Tag>
      ))}
    </span>
  );
}

function name(c: { displayName: string; userId: string }) {
  return c.displayName || `(이름 없음 ${c.userId.slice(0, 6)})`;
}

type Picked = { userId: string; displayName: string };

function PickSearch({ month, onPick }: { month: string; onPick: (p: Picked) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function search(e: React.FormEvent) {
    e.preventDefault();
    if ([...q.trim()].length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 고른 달 기준으로 자격을 판정한다(REV-156 화면 3)
      const r = await awardAdminApi.searchAwardUsers({ query: q.trim(), month });
      setRows(r.users);
    } catch (err) {
      setError(actionErrorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <form onSubmit={search} className="flex gap-2">
        <label className="sr-only" htmlFor={`pick-q-${month}`}>
          운영진 픽 사용자 검색
        </label>
        <input
          id={`pick-q-${month}`}
          data-testid="award-pick-query"
          value={q}
          maxLength={100}
          placeholder="이름이나 메일로 찾기"
          onChange={(e) => setQ(e.target.value)}
          className="w-64 rounded-md border bg-surface px-2 py-1.5"
        />
        <Button data-testid="award-pick-search" type="submit" disabled={[...q.trim()].length < 2 || busy}>
          {busy ? "찾는 중…" : "찾기"}
        </Button>
        {q.trim() && [...q.trim()].length < 2 && (
          <span className="self-center text-muted text-xs">2자 이상 입력</span>
        )}
      </form>
      {error && (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
      {rows && rows.length === 0 && <p className="text-muted text-xs">찾은 사람이 없습니다.</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line" data-testid="award-pick-results">
          {rows.map((u) => (
            <li key={u.userId} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex flex-wrap items-center gap-2">
                <span>{name(u)}</span>
                <Eligibility c={u} />
              </span>
              <Button
                data-testid="award-pick-choose"
                aria-label={`${name(u)}을(를) 운영진 픽으로`}
                disabled={!u.eligibility?.eligible}
                onClick={() => onPick({ userId: u.userId, displayName: u.displayName })}
              >
                픽으로
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Draft({
  month,
  data,
  onDone,
}: {
  month: string;
  data: CandidatesResponse;
  onDone: (notice: string) => void;
}) {
  const [popular, setPopular] = useState<Picked | null>(null);
  const [pick, setPick] = useState<Picked | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<DrawPreviewResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipOk, setSkipOk] = useState(false);

  const reasonOk = !pick || [...reason.trim()].length >= 2;
  const same = popular && pick && popular.userId === pick.userId;
  const ready = data.confirmable && !data.announced && reasonOk && !same && preview !== null;
  // 고를 수 있는 인기 후보가 있는데 비웠으면 확인 창에서 한 번 더 묻는다(REV-156 화면 5)
  const popularMissing = !popular && data.popular.some((c) => c.eligibility?.eligible);
  // 확정이 왜 꺼졌는지 알려 준다(REV-156 화면 4)
  const why =
    !data.confirmable || same
      ? null
      : !preview
        ? "확정 전에 미리보기를 먼저 봅니다."
        : !reasonOk
          ? "운영진 픽 이유를 2자 이상 적어야 확정할 수 있습니다."
          : null;

  // 고른 사람이 바뀌면 미리보기는 다시 봐야 한다(뺄 사람이 달라진다)
  function choosePopular(p: Picked | null) {
    setPopular(p);
    setPreview(null);
  }
  function choosePick(p: Picked | null) {
    setPick(p);
    setReason(""); // 앞사람 이유가 새 사람에게 붙지 않게(REV-156 화면 4)
    setPreview(null);
  }

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      const exclude = [popular?.userId, pick?.userId].filter((x): x is string => !!x);
      setPreview(await awardAdminApi.drawPreview({ month, excludeIds: exclude }));
    } catch (err) {
      setError(actionErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const r = await awardAdminApi.confirm({
        month,
        popularUserId: popular?.userId ?? "",
        pickUserId: pick?.userId ?? "",
        pickReason: pick ? reason.trim() : "",
      });
      setAsking(false);
      onDone(
        r.alreadyConfirmed
          ? "다른 운영자가 먼저 확정했습니다 — 지금 고른 사람은 반영되지 않았습니다. 아래는 먼저 확정된 결과입니다."
          : `확정했습니다. 수상 ${r.awards.length}건 · 알림을 보냈습니다.`,
      );
    } catch (err) {
      setAsking(false);
      setError(actionErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  const steadyCols = [
    { key: "name", header: "이름", cell: (c: Candidate) => name(c) },
    { key: "days", header: "운동한 날", cell: (c: Candidate) => `${c.days}일` },
    {
      key: "late",
      header: "늦게 올라와 뺀 기록",
      cell: (c: Candidate) => (c.late > 0 ? <Tag tone="danger">{c.late}건</Tag> : "0"),
    },
    { key: "elig", header: "자격", cell: (c: Candidate) => <Eligibility c={c} /> },
  ];
  const popularCols = [
    { key: "rank", header: "순위", cell: (c: Candidate) => String(data.popular.indexOf(c) + 1) },
    { key: "name", header: "이름", cell: (c: Candidate) => name(c) },
    { key: "likes", header: "인정 좋아요", cell: (c: Candidate) => String(c.likes) },
    { key: "likers", header: "누른 사람", cell: (c: Candidate) => `${c.likers}명` },
    { key: "elig", header: "자격", cell: (c: Candidate) => <Eligibility c={c} /> },
    {
      key: "act",
      header: "",
      sticky: true,
      cell: (c: Candidate) => (
        <Button
          data-testid="award-popular-choose"
          aria-pressed={popular?.userId === c.userId}
          aria-label={`${name(c)}을(를) 인기상으로`}
          variant={popular?.userId === c.userId ? "primary" : "secondary"}
          disabled={!c.eligibility?.eligible || data.announced}
          onClick={() =>
            choosePopular(
              popular?.userId === c.userId ? null : { userId: c.userId, displayName: c.displayName },
            )
          }
        >
          {popular?.userId === c.userId ? "인기상 ✓" : "인기상으로"}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Section
        title={`꾸준 후보 ${data.steady.length}명`}
        note="이번 달 운동한 날 12일 이상 · 동기된 기록 기준 · 받은 시각이 운동 시각과 3일 넘게 벌어진 기록은 뺀다"
        testid="award-steady"
      >
        {data.steady.length === 0 ? (
          <Empty testid="award-steady-empty">아직 12일을 넘긴 사람이 없습니다.</Empty>
        ) : (
          <DataTable
            columns={steadyCols}
            rows={data.steady}
            rowKey={(c) => c.userId}
            rowTestid="award-steady-row"
          />
        )}
      </Section>
      <Section
        title="인기 순위 상위 20"
        note="인정 좋아요 = 7일 지난 메일 확인 계정 · 자기 좋아요 제외 · 한 사람이 같은 작성자에게 한 달 5개까지"
        testid="award-popular"
      >
        {data.popular.length === 0 ? (
          <Empty testid="award-popular-empty">이 달에 인정된 좋아요가 없습니다.</Empty>
        ) : (
          <DataTable
            columns={popularCols}
            rows={data.popular}
            rowKey={(c) => c.userId}
            rowTestid="award-popular-row"
          />
        )}
      </Section>
      {!data.announced && (
        <Section title="운영진 픽" note="한 명 · 이유는 수상자 목록에 함께 보인다" testid="award-pick">
          {pick ? (
            <div className="flex flex-wrap items-center gap-3" data-testid="award-pick-chosen">
              <span className="font-medium">{name(pick)}</span>
              <Button data-testid="award-pick-clear" onClick={() => choosePick(null)}>
                바꾸기
              </Button>
            </div>
          ) : (
            <PickSearch month={month} onPick={choosePick} />
          )}
          {pick && (
            <label className="mt-3 block space-y-1">
              <span className="text-muted text-xs" id={`pick-reason-hint-${month}`}>
                고른 이유(꼭 적기 · 2~{REASON_MAX}자 · 지금 {[...reason.trim()].length}자)
              </span>
              <textarea
                data-testid="award-pick-reason"
                required
                aria-invalid={!reasonOk}
                aria-describedby={`pick-reason-hint-${month}`}
                rows={2}
                maxLength={REASON_MAX}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-md border bg-bg px-2 py-1.5"
              />
            </label>
          )}
          {same && (
            <p role="alert" className="mt-2 text-danger text-xs">
              인기상과 운영진 픽은 다른 사람이어야 합니다.
            </p>
          )}
        </Section>
      )}
      {!data.announced && (
        <Section title="추첨 미리보기 · 확정" testid="award-draw">
          <div className="flex flex-wrap items-center gap-3">
            <Button data-testid="award-preview" disabled={busy || !!same} onClick={() => void runPreview()}>
              추첨 미리보기
            </Button>
            <Button
              data-testid="award-confirm"
              variant="primary"
              disabled={!ready || busy}
              onClick={() => setAsking(true)}
            >
              확정
            </Button>
            {!data.confirmable && (
              <span className="text-muted text-xs" data-testid="award-not-confirmable">
                확정은 이 달이 끝나고 다음 달 3일 0시(한국 시각)부터 할 수 있습니다.
              </span>
            )}
            {why && (
              <span className="text-muted text-xs" data-testid="award-confirm-why">
                {why}
              </span>
            )}
          </div>
          {preview && (
            <div className="mt-3 space-y-1" data-testid="award-preview-result">
              <p className="text-muted text-xs">
                추첨 대상 {preview.pool}명 중 {preview.picked.length}명 · 저장된 씨앗으로 계산(같은 조건이면
                같은 결과)
              </p>
              {preview.picked.length === 0 ? (
                <p>뽑을 사람이 없습니다.</p>
              ) : (
                <ol className="list-decimal pl-5">
                  {preview.picked.map((c) => (
                    <li key={c.userId} data-testid="award-preview-row">
                      {name(c)} · {c.days}일
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {error && (
            <p role="alert" data-testid="award-error" className="mt-2 text-danger text-xs">
              {error}
            </p>
          )}
        </Section>
      )}
      {asking && preview && (
        <ConfirmDialog
          title={`${month} 수상자를 확정할까요?`}
          body="확정하면 되돌릴 수 없고, 수상자에게 바로 알림이 갑니다. 씨앗 원문이 공개됩니다."
          confirmLabel="정말 확정"
          busy={busy}
          confirmDisabled={popularMissing && !skipOk}
          onCancel={() => {
            setAsking(false);
            setSkipOk(false);
          }}
          onConfirm={() => void confirm()}
        >
          <ul className="space-y-1 text-sm" data-testid="award-confirm-summary">
            <li>꾸준상: {preview.picked.length ? preview.picked.map(name).join(", ") : "없음"}</li>
            <li>인기상: {popular ? name(popular) : "없음"}</li>
            <li>운영진 픽: {pick ? `${name(pick)} — ${reason.trim()}` : "없음"}</li>
          </ul>
          {popularMissing && (
            <label
              className="mt-3 flex items-start gap-2 text-danger text-sm"
              data-testid="award-skip-popular"
            >
              <input type="checkbox" checked={skipOk} onChange={(e) => setSkipOk(e.target.checked)} />
              <span>인기상 후보가 있는데 고르지 않았습니다. 인기상 없이 확정합니다.</span>
            </label>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

function todayKst(): string {
  return new Date(Date.now() + KST_MS).toISOString().slice(0, 10);
}

function CouponForm({ a, onSaved }: { a: AdminAward; onSaved: () => void }) {
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [item, setItem] = useState(a.couponItem);
  const [expires, setExpires] = useState(a.couponExpires);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok =
    code.trim().length >= 4 &&
    item.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(expires) &&
    expires >= todayKst();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok || busy) return;
    // 이미 등록된 번호를 바꿀 때는 한 번 더 묻는다 — 받은 수상자 것이면 경고(REV-156 화면 2)
    if (a.couponLast4) setAsking(true);
    else void save();
  }
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await awardAdminApi.setCoupon({
        awardId: a.id,
        couponCode: code.trim(),
        couponItem: item.trim(),
        couponExpires: expires,
      });
      setCode("");
      setAsking(false);
      onSaved();
    } catch (err) {
      setError(actionErrorText(err));
    } finally {
      setBusy(false);
    }
  }
  if (a.withdrawn) return <span className="text-muted text-xs">탈퇴 — 쿠폰 등록 안 함</span>;
  const who = name(a);
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2" data-testid="award-coupon-form">
      <input
        aria-label={`${who} 쿠폰 번호`}
        data-testid="award-coupon-code"
        autoComplete="off"
        value={code}
        maxLength={200}
        placeholder={a.couponLast4 ? "새 번호로 바꾸기" : "쿠폰 번호"}
        onChange={(e) => setCode(e.target.value)}
        className="w-40 rounded-md border bg-surface px-2 py-1"
      />
      <input
        aria-label={`${who} 상품`}
        data-testid="award-coupon-item"
        value={item}
        maxLength={100}
        placeholder="상품(예: 닭가슴살 1만원권)"
        onChange={(e) => setItem(e.target.value)}
        className="w-48 rounded-md border bg-surface px-2 py-1"
      />
      <input
        aria-label={`${who} 유효 기한`}
        data-testid="award-coupon-expires"
        type="date"
        min={todayKst()}
        value={expires}
        onChange={(e) => setExpires(e.target.value)}
        className="rounded-md border bg-surface px-2 py-1"
      />
      <Button data-testid="award-coupon-save" type="submit" disabled={!ok || busy}>
        {busy ? "저장 중…" : a.couponLast4 ? "바꾸기" : "등록"}
      </Button>
      {error && (
        <span role="alert" className="text-danger text-xs">
          {error}
        </span>
      )}
      {asking && (
        <ConfirmDialog
          title="쿠폰 번호를 바꿀까요?"
          body={`${who}: ${a.couponLast4} → …${code.trim().slice(-4)}`}
          confirmLabel="바꾸기"
          danger={!!a.claimedAt}
          busy={busy}
          onCancel={() => setAsking(false)}
          onConfirm={() => void save()}
        >
          {a.claimedAt && (
            <p className="text-danger text-sm" data-testid="award-coupon-claimed-warn">
              이 수상자는 이미 「받음」으로 표시했습니다. 바꾸면 받음 표시가 지워지고 새 번호가 보입니다.
            </p>
          )}
        </ConfirmDialog>
      )}
    </form>
  );
}

function Results({ data, onSaved }: { data: ListAwardsResponse; onSaved: () => void }) {
  const cols = [
    {
      key: "cat",
      header: "상",
      cell: (a: AdminAward) =>
        `${CATEGORY_LABEL[a.category] ?? a.category}${a.category === "steady" ? ` ${a.rank}` : ""}`,
    },
    {
      key: "name",
      header: "수상자",
      cell: (a: AdminAward) => (
        <span className="flex flex-wrap items-center gap-1">
          {a.withdrawn ? "탈퇴한 수상자" : name(a)}
          {!a.public && !a.withdrawn && <Tag>비공개</Tag>}
        </span>
      ),
    },
    {
      key: "fact",
      header: "근거",
      cell: (a: AdminAward) =>
        a.category === "steady" ? `${a.days}일` : a.category === "popular" ? `좋아요 ${a.likes}` : a.reason,
    },
    {
      key: "coupon",
      header: "쿠폰",
      cell: (a: AdminAward) =>
        a.couponLast4 ? (
          <span data-testid="award-coupon-state">
            {a.couponLast4} · {a.couponItem} · {a.couponExpires}
          </span>
        ) : (
          <Tag tone="danger">미등록</Tag>
        ),
    },
    {
      key: "claimed",
      header: "받음",
      cell: (a: AdminAward) => (a.claimedAt ? <Tag tone="ok">받음 {kst(a.claimedAt)}</Tag> : "—"),
    },
    { key: "form", header: "쿠폰 등록", cell: (a: AdminAward) => <CouponForm a={a} onSaved={onSaved} /> },
  ];
  return (
    <Section
      title={`${data.month} 수상자 ${data.awards.length}명`}
      note={`씨앗 원문: ${data.seed || "—"} · 쿠폰 번호는 수상자 본인 앱 화면에서만 전체가 보인다`}
      testid="award-results"
    >
      {data.awards.length === 0 ? (
        <Empty>수상자가 없습니다.</Empty>
      ) : (
        <DataTable columns={cols} rows={data.awards} rowKey={(a) => a.id} rowTestid="award-result-row" />
      )}
    </Section>
  );
}

function MonthPanel({ month }: { month: string }) {
  const [notice, setNotice] = useState<string | null>(null);
  const res = useResource(async () => {
    const [cand, awards] = await Promise.all([
      awardAdminApi.candidates({ month }),
      awardAdminApi.listAwards({ month }),
    ]);
    return { cand, awards };
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Loaded resource={res}>
          {(d) => (
            <p className="text-muted text-xs" data-testid="award-status">
              {d.cand.announced ? <Tag tone="ok">발표됨</Tag> : <Tag tone="accent">발표 전</Tag>}{" "}
              <span className="break-all">
                씨앗 지문(sha256): {d.cand.seedHash || "아직 없음(지난 달은 새로 만들지 않음)"}
              </span>
            </p>
          )}
        </Loaded>
        <RefreshBar resource={res} />
      </div>
      {/* 안내는 늘 그려 두고 내용만 바꾼다 — 화면 읽기가 놓치지 않게 · 수상자 표 위(REV-156 화면 6·8) */}
      <p role="status" data-testid="award-notice" className="mb-4 text-ok empty:hidden">
        {notice ?? ""}
      </p>
      {res.data && (
        <>
          {res.data.awards.announced && <Results data={res.data.awards} onSaved={() => void res.reload()} />}
          {/* 다시 읽으면 고른 사람·미리보기를 새로 시작한다 — 확인 창의 꾸준상이 실제 확정과 어긋나지 않게(REV-156 화면 1) */}
          <Draft
            key={res.dataStartedAt ?? 0}
            month={month}
            data={res.data.cand}
            onDone={(n) => {
              setNotice(n);
              // 확정 결과를 바로 반영하고(다시 읽기가 실패해도 확정 칸이 켜진 채 남지 않게) 다시 읽는다
              res.mutate((prev) => ({
                ...prev,
                cand: { ...prev.cand, announced: true } as typeof prev.cand,
              }));
              void res.reload();
            }}
          />
        </>
      )}
    </>
  );
}

function Screen() {
  const [month, setMonth] = useState(defaultMonth);
  return (
    <div data-testid="awards-screen">
      <PageHeader title="이달의 리프터">
        <label className="flex items-center gap-2">
          <span className="text-muted text-xs">달</span>
          <select
            data-testid="award-month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-md border bg-surface px-2 py-1.5"
          >
            {monthOptions().map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </PageHeader>
      {/* 달마다 고른 사람·미리보기를 새로 시작한다 */}
      <MonthPanel key={month} month={month} />
    </div>
  );
}

export function AwardsScreen() {
  return (
    <RoleGate roles={ROLES}>
      <Screen />
    </RoleGate>
  );
}
