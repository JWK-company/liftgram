"use client";
// SPEC-034 영상 근처 고지 — 영상이 실제로 보일 때만(픽토그램으로 돌아간 때는 내지 않는다).
import { isRepresentativeMotion } from "@app/core/domain/exerciseCautions";
import { t } from "@/lib/i18n";
import { useMotionShown } from "./ExerciseMotion";
import { AppText } from "./ui/primitives";

export function MotionNotice({ exerciseId }: { exerciseId: string }) {
  const shown = useMotionShown(exerciseId);
  if (!shown) return null;
  return (
    <>
      {/* SPEC-036 포괄 종목은 영상이 그 운동 전체가 아니라 예시임을 먼저 알린다 */}
      {isRepresentativeMotion(exerciseId) ? (
        <AppText variant="caption" color="textFaint" center className="block" data-testid="motion-representative">
          {t("exercises.motionRepresentative")}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textFaint" center className="block" data-testid="motion-notice">
        {t("exercises.motionNotice")}
      </AppText>
    </>
  );
}
