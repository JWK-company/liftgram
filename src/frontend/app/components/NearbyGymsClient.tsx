"use client";
// @plm SRS-035  주변 헬스장 — app의 features/gyms/NearbyGymsScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 화면은 네 상태 중 하나다: 위치 확인 중 · 검색 중 · 결과 · 실패.
// **둘을 갈라 두는 이유**는 기다리는 사람이 무엇을 기다리는지 알아야 하기 때문이다
// (위치 권한 팝업이 떠 있는데 "검색 중"이라고 하면 사용자가 팝업을 안 본다).
//
// ── 첫 칸은 추천이다 ────────────────────────────────────────────────────────
// 가장 가까운 한 곳을 강조해 위로 빼고, 나머지는 가까운 순으로 잇는다 —
// "어디로 갈까"에 대한 답이 목록 스크롤이면 답이 아니다.
//
// ── 반경은 넓히기만 한다 ───────────────────────────────────────────────────
// 2 → 5 → 10km. 좁히는 버튼은 두지 않는다(빈 화면을 다시 만드는 버튼이다).
// ─────────────────────────────────────────────────────────────────────────────
import { formatDistance, type RankedGym } from "@app/core";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import {
  getCurrentLocation,
  GymError,
  gymMapsUrl,
  searchNearbyGyms,
  type GymErrorCode,
} from "@/lib/gymSearch";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { AppText, Card, EmptyState } from "./ui/primitives";
import { ScreenHeader } from "./ui/ScreenHeader";

/** 반경 확장 단계(m). */
const RADIUS_STEPS = [2000, 5000, 10000];

/** 실패 코드 → 안내 문구. 사용자가 할 일이 코드마다 다르다. */
const ERR_KEY: Record<GymErrorCode, Parameters<typeof t>[0]> = {
  "geo-unsupported": "gyms.errUnsupported",
  "geo-denied": "gyms.errDenied",
  "geo-unavailable": "gyms.errUnavailable",
  "geo-timeout": "gyms.errTimeout",
  "search-failed": "gyms.errSearch",
};

type Phase = "locating" | "searching" | "done" | "error";

export default function NearbyGymsClient() {
  const [phase, setPhase] = useState<Phase>("locating");
  const [errCode, setErrCode] = useState<GymErrorCode | null>(null);
  const [gyms, setGyms] = useState<RankedGym[]>([]);
  const [radiusIdx, setRadiusIdx] = useState(0);

  const run = useCallback(async (radiusM: number) => {
    setPhase("locating");
    setErrCode(null);
    try {
      const loc = await getCurrentLocation();
      setPhase("searching");
      setGyms(await searchNearbyGyms(loc, radiusM));
      setPhase("done");
    } catch (e) {
      setErrCode(e instanceof GymError ? e.code : "search-failed");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void run(RADIUS_STEPS[0]);
  }, [run]);

  const canExpand = radiusIdx < RADIUS_STEPS.length - 1;
  const km = RADIUS_STEPS[radiusIdx] / 1000;
  const nextKm = RADIUS_STEPS[Math.min(radiusIdx + 1, RADIUS_STEPS.length - 1)] / 1000;

  const expand = useCallback(() => {
    const next = Math.min(radiusIdx + 1, RADIUS_STEPS.length - 1);
    setRadiusIdx(next);
    void run(RADIUS_STEPS[next]);
  }, [radiusIdx, run]);

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("gyms.title")}
        back={
          <a href="/profile" aria-label={t("nav.profile")} data-testid="gyms-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />

      <div className="flex flex-1 flex-col p-[var(--spacing-lg)]" data-testid="gyms-body">
        {phase === "locating" || phase === "searching" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-[var(--spacing-md)]">
            <span
              role="status"
              className="h-5 w-5 animate-spin rounded-full border-2 border-(--color-brand) border-t-transparent"
            />
            <AppText variant="body" color="textMuted" data-testid="gyms-phase">
              {t(phase === "locating" ? "gyms.locating" : "gyms.searching")}
            </AppText>
          </div>
        ) : phase === "error" ? (
          <div data-testid="gyms-error">
            <EmptyState
              tone="error"
              icon="location-outline"
              title={t("gyms.errTitle")}
              message={t(errCode ? ERR_KEY[errCode] : "gyms.errSearch")}
              action={
                <Button
                  title={t("gyms.retry")}
                  icon="refresh"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => void run(RADIUS_STEPS[radiusIdx])}
                  testId="gyms-retry"
                />
              }
            />
          </div>
        ) : gyms.length === 0 ? (
          <div data-testid="gyms-empty">
            <EmptyState
              icon="barbell-outline"
              title={t("gyms.emptyTitle")}
              message={t("gyms.emptyMessage", { radius: km })}
              action={
                canExpand ? (
                  <Button
                    title={t("gyms.expandRadius", { radius: nextKm })}
                    icon="resize"
                    fullWidth={false}
                    onPress={expand}
                    testId="gyms-expand"
                  />
                ) : undefined
              }
            />
          </div>
        ) : (
          <div data-testid="gyms-list">
            <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-sm)] block">
              {t("gyms.foundCount", { count: gyms.length, radius: km })}
            </AppText>

            <GymCard gym={gyms[0]} recommended />
            {gyms.length > 1 ? (
              <>
                <AppText
                  variant="label"
                  color="textMuted"
                  className="mt-[var(--spacing-lg)] mb-[var(--spacing-sm)] block"
                >
                  {t("gyms.nearbyList")}
                </AppText>
                {gyms.slice(1).map((g) => (
                  <GymCard key={g.id} gym={g} />
                ))}
              </>
            ) : null}

            {canExpand ? (
              <div className="mt-[var(--spacing-md)]">
                <Button
                  title={t("gyms.expandRadius", { radius: nextKm })}
                  icon="resize"
                  variant="secondary"
                  onPress={expand}
                  testId="gyms-expand"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function GymCard({ gym, recommended }: { gym: RankedGym; recommended?: boolean }) {
  return (
    <Card
      data-testid={recommended ? "gym-recommended" : "gym-row"}
      className={`mb-[var(--spacing-sm)] flex items-center ${
        recommended ? "border border-(--color-brand) bg-(--color-brand-muted)" : ""
      }`}
    >
      <div className="min-w-0 flex-1 pr-[var(--spacing-md)]">
        {recommended ? (
          <div className="mb-[2px] flex items-center gap-[3px]">
            <Icon name="star" size={11} color="var(--color-brand)" />
            <AppText variant="label" color="primary">
              {t("gyms.recommended")}
            </AppText>
          </div>
        ) : null}
        <AppText variant="heading" className="block truncate">
          {gym.name ?? t("gyms.unnamed")}
        </AppText>
        <div className="mt-[3px] flex items-center gap-[3px]">
          <Icon name="location" size={12} color="var(--color-ink2)" />
          <AppText variant="caption" color="textMuted">
            {formatDistance(gym.distanceM)}
          </AppText>
          {gym.address ? (
            <AppText variant="caption" color="textFaint" className="min-w-0 flex-1 truncate">
              {` · ${gym.address}`}
            </AppText>
          ) : null}
        </div>
      </div>
      {/* 길찾기는 바깥 지도로 나간다 — 새 탭으로 열어 이 화면(과 검색 결과)을 잃지 않게 한다. */}
      <a href={gymMapsUrl(gym)} target="_blank" rel="noopener noreferrer" data-testid="gym-directions">
        <Button
          title={t("gyms.directions")}
          icon="navigate"
          size="sm"
          variant="secondary"
          fullWidth={false}
        />
      </a>
    </Card>
  );
}
