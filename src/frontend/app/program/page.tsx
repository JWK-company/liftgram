// @plm SRS-009  프로그램 생성
import { UserSettingsProvider } from "../components/UserSettingsProvider";
import ProgramGeneratorClient from "../components/routines/ProgramGeneratorClient";

export const dynamic = "force-dynamic";

export default function ProgramPage() {
  return (
    // 보유 기구 기본값이 사용자 설정에서 온다.
    <UserSettingsProvider>
      <ProgramGeneratorClient />
    </UserSettingsProvider>
  );
}
