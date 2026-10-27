// @plm SRS-051 SRS-054  하단 탭 바 — 5칸 · 라인 아이콘 · 현재 탭 위쪽 강조선 (결정 D1·D4)
//
// 탭은 운동 · 기록 · 피드 · 분석 · 프로필. 옛 6칸에서 기록과 캘린더는 같은 데이터(지난 운동)라
// 한 탭의 목록/달력 전환으로 합쳤다 — /calendar 주소는 그대로 살아 있고 「기록」 탭이 켜진다.
// 아이콘은 앱 아이콘과 같은 선 굵기의 라인 그림을 여기서 직접 그린다(북타래 탭바와 같은 형태).
//
// 운동 중(/workout)에는 **숨긴다**(결정 D2 집중 모드) — 세트 입력 손가락 근처에 다른 탭 버튼을 두지 않는다.
// 운동 화면을 내리면 진행 중 막대(GlobalWorkoutBar)가 모든 탭 위에 뜬다.
"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../AuthProvider";
import { isInsider } from "../FeedbackClient";
import { LogoSpinner } from "./LogoSpinner";
import { useAppUpdate } from "@/lib/appUpdate";
import { tw } from "@/lib/i18n";

/** 탭바 없이 전체 화면으로 여는 인증 흐름(SRS-054 P3). /account 는 프로필의 하위 화면이라 탭바를 둔다. */
const AUTH_ROUTES = ["/signin", "/signup", "/forgot", "/reset", "/verify-email", "/auth"];

type TabKey = "workout" | "records" | "feed" | "stats" | "profile" | "feedback";
type Tab = { key: TabKey; href: string; label: string; testId: string; match: (p: string) => boolean };

/**
 * 경로가 그 구역 **안**인가 — 글자 접두가 아니라 경로 조각 단위로 본다.
 * `startsWith("/feed")` 는 `/feedback` 도 참이라 피드·피드백 두 탭이 함께 켜졌다(2026-10-27 사용자 제보).
 */
const under = (p: string, ...bases: string[]) => bases.some((b) => p === b || p.startsWith(`${b}/`));

const TABS: Tab[] = [
  {
    key: "workout",
    href: "/",
    label: "운동",
    testId: "nav-workout",
    match: (p) => p === "/" || under(p, "/exercise", "/exercises", "/routines", "/program"),
  },
  {
    key: "records",
    href: "/history",
    label: "기록",
    testId: "nav-history",
    match: (p) => under(p, "/history", "/calendar"),
  },
  {
    key: "feed",
    href: "/feed",
    label: "피드",
    testId: "nav-feed",
    match: (p) =>
      under(
        p,
        "/feed",
        "/discover",
        "/explore",
        "/hashtag",
        "/messages",
        "/notifications",
        "/u",
        "/bookmarks",
      ),
  },
  { key: "stats", href: "/stats", label: "분석", testId: "nav-stats", match: (p) => under(p, "/stats") },
  {
    key: "profile",
    href: "/profile",
    label: "프로필",
    testId: "nav-profile",
    match: (p) => under(p, "/profile", "/account", "/gear", "/gyms", "/coaching", "/blocked"),
  },
];

const FEEDBACK: Tab = {
  key: "feedback",
  href: "/feedback",
  label: "피드백",
  testId: "nav-feedback",
  match: (p) => under(p, "/feedback"),
};

