// @plm SRS-011  캘린더 탭 — 월별 달력 · 연속일 · 주간 목표 · 날짜별 메모
import CalendarClient from "../components/analytics/CalendarClient";
import { UserSettingsProvider } from "../components/UserSettingsProvider";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    // 수동 표시일·날짜 메모·무게 단위가 모두 사용자 설정에 들어 있다.
    <UserSettingsProvider>
      <CalendarClient />
    </UserSettingsProvider>
  );
}
