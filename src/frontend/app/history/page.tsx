// @plm SRS-005  기록 탭 — 완료 세션 목록(로컬 저장소)
import HistoryClient from "../components/analytics/HistoryClient";
import { UserSettingsProvider } from "../components/UserSettingsProvider";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  return (
    // 볼륨 표기에 무게 단위가 필요하다.
    <UserSettingsProvider>
      <HistoryClient />
    </UserSettingsProvider>
  );
}
