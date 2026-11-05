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
import { formatDistance, type GeoPoint, type RankedGym } from "@app/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { platformOf } from "@/lib/platform";
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
import { LogoSpinner } from "./ui/LogoSpinner";
import { trackUsage } from "@/lib/usage";

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

/** 이만큼 지나도 위치가 없으면 권한 창을 놓쳤을 수 있다고 알린다. */
const SLOW_LOCATE_MS = 15_000;
/** 이만큼 지나도 검색이 안 끝나면 서버가 느리다고 알린다(상한은 25초). */
const SLOW_SEARCH_MS = 10_000;
/** 이만큼 다른 화면에 있다 돌아와야 설정을 바꾸고 온 것으로 본다(권한 창이 잠깐 가린 경우를 뺀다). */
const RETURN_MIN_HIDDEN_MS = 2_000;
/** 재시도·반경 넓히기가 위치를 다시 묻지 않고 쓸 수 있는 시간. */
const LOCATION_FRESH_MS = 5 * 60_000;

function isLocationError(code: GymErrorCode | null): boolean {
  return code === "geo-denied" || code === "geo-timeout" || code === "geo-unavailable";
}

type Phase = "locating" | "searching" | "done" | "error";

export default function NearbyGymsClient() {
  const [phase, setPhase] = useState<Phase>("locating");
  const [errCode, setErrCode] = useState<GymErrorCode | null>(null);
  const [gyms, setGyms] = useState<RankedGym[]>([]);
  const [radiusIdx, setRadiusIdx] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [slowLocate, setSlowLocate] = useState(false);
  const [slowSearch, setSlowSearch] = useState(false);
  const [expandFailed, setExpandFailed] = useState(false);

  // [원본] const run = useCallback(async (radiusM: number) => {
  // [원본]   setPhase("locating");
  // [원본]   setErrCode(null);
  // [원본]   try {
  // [원본]     const loc = await getCurrentLocation();
  // [원본]     setPhase("searching");
  // [원본]     setGyms(await searchNearbyGyms(loc, radiusM));
  // [원본]     setPhase("done");
  // [원본]   } catch (e) {
  // [원본]     setErrCode(e instanceof GymError ? e.code : "search-failed");
  // [원본]     setPhase("error");
  // [원본]   }
  // [원본] }, []);
  //
  // [원본] useEffect(() => {
  // [원본]   void run(RADIUS_STEPS[0]);
  // [원본] }, [run]);

  // [개선] SPEC-029 — 뒤 실행이 앞 실행을 끊고, 받은 위치는 잠시 다시 쓴다.
  const runGen = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);
  const lastLoc = useRef<{ at: number; loc: GeoPoint } | null>(null);
  const radiusIdxRef = useRef(0);

  const run = useCallback(async (idx: number, expanding = false) => {
    const radiusM = RADIUS_STEPS[idx];
    const gen = ++runGen.current;
    searchAbort.current?.abort();
    const ctrl = new AbortController();
    searchAbort.current = ctrl;
    radiusIdxRef.current = idx;
    setErrCode(null);
    setSlowLocate(false);
    setSlowSearch(false);
    setExpandFailed(false);
    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const kept = lastLoc.current;
      let loc: GeoPoint;
      if (kept && Date.now() - kept.at < LOCATION_FRESH_MS) {
        loc = kept.loc;
      } else {
        setPhase("locating");
        slowTimer = setTimeout(() => {
          if (gen === runGen.current) setSlowLocate(true);
        }, SLOW_LOCATE_MS);
        loc = await getCurrentLocation(undefined, undefined, (late) => {
          lastLoc.current = { at: Date.now(), loc: late };
          if (gen === runGen.current) void run(idx, expanding);
        });
        clearTimeout(slowTimer);
        if (gen !== runGen.current) return;
        lastLoc.current = { at: Date.now(), loc };
      }
      setSlowLocate(false);
      setPhase("searching");
      slowTimer = setTimeout(() => {
        if (gen === runGen.current) setSlowSearch(true);
      }, SLOW_SEARCH_MS);
      trackUsage("gym_search");
      const result = await searchNearbyGyms(loc, radiusM, ctrl.signal);
      clearTimeout(slowTimer);
      if (gen !== runGen.current) return;
      setSlowSearch(false);
      setRadiusIdx(idx);
      setGyms(result.gyms);
      setTruncated(result.truncated);
      setPhase("done");
    } catch (e) {
      clearTimeout(slowTimer);
      if (gen !== runGen.current) return;
      setSlowLocate(false);
      setSlowSearch(false);
      if (expanding) {
        // 넓히기가 실패해도 받아 둔 목록과 반경은 그대로 둔다.
        radiusIdxRef.current = idx - 1;
        setExpandFailed(true);
        setPhase("done");
        return;
      }
      setErrCode(e instanceof GymError ? e.code : "search-failed");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void run(0);
    return () => {
      runGen.current += 1;
      searchAbort.current?.abort();
    };
  }, [run]);

  // 설정에서 위치를 켜고 돌아오면 다시 누르지 않아도 찾는다.
  const awaitingPermission = phase === "error" && isLocationError(errCode);
  useEffect(() => {
    if (!awaitingPermission) return;
    let status: PermissionStatus | null = null;
    let closed = false;
    let hiddenAt = 0;
    const retry = () => void run(radiusIdxRef.current);
    const isApp = platformOf(navigator.userAgent) === "app";
    const query = (): Promise<PermissionStatus> =>
      typeof navigator.permissions?.query === "function"
        ? navigator.permissions.query({ name: "geolocation" })
        : Promise.reject(new Error("no permissions api"));
    query().then(
      (s) => {
        if (closed) return;
        status = s;
        s.onchange = () => {
          if (s.state === "granted") retry();
        };
      },
      () => {},
    );
    // iOS 는 onchange 가 믿을 수 없어 돌아올 때마다 다시 묻는다. 물을 수 없거나 앱 안이면 그냥 한 번 다시 찾는다.
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      if (away < RETURN_MIN_HIDDEN_MS) return;
      query().then(
        (s) => {
          if (!closed && (isApp || s.state === "granted")) retry();
        },
        () => {
          if (!closed) retry();
        },
      );
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      if (status) status.onchange = null;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [awaitingPermission, run]);

  // [원본] const canExpand = radiusIdx < RADIUS_STEPS.length - 1;
  // [개선] 45곳에서 잘렸으면 넓혀도 먼 곳이 더 나오지 않는다.
  const canExpand = radiusIdx < RADIUS_STEPS.length - 1 && !truncated;
  const km = RADIUS_STEPS[radiusIdx] / 1000;
  const nextKm = RADIUS_STEPS[Math.min(radiusIdx + 1, RADIUS_STEPS.length - 1)] / 1000;

  // [원본] 반경을 먼저 바꾸고 다시 찾았다 — 실패하면 받아 둔 목록이 사라졌다.
  const expand = useCallback(() => {
    void run(Math.min(radiusIdx + 1, RADIUS_STEPS.length - 1), true);
  }, [radiusIdx, run]);

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("gyms.title")}
        back={
          // [원본] <a href="/profile" aria-label={t("nav.profile")} data-testid="gyms-back"> — 진입이 피드 탭으로 옮겨 갔다(2026-11-05)
          <a href="/feed" aria-label={t("feed.title")} data-testid="gyms-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />

      <div className="flex flex-1 flex-col p-[var(--spacing-lg)]" data-testid="gyms-body">
        {phase === "locating" || phase === "searching" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-[var(--spacing-md)]">
            <span role="status" className="inline-flex">
              <LogoSpinner size={32} label="불러오는 중" />
            </span>
            <AppText variant="body" color="textMuted" data-testid="gyms-phase">
              {t(phase === "locating" ? "gyms.locating" : "gyms.searching")}
            </AppText>
            {phase === "locating" && slowLocate ? (
              <div
                className="flex flex-col items-center gap-[var(--spacing-md)]"
                data-testid="gyms-slow-locate"
              >
                <AppText variant="caption" color="textMuted" className="text-center">
                  {t("gyms.locatingSlow")}
                </AppText>
                <Button
                  title={t("gyms.retry")}
                  icon="refresh"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => void run(radiusIdx)}
                  testId="gyms-retry"
                />
              </div>
            ) : null}
            {phase === "searching" && slowSearch ? (
              <AppText
                variant="caption"
                color="textMuted"
                className="text-center"
                data-testid="gyms-slow-search"
              >
                {t("gyms.searchingSlow")}
              </AppText>
            ) : null}
          </div>
        ) : phase === "error" ? (
          <div data-testid="gyms-error">
            <EmptyState
              tone="error"
              // [원본] icon="location-outline" · title={t("gyms.errTitle")} — 검색 실패도 위치 실패로 보였다
              icon={errCode === "search-failed" || !errCode ? "barbell-outline" : "location-outline"}
              title={t(errCode === "search-failed" || !errCode ? "gyms.errSearchTitle" : "gyms.errTitle")}
              message={t(errCode ? ERR_KEY[errCode] : "gyms.errSearch")}
              action={
                <Button
                  title={t("gyms.retry")}
                  icon="refresh"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => void run(radiusIdx)}
                  testId="gyms-retry"
                />
              }
            />
          </div>
        ) : gyms.length === 0 ? (
          <div data-testid="gyms-empty">
            {expandFailed ? <ExpandFailedNote /> : null}
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
            {expandFailed ? <ExpandFailedNote /> : null}
            <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-sm)] block">
              {t(truncated ? "gyms.foundCountCapped" : "gyms.foundCount", { count: gyms.length, radius: km })}
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

function ExpandFailedNote() {
  return (
    <div role="status" className="mb-[var(--spacing-sm)]" data-testid="gyms-expand-failed">
      <AppText variant="caption" color="textMuted">
        {t("gyms.expandFailed")}
      </AppText>
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
