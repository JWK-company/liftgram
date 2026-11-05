// @plm SRS-009  프로그램 생성 — 2026-11-05 사용자 지시로 기능 삭제. 옛 주소는 운동 탭으로 보낸다.
import { redirect } from "next/navigation";

/* [원본] 복구하려면 아래를 되살린다. 생성 코드는 ProgramGeneratorClient.tsx · core/data/programRepository 에 그대로 있다.
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
*/

export default function ProgramPage() {
  redirect("/");
}
