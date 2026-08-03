// @plm SRS-005  분석 탭 — 기간별 집계·추세·분포·최근 PR
import StatsClient from "../components/analytics/StatsClient";
import { UserSettingsProvider } from "../components/UserSettingsProvider";

export const dynamic = "force-dynamic";

export default function StatsPage() {
  return (
    <UserSettingsProvider>
      <StatsClient />
    </UserSettingsProvider>
  );
}
