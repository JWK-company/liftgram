// @plm SRS-007  하단 탭 바 — app의 navigation/TabNavigator를 웹으로 옮긴 것
//
// app은 하단 탭 6개(운동·피드·기록·캘린더·통계·프로필)를 쓴다. 색 규칙도 같다:
// 활성 = 브랜드, 비활성 = textFaint, 배경 = surface, 위쪽 경계선 1px.
//
// **아직 안 옮긴 탭은 여기 없다.** 화면이 생길 때마다 한 줄씩 는다 — 눌러도 아무것도 없는
// 탭을 미리 그려 두면 "되는 것처럼 보이는" 화면이 되기 때문이다.
"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "../AuthProvider";
import { isInsider } from "../FeedbackClient";
import { Icon, type IconName } from "./Icon";
import { AppText } from "./primitives";

type Tab = { href: string; label: string; icon: IconName; testId: string };

/** app의 ICONS·title과 같은 짝. 순서도 app의 탭 순서를 따른다. */
const TABS: Tab[] = [
  { href: "/", label: "운동", icon: "barbell", testId: "nav-workout" },
  { href: "/feed", label: "피드", icon: "newspaper-outline", testId: "nav-feed" },
  { href: "/history", label: "기록", icon: "time", testId: "nav-history" },
  { href: "/calendar", label: "캘린더", icon: "calendar", testId: "nav-calendar" },
  { href: "/stats", label: "분석", icon: "stats-chart", testId: "nav-stats" },
  { href: "/profile", label: "프로필", icon: "person", testId: "nav-profile" },
];

/**
 * 개발 피드백 탭은 **내부 사람에게만** 보인다(app의 TabNavigator와 같은 규칙).
 * 숨기는 것은 안내일 뿐 경계가 아니다 — 주소를 직접 쳐도 서버가 막는다.
 */
export function TabBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const tabs = isInsider(user?.role)
    ? [
        ...TABS,
        { href: "/feedback", label: "피드백", icon: "chatbox-ellipses" as IconName, testId: "nav-feedback" },
      ]
    : TABS;

  return (
    <nav
      data-testid="shell-nav"
      className="sticky bottom-0 z-40 flex border-(--color-line) border-t bg-(--color-surface)"
    >
      {tabs.map((t) => {
        // 상세(/exercise/…)는 종목 탭에서 들어가는 자리다 — 그 동안에도 탭을 켜 둔다.
        const active =
          t.href === "/" ? pathname === "/" || pathname.startsWith("/exercise") : pathname.startsWith(t.href);
        const color = active ? "var(--color-brand)" : "var(--color-ink3)";
        return (
          <a
            key={t.href}
            href={t.href}
            data-testid={t.testId}
            aria-current={active ? "page" : undefined}
            className="flex flex-1 flex-col items-center gap-[2px] py-[var(--spacing-sm)]"
          >
            <Icon name={t.icon} size={24} color={color} />
            <AppText variant="label" style={{ color }} className="font-normal!">
              {t.label}
            </AppText>
          </a>
        );
      })}
    </nav>
  );
}
