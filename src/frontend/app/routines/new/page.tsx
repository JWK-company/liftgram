// @plm SRS-003  새 루틴 — 들어오는 순간 초안이 만들어진다(app과 같다)
import RoutineEditor from "../../components/routines/RoutineEditor";
import { UserSettingsProvider } from "../../components/UserSettingsProvider";

export const dynamic = "force-dynamic";

export default function NewRoutinePage() {
  return (
    // 무게 단위(kg/lb)를 편집기가 읽는다.
    <UserSettingsProvider>
      <RoutineEditor routineId={null} />
    </UserSettingsProvider>
  );
}
