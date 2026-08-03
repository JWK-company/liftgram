// @plm SRS-003  루틴 편집 — 기존 루틴을 연다
import RoutineEditor from "../../components/routines/RoutineEditor";
import { UserSettingsProvider } from "../../components/UserSettingsProvider";

export const dynamic = "force-dynamic";

export default async function EditRoutinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <UserSettingsProvider>
      <RoutineEditor routineId={id} />
    </UserSettingsProvider>
  );
}
