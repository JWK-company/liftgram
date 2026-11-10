"use client";
// 공식 글의 루틴 칸(ADR-060) — 출처·원본 링크·제휴 아님 고지 · 「루틴 가져오기」는 크리에이터 시트의 저장 흐름을 그대로 쓴다.
import { CREATOR_ROUTINES, creatorChannelLabel, type CreatorRoutine, youtubeWatchUrl } from "@app/core";
import { useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { CreatorRoutineDetailSheet } from "../routines/CreatorRoutineSheet";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { AppText } from "../ui/primitives";

export function OfficialRoutineCard({ routineId }: { routineId: string }) {
  const toast = useToast();
  // 앱에 없거나 숨긴 루틴이면 칸을 그리지 않는다.
  const routine: CreatorRoutine | undefined = useMemo(
    () => CREATOR_ROUTINES.find((r) => r.id === routineId && !r.draft && !r.hidden),
    [routineId],
  );
  const [names, setNames] = useState<string[] | null>(null);
  const [opening, setOpening] = useState(false);

  if (!routine) return null;
  const count = routine.days.reduce((n, d) => n + d.items.length, 0);

  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      // 중복 확인에 쓸 내 루틴 이름. 시트를 열 때 읽어 방금 저장한 것도 잡는다.
      const repo = await import("@app/core/data/routineRepository");
      const models = await repo.queryRoutines().fetch();
      setNames(models.map((m) => (m as unknown as { name: string }).name));
    } catch (e) {
      console.error("내 루틴 읽기 실패", e);
      toast(t("common.error"));
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      // [원본] className="mt-[var(--spacing-sm)] rounded-[var(--radius-md)] border border-(--color-line) p-[var(--spacing-md)]"
      // [개선] 평평한 기록지(SPEC-056 F1) — 글 안 상자를 걷고 운동 기록과 같은 왼쪽 3px 선으로 묶는다
      style={{ boxShadow: "inset 3px 0 0 var(--color-line-strong)" }}
      className="mt-[var(--spacing-sm)] py-[2px] pl-[var(--spacing-md)]"
      data-testid="post-routine"
    >
      <div className="flex items-center justify-between gap-[var(--spacing-sm)]">
        <span className="min-w-0">
          <AppText variant="body" className="block truncate font-bold">
            {routine.labelKo}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {routine.days.length > 1
              ? t("feed.officialDays", { days: routine.days.length, count })
              : t("feed.officialExercises", { count })}
          </AppText>
        </span>
        <span className="shrink-0">
          <Button
            title={t("feed.importRoutine")}
            // [원본] variant 없음(primary) — 공식 글마다 되풀이되는 빨강 채움(SPEC-056 F4) · [개선] 빨강 테두리
            variant="outline"
            onPress={() => void open()}
            loading={opening}
            testId="post-routine-import"
          />
        </span>
      </div>
      <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-xs)] block">
        {t("feed.officialSource", { channel: creatorChannelLabel(routine.source.channel) })} ·{" "}
        <a
          className="underline"
          href={youtubeWatchUrl(routine.source.videoId)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="post-routine-video"
        >
          {t("feed.officialVideo")}
        </a>
      </AppText>
      <AppText variant="caption" color="textFaint" className="block">
        {t("feed.officialNotAffiliated")}
      </AppText>
      {names ? (
        <CreatorRoutineDetailSheet
          routine={routine}
          existingNames={names}
          onClose={() => setNames(null)}
          onSaved={(made, total) => {
            setNames(null);
            toast(
              made === 0
                ? t("common.error")
                : made < total
                  ? t("creator.savedPartial", { count: made, total })
                  : t("creator.savedMessage", { count: made }),
            );
          }}
        />
      ) : null}
    </div>
  );
}