/** 라인 아이콘 — 24 격자 · 선 1.8 · 둥근 끝. 켜진 탭은 같은 선에 브랜드색만 입힌다. */
function TabGlyph({ k }: { k: TabKey }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (k) {
    case "workout":
      return (
        <svg aria-hidden="true" {...common}>
          <rect x="4.5" y="7" width="3.5" height="10" rx="1.2" />
          <rect x="16" y="7" width="3.5" height="10" rx="1.2" />
          <path d="M8 12h8M2.5 12h2M19.5 12h2" />
        </svg>
      );
    case "records":
      return (
        <svg aria-hidden="true" {...common}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13.5h4M7.5 17h7" />
        </svg>
      );
    case "feed":
      return (
        <svg aria-hidden="true" {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
          <circle cx="9" cy="9" r="1.6" />
          <path d="m20.5 15-4.2-4.2a1.5 1.5 0 0 0-2.1 0L5 20" />
        </svg>
      );
    case "stats":
      return (
        <svg aria-hidden="true" {...common}>
          <path d="M4 20h16M7 16.5v-4M12 16.5V7M17 16.5v-7" />
        </svg>
      );
    case "profile":
      return (
        <svg aria-hidden="true" {...common}>
          <circle cx="12" cy="8.5" r="3.8" />
          <path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
        </svg>
      );
    case "feedback":
      return (
        <svg aria-hidden="true" {...common}>
          <path d="M20 11.5c0 4-3.6 7-8 7-1 0-2-.2-2.9-.5L4 19.5l1.3-3.6C4.5 14.6 4 13.1 4 11.5c0-4 3.6-7 8-7s8 3 8 7Z" />
        </svg>
      );
  }
}

/**
 * 누른 탭이 다음 화면을 받는 동안(운영 경로 왕복 ≈0.6s) 그 탭 아이콘 자리에 로고가 차오른다 — 눌렸다는 것을 바로 보인다.
 * Link 의 자식이어야 useLinkStatus 가 그 링크의 대기를 안다.
 */
function TabIcon({ k }: { k: TabKey }) {
  const { pending } = useLinkStatus();
  return pending ? <LogoSpinner size={24} /> : <TabGlyph k={k} />;
}

/**
 * 개발 피드백 탭은 **내부 사람에게만** 보인다(app의 TabNavigator와 같은 규칙).
 * 숨기는 것은 안내일 뿐 경계가 아니다 — 주소를 직접 쳐도 서버가 막는다.
 */
export function TabBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  // 새 버전이 기다리면 프로필 탭에 조용한 점(빨강·금색 아님 — 화면 정리 규칙) @plm SRS-085
  const { available: updateAvailable } = useAppUpdate();
  if (pathname.startsWith("/workout")) return null;
  // 로그인·가입·비밀번호·확인 화면은 전체 화면이다(시안 10) — 탭바가 아래 내용을 가리던 자리.
  if (AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return null;
  const tabs = isInsider(user?.role) ? [...TABS, FEEDBACK] : TABS;

  return (
    <nav
      data-testid="shell-nav"
      // 넓은 화면(lg·1024px+)에서는 탭바를 앱 칸 왼쪽의 세로 막대로 옮긴다(시안 P5) — 데스크톱에서 화면 맨 아래까지
      // 손을 뻗지 않게. 앱 칸(560px)은 그대로 가운데에 두고, 막대는 그 왼쪽 바깥에 붙는다.
      className="sticky bottom-0 z-40 flex border-(--color-line) border-t bg-(--color-surface) pb-[env(safe-area-inset-bottom)] lg:fixed lg:top-0 lg:bottom-auto lg:left-[calc(50%-280px-88px)] lg:h-dvh lg:w-[88px] lg:flex-col lg:justify-center lg:gap-[var(--spacing-sm)] lg:border-t-0 lg:border-r lg:border-l lg:pb-0"
    >
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          // next/link — 탭 이동이 문서 새로 받기(≈0.6s 왕복 + JS·로컬 DB·세션 확인 다시)가 아니라 화면 조각만 바꾼다.
          // 미리받기는 로딩 경계(loading.tsx)까지 — 누르는 순간 로고가 뜨고 내용이 이어 온다.
          <Link
            key={t.key}
            prefetch
            href={t.href}
            data-testid={t.testId}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-[3px] lg:min-h-[64px] lg:flex-none ${
              active ? "text-(--color-brand)" : "text-(--color-ink3)"
            }`}
          >
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-[22%] top-0 h-[2.5px] rounded-b-full bg-(--color-brand) lg:inset-x-auto lg:inset-y-[18%] lg:left-0 lg:h-auto lg:w-[2.5px] lg:rounded-b-none lg:rounded-r-full"
              />
            ) : null}
            <span className="relative inline-flex">
              <TabIcon k={t.key} />
              {t.key === "profile" && updateAvailable ? (
                <span
                  aria-hidden
                  data-testid="nav-profile-update-dot"
                  className="absolute -top-[1px] -right-[3px] h-[6px] w-[6px] rounded-full bg-(--color-ink2) ring-2 ring-(--color-surface)"
                />
              ) : null}
            </span>
            <span className={`text-[11px] leading-none ${active ? "font-semibold" : "font-medium"}`}>
              {t.label}
              {t.key === "profile" && updateAvailable ? (
                <span className="sr-only">{` · ${tw("web.sw.hasUpdate")}`}</span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
