"use client";
// 그룹 챌린지 진입점(SPEC-064 Phase 2) — 운동 홈 한 줄 · 피드 카드. 프로필 메뉴 줄은 ProfileClient 에 있다.
//
// 둘 다 「진행 중 챌린지 목록」 하나를 같이 쓴다(모듈 기억 — 탭을 오가며 줄이 사라졌다 나타나지 않게).
// 다 받기 전에는 그리지 않는다(로드 전 []≠0개). 실패해도 그리지 않는다 — 진입점이 화면을 망치지 않게.
import type { Summary } from "@app/contracts";
import { useEffect, useState } from "react";
import { challengeClient, myTodayName } from "@/lib/challengeClient";
import { useFeedCard } from "@/lib/feedCardsPref";
import { t } from "@/lib/i18n";
import { FeedCardClose } from "../feed/FeedCardClose";
import { Icon } from "../ui/Icon";

let cached: { uid: string; items: Summary[] } | null = null;
// [원본] let inflight: Promise<Summary[]> | null = null;
// [개선] 계정마다 따로 — 로그아웃 뒤 바로 다른 계정이면 앞 계정 응답이 새 계정 이름으로 담기지 않게(REV-161 L-1)
let inflight: { uid: string; p: Promise<Summary[]> } | null = null;

function loadMine(uid: string): Promise<Summary[]> {
  if (inflight?.uid !== uid) {
    const p = challengeClient()
      .listMine({})
      .then((r) => {
        cached = { uid, items: r.items };
        remember(uid, r.items);
        return r.items;
      })
      .finally(() => {
        if (inflight?.p === p) inflight = null;
      });
    inflight = { uid, p };
  }
  return inflight.p;
}

/** 만들기·참가·나가기·해산 뒤 — 옛 목록으로 줄이 잠깐 보였다 사라지지 않게 */
export function forgetMine(): void {
  cached = null;
  inflight = null;
}

// 받기 전 자리(REV-161 M-7) — 지난번 줄 수만큼 비워 두어 다 받은 뒤 화면이 밀리지 않게. 기기 편의값이라 없어도 된다.
const SEEN_KEY = "challenge-entry-seen";
function remember(uid: string, items: Summary[]): void {
  try {
    const home = items.filter((s) => s.status === "active").length;
    const open = items.filter((s) => s.status === "active" || s.status === "recruiting").length;
    localStorage.setItem(SEEN_KEY, JSON.stringify({ uid, home, open }));
  } catch {
    // 저장이 막혀도 그만
  }
}
function seen(uid: string | null): { home: number; open: number } {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null");
    if (v && v.uid === uid) return { home: Number(v.home) || 0, open: Number(v.open) || 0 };
  } catch {
    // 못 읽으면 0
  }
  return { home: 0, open: 0 };
}

