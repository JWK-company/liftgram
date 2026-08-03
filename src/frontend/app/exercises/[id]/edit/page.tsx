// @plm SRS-001  커스텀 종목 수정
import ExerciseFormClient from "../../../components/ExerciseFormClient";

export const dynamic = "force-dynamic";

export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExerciseFormClient exerciseId={decodeURIComponent(id)} />;
}
