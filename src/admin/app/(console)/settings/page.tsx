import { env } from "@/lib/env";
import { SettingsScreen } from "./SettingsScreen";

// 앱 주소는 실행 환경 값이라 빌드 때 굳히지 않는다.
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <SettingsScreen appUrl={env().APP_URL} />;
}