function useMine(uid: string | null): Summary[] | null {
  const [items, setItems] = useState<Summary[] | null>(() =>
    uid && cached?.uid === uid ? cached.items : null,
  );
  useEffect(() => {
    if (!uid) {
      setItems(null);
      return;
    }
    let alive = true;
    loadMine(uid)
      .then((xs) => {
        if (alive) setItems(xs);
      })
      .catch(() => {
        // 진입점은 조용히 빠진다 — 비워 둔 자리도 거둔다(빈 목록으로 · 캐시에는 담지 않는다 · REV-163 2차 M-3)
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [uid]);
  return items;
}

// [원본] const DISMISS_KEY = "challenge-feed-intro-dismissed"; — 이제 lib/feedCardsPref.ts 가 처음 값으로만 이어받는다

/** 운동 홈 — 진행 중 챌린지가 있을 때만 줄마다 「제목 · 오늘 상태」(없으면 아무것도 없다) */
export function ChallengeHomeLine({ userId }: { userId: string | null }) {
  const items = useMine(userId);
  const [reserve, setReserve] = useState(0);
  useEffect(() => setReserve(seen(userId).home), [userId]);
  if (items === null) {
    return reserve > 0 ? (
      <div
        className="mt-[var(--spacing-md)]"
        style={{ height: reserve * 48 }}
        aria-hidden
        data-testid="challenge-home-wait"
      />
    ) : null;
  }
  const active = items.filter((s) => s.status === "active");
  if (active.length === 0) return null;
  return (
    <div className="mt-[var(--spacing-md)] flex flex-col" data-testid="challenge-home">
      {active.map((s) => (
        <a
          key={s.id}
          href={`/challenges/${encodeURIComponent(s.id)}`}
          data-testid={`challenge-home-${s.id}`}
          className="flex min-h-[48px] items-center gap-[var(--spacing-sm)] border-(--color-line) border-b px-[var(--spacing-xs)] active:bg-(--color-surface-alt)"
        >
          <Icon name="people-outline" size={20} color="var(--color-ink2)" />
          <span className="min-w-0 flex-1 truncate text-[length:var(--text-sm)]">
            {t("challenge.entry.homeToday", { title: s.rule?.title ?? "", state: myTodayName(s.myToday) })}
          </span>
          <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
        </a>
      ))}
    </div>
  );
}

/**
 * 피드 카드 — 로그인한 사람에게. 진행 중 챌린지가 있으면 오늘 상태, 없으면 소개.
 * [원본] (닫으면 다시 안 보임) → [개선] X = 「피드에 보이기」 끄기, 프로필 설정에서 다시 켬.
 */
export function ChallengeFeedCard({ userId }: { userId: string | null }) {
  const items = useMine(userId);
  // [원본] const [dismissed, setDismissed] = useState<boolean | null>(null);
  // [원본] useEffect(() => { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); }, []); — 한 번 닫으면 다시 켤 길이 없었다
  // [개선] 「피드에 보이기」 설정(프로필에서 다시 켬 · 사용자 지시 3294) — 끄면 진행 중 챌린지 카드도 숨는다
  const shown = useFeedCard("challenge");
  // [원본] const [lastOpen, setLastOpen] = useState(0);
  // [원본] useEffect(() => setLastOpen(seen(userId).open), [userId]); — 켜져 있으면 카드가 늘 나와 자리 판단에 필요 없다
  // [원본] if (!userId || dismissed === null) return null;
  if (!userId || shown !== true) return null;
  if (items === null) {
    // [원본] 카드가 나올 것 같으면(소개를 닫지 않았거나 지난번에 챌린지가 있었으면) 카드 높이만큼 비워 둔다
    // [원본] return !dismissed || lastOpen > 0 ? (
    // [개선] 켜져 있으면 소개나 챌린지 카드가 반드시 나온다 — 늘 카드 높이만큼 비워 둔다
    return (
      <div
        className="mx-[var(--spacing-lg)] mt-[var(--spacing-sm)] h-[64px]"
        aria-hidden
        data-testid="challenge-feed-wait"
      />
    );
  }
  const open = items.filter((s) => s.status === "active" || s.status === "recruiting");
  // [원본] if (open.length === 0 && dismissed) return null; — 끈 경우는 위에서 이미 그리지 않는다
  const first = open[0];
  return (
    <section
      className="mx-[var(--spacing-lg)] mt-[var(--spacing-sm)] flex items-start border-(--color-line) border-b"
      data-testid="challenge-feed-card"
      aria-label={t("challenge.title")}
    >
      <a
        href={first ? `/challenges/${encodeURIComponent(first.id)}` : "/challenges"}
        className="flex min-w-0 flex-1 flex-col gap-[2px] py-[var(--spacing-sm)] focus-visible:outline-2 focus-visible:outline-(--color-brand) active:opacity-70"
        data-testid="challenge-feed-open"
      >
        <span className="flex min-h-7 items-center gap-[var(--spacing-sm)]">
          <Icon name="people-outline" size={20} color="var(--color-ink)" />
          <span className="min-w-0 flex-1 truncate font-semibold text-[length:var(--text-sm)]">
            {first ? first.rule?.title : t("challenge.entry.feedTitle")}
          </span>
          <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
        </span>
        <span className="text-(--color-ink2) text-[length:var(--text-sm)]">
          {first
            ? first.status === "active"
              ? t("challenge.list.today", { state: myTodayName(first.myToday) })
              : t("challenge.status.recruiting")
            : t("challenge.entry.feedBody")}
        </span>
      </a>
      {/* [원본] {first ? null : (<button … data-testid="challenge-feed-dismiss" … localStorage DISMISS_KEY … close-circle ink3 />)}
          — 소개 카드에만 X · 닫으면 영영 안 보임 · 이달의 리프터 X 와 모양이 달랐다 */}
      {/* [개선] 늘 X · 이달의 리프터 카드와 같은 버튼(FeedCardClose) · 끄면 프로필 설정에서 다시 켬(사용자 지시 3294·3299) */}
      <FeedCardClose card="challenge" label={t("feedCards.challengeClose")} testId="challenge-feed-dismiss" />
    </section>
  );
}
