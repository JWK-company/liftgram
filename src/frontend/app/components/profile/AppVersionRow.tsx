"use client";
// @plm SRS-085  프로필 「앱 버전」 줄 — 새 버전 적용은 이 버튼 한 곳에서만
//
// 줄: 「앱 버전 v0.46.0」 · 새 버전이 기다리면 부제 「새 버전 v0.47.0」(번호를 모르면 「새 버전이 있어요」) + 오른쪽 「업데이트」.
// 운동 중이면 버튼을 끄고 이유 「운동을 끝낸 뒤 업데이트할 수 있어요」. 셸이 진행 중 운동을 읽기 전엔 끈 채 이유 없이(판단 전).
// 누른 순간 기기 DB 를 한 번 더 본다(lib/appUpdate startUpdate) — 셸 상태만 믿지 않는다.
// 색: 부가 설정 줄이라 회색 상자 버튼(빨강 채움 아님 — 화면 정리 규칙) · 누르는 자리 44px.
import { updateRowState } from "@app/core/domain/swUpdatePolicy";
import { useId } from "react";
import { APP_VERSION, isMandatoryNow, startUpdate, useAppUpdate } from "@/lib/appUpdate";
import { tw } from "@/lib/i18n";
import { useSession } from "../SessionProvider";

export function AppVersionRow() {
  const { activeWorkoutId, activeLoaded } = useSession();
  const upd = useAppUpdate();
  const descId = useId();
  const row = updateRowState({ available: upd.available, activeLoaded, activeWorkoutId });
  const mandatory = isMandatoryNow(upd);

  let subtitle: string | null = null;
  const isReason = row === "blocked" || (mandatory && !!activeWorkoutId);
  if (row === "blocked") subtitle = mandatory ? tw("web.sw.mandatoryWait") : tw("web.sw.blockedWorkout");
  else if (upd.available) {
    if (upd.activatedElsewhere && !upd.waiting) subtitle = tw("web.sw.reloadToApply");
    else
      subtitle = upd.displayNewVersion
        ? tw("web.sw.newVersion", { version: upd.displayNewVersion })
        : tw("web.sw.newVersionUnknown");
    if (mandatory) subtitle = `${tw("web.sw.mandatory")} · ${subtitle}`;
  } else if (mandatory && activeWorkoutId) subtitle = tw("web.sw.mandatoryWait");

  return (
    <div
      data-testid="app-version-row"
      data-state={row}
      className="flex min-h-[52px] w-full items-center gap-[var(--spacing-md)] px-[var(--spacing-lg)] py-[var(--spacing-md)]"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate font-medium text-(--color-ink) text-[length:var(--text-md)]"
          data-testid="app-version-current"
        >
          {tw("web.sw.appVersion", { version: APP_VERSION })}
        </span>
        {subtitle ? (
          <span
            id={descId}
            data-testid={isReason ? "app-update-reason" : "app-new-version"}
            className="break-words text-(--color-ink2) text-[length:var(--text-sm)]"
          >
            {subtitle}
          </span>
        ) : null}
      </span>
      {row === "none" ? null : (
        <button
          type="button"
          data-testid="app-update-btn"
          disabled={row !== "ready" || upd.phase === "updating"}
          aria-describedby={subtitle ? descId : undefined}
          onClick={() => void startUpdate()}
          className="min-h-[44px] shrink-0 rounded-[var(--radius-sm)] bg-(--color-surface-alt) px-[var(--spacing-lg)] font-semibold text-(--color-ink) text-[length:var(--text-sm)] focus-visible:outline-2 focus-visible:outline-(--color-brand) focus-visible:outline-offset-2 disabled:opacity-45"
        >
          {tw("web.sw.update")}
        </button>
      )}
    </div>
  );
}
