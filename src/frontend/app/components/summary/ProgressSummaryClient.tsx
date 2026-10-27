"use client";
// @plm SRS-079 SRS-080  기간 성과 요약(/stats/summary) — 기간 고르기 → 미리보기 → 코치에게 보내기(ADR-041)
//
// ─────────────────────────────────────────────────────────────────────────────
// 흐름(U-15 · 2화면 + 시트 1): 통계 입구 → 이 화면(기간 + 미리보기 + 보낼 항목) → 보내기 시트(코치 고르기·전송).
// 상태 5종: 로딩 · 빈 기간 · 코치 없음 · 오프라인 대기 · 실패(계산 실패 / 「못 보냄 · 이유」).
//
// 보는 그대로 보낸다: 미리보기 = omitSections(전체, 끈 항목) → parseSummaryV1 을 지난 값. 보내는 스냅샷도 바로 그것이다.
// 체중은 처음에 꺼짐(S-11) — 켤 때 「코치가 체중 변화를 보게 돼요」. 고른 값을 기억하지 않는다(다시 열면 다시 꺼짐).
// 보낼 때마다 새 client_id(uuid) — 섹션을 바꿔 다시 보내면 다른 요약이다(같은 id 에 다른 내용 = AlreadyExists).
// 오프라인이면 대기열(lib/summaryOutbox — 계정별 키 · 10개 · 7일)에 두고 연결되면 한 번만 보낸다.
// 이 기기에 다른 계정 기록이 남아 동기가 멈춘 동안(ownerConflict)은 보내지 않는다 — 남의 기록으로 만든 요약일 수 있다.
//   메모리 상태만으로는 앱을 오프라인으로 열었을 때 비어 있다 → 기기 주인·동기 멈춤을 **저장소에서 직접** 읽어(deviceOwnerMatches)
//   보내기 버튼·sendSummary·대기열 재전송 세 곳에서 막는다(P4 /qa code P4S-2). 판정 전에는 버튼을 막아 둔다.
// 코치 목록을 한 번도 못 받아 본 기기가 오프라인이면 「코치 없음」이 아니라 「연결되면 코치를 불러와요」(P4U-5).
// 못 보낸 요약(영구 실패)은 접힌 목록 밖 보내기 버튼 아래에도 보이고, 늘면 한 번 알린다(P4U-6).
// ─────────────────────────────────────────────────────────────────────────────
import { GrantStatus, Side, type SentSummary } from "@app/contracts";
import type { WeightUnit } from "@app/core";
import {
  customSummaryRange,
  isValidSummaryRange,
  omitSections,
  presentSections,
  SUMMARY_DEFAULT_OFF,
  SUMMARY_SCHEMA_VERSION,
  summaryRange,
  type SummaryPreset,
  type SummaryRange,
  type SummarySection,
  type SummaryV1,
} from "@app/core/domain/periodSummary";
import { fitsSummaryLimit, parseSummaryV1, serializeSummaryV1 } from "@app/core/domain/summarySchema";
import { deviceOwnerMatches } from "@app/core/sync/syncOwner";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lang, t, type TransKey } from "@/lib/i18n";
import { coachingClient } from "@/lib/coachingClient";
import {
  type CoachRef,
  type FailReason,
  type FailedItem,
  flushSummaryOutbox,
  onOutboxChange,
  type OutboxItem,
  outboxUser,
  readOutbox,
  rememberCoaches,
  sendSummary,
  startSummaryOutbox,
} from "@/lib/summaryOutbox";
import { useAuth } from "../AuthProvider";
import { useWeightUnit } from "../feed/useWeightUnit";
import { useToast } from "../Toast";
import { SubAppBar } from "../ui/AppBar";
import { Button } from "../ui/Button";
import { Overlay } from "../ui/Dialog";
import { LogoSpinner } from "../ui/LogoSpinner";
import { AppText, Card } from "../ui/primitives";
import { FoldToggle, QuietChip, useFold } from "../ui/quiet";
import { ListGroup, ListRow, SectionLabel, Segmented } from "../ui/rows";
import { SummaryOpenDialog } from "./SummaryOpen";
import { formatSummaryDate, formatSummaryRange, SummaryView } from "./SummaryView";

type Preset = SummaryPreset | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "7d", label: t("progressSummary.preset7d") },
  { value: "4w", label: t("progressSummary.preset4w") },
  { value: "3m", label: t("progressSummary.preset3m") },
  { value: "custom", label: t("progressSummary.presetCustom") },
];

const SECTION_KEY: Record<SummarySection, TransKey> = {
  delta: "progressSummary.sectionDelta",
  prs: "progressSummary.sectionPrs",
  topExercises: "progressSummary.sectionTopExercises",
  muscleSets: "progressSummary.sectionMuscleSets",
  effort: "progressSummary.sectionEffort",
  bodyweight: "progressSummary.sectionBodyweight",
};

const REASON_KEY: Record<FailReason, TransKey> = {
  ended: "progressSummary.reasonEnded",
  invalid: "progressSummary.reasonInvalid",
  conflict: "progressSummary.reasonConflict",
  dailyLimit: "progressSummary.reasonDailyLimit",
  expired: "progressSummary.reasonExpired",
  full: "progressSummary.reasonFull",
  owner: "progressSummary.ownerConflict",
  unknown: "progressSummary.reasonUnknown",
};

/** 시트 제목 — 열 때 포커스를 받는다(U-23 · P4U-8). 콜백 ref 는 한 번만 부르도록 고정한다. */
function useFocusOnMount<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    if (el) requestAnimationFrame(() => el.focus());
  }, []);
}

/** 시트를 닫은 뒤 여는 버튼으로 포커스를 돌려준다(Button 은 ref 를 받지 않아 testid 로 찾는다) */
function focusTestId(testId: string): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    el?.focus();
  });
}

type Built =
  | { kind: "loading" }
  | { kind: "failed" }
  | {
      kind: "ok";
      summary: SummaryV1;
      stats: { readMs: number; computeMs: number; workouts: number; sets: number };
    };

function dayInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 요약마다 새 uuid(v4) — crypto.randomUUID 는 보안 문맥(https·localhost)에서 늘 있다 */
function newClientId(): string {
  return globalThis.crypto.randomUUID();
}

export default function ProgressSummaryClient() {
  const { user, loading: authLoading, ownerConflict } = useAuth();
  const unit = useWeightUnit() as WeightUnit;
  const toast = useToast();

  const [preset, setPreset] = useState<Preset>("4w");
  const [custom, setCustom] = useState<SummaryRange | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const range = useMemo<SummaryRange>(
    () =>
      preset === "custom" && custom ? custom : summaryRange(preset === "custom" ? "4w" : preset, Date.now()),
    [preset, custom],
  );

  const [built, setBuilt] = useState<Built>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [off, setOff] = useState<Set<SummarySection>>(() => new Set(SUMMARY_DEFAULT_OFF));

  // ── 요약 계산(기기 기록 · 읽기만) ──
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 는 다시 시도 방아쇠다
  useEffect(() => {
    let cancelled = false;
    setBuilt({ kind: "loading" });
    void (async () => {
      try {
        const repo = await import("@app/core/data/periodSummaryRepository");
        const r = await repo.buildMemberSummary(range, { lang });
        if (!cancelled) setBuilt({ kind: "ok", summary: r.summary, stats: r.stats });
      } catch (e) {
        console.warn("[progressSummary] 계산 실패", e);
        if (!cancelled) setBuilt({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range, attempt]);

  // 보는 그대로 보낸다 — 끈 항목을 뺀 뒤 받는 쪽과 같은 거름을 지난 값이 미리보기이자 스냅샷이다(S-18)
  const preview = useMemo(
    () => (built.kind === "ok" ? parseSummaryV1(omitSections(built.summary, [...off])) : null),
    [built, off],
  );
  const sections = built.kind === "ok" ? presentSections(built.summary) : [];

  // ── 코치(코칭 중 · 내가 회원) ──
  const [coaches, setCoaches] = useState<CoachRef[] | null>(null);
  // 코치를 못 불러왔고 기억도 없다(오프라인 첫 진입) — 「코치 없음」이 아니다(P4U-5)
  const [coachesUnknown, setCoachesUnknown] = useState(false);
  const [coachAttempt, setCoachAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: coachAttempt 는 다시 시도 방아쇠다
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCoaches([]);
      setCoachesUnknown(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await coachingClient().listGrants({});
        const list = res.grants
          .filter((g) => g.roleOfMe === Side.MEMBER && g.status === GrantStatus.ACTIVE && g.peer)
          .map((g) => ({
            id: g.peer?.id ?? "",
            name: g.peer?.displayName || "?",
            grantId: g.id,
            consentAt: Number(g.consentAt),
          }));
        if (cancelled) return;
        setCoaches(list);
        setCoachesUnknown(false);
        rememberCoaches(user.id, list);
      } catch {
        // 오프라인 — 마지막으로 본 코치(내 관계만). 한 번도 못 받아 봤으면 「모름」
        if (cancelled) return;
        const cached = readOutbox(user.id).coaches;
        setCoaches(cached ?? []);
        setCoachesUnknown(cached === null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, coachAttempt]);

  // ── 기기 주인(저장소에서 직접 · P4S-2) — 판정 전(null)에는 보내기를 막는다 ──
  const [ownerOk, setOwnerOk] = useState<boolean | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: ownerConflict 는 다시 읽기 방아쇠다(대조가 끝나면 저장소 값이 바뀐다)
  useEffect(() => {
    if (!user) {
      setOwnerOk(null);
      return;
    }
    let cancelled = false;
    const check = () =>
      void deviceOwnerMatches(user.id).then((ok) => {
        if (!cancelled) setOwnerOk(ok);
      });
    check();
    // 로그인 대조(reconcile)가 끝나면 저장소 값이 바뀌지만 알림이 없다 — 가볍게(localStorage 두 칸) 다시 읽는다
    const timer = setInterval(check, 2_000);
    window.addEventListener("online", check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("online", check);
    };
  }, [user, ownerConflict, authLoading]);

  // ── 보낸 목록 · 대기 · 실패 ──
  const [sent, setSent] = useState<SentSummary[] | null>(null);
  const [sentError, setSentError] = useState(false);
  const [queue, setQueue] = useState<{
    pending: OutboxItem[];
    failed: FailedItem[];
    names: Record<string, string>;
  }>({
    pending: [],
    failed: [],
    names: {},
  });
  const failedSeen = useRef<number | null>(null);
  const refreshQueue = useCallback(() => {
    if (!user) return;
    const q = readOutbox(user.id);
    setQueue(q);
    // 못 보낸 것이 늘었다(백그라운드 재전송의 영구 실패) — 한 번 알린다(P4U-6). 처음 읽을 때는 알리지 않는다.
    if (failedSeen.current !== null && q.failed.length > failedSeen.current)
      toast(t("progressSummary.failedToast"));
    failedSeen.current = q.failed.length;
  }, [user, toast]);
  const loadSent = useCallback(async () => {
    if (!user) return;
    try {
      setSent((await coachingClient().listSentSummaries({})).summaries);
      setSentError(false);
    } catch {
      setSentError(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refreshQueue();
    void loadSent();
    const stop = onOutboxChange(() => {
      refreshQueue();
      void loadSent();
    });
    // 온라인 복귀 — 대기열이 아직 이 사람을 따르지 않으면 시작한다(앱이 오프라인으로 열려 로그인 대조를 못 했을 때).
    // 대조를 거치지 않지만 재전송(runFlush)이 항목마다 기기 주인을 저장소에서 다시 본다(P4S-2).
    const onOnline = () => {
      if (outboxUser() !== user.id) startSummaryOutbox(user.id);
      else void flushSummaryOutbox(user.id).then(refreshQueue);
    };
    window.addEventListener("online", onOnline);
    return () => {
      stop();
      window.removeEventListener("online", onOnline);
    };
  }, [user, refreshQueue, loadSent]);

  const [sheet, setSheet] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [queuedBanner, setQueuedBanner] = useState(false);
  const [foldOpen, setFoldOpen] = useFold("progressSummarySent");

  // [원본] const coachName = (id: string) => coaches?.find((c) => c.id === id)?.name ?? "?";
  // [개선] 지금 목록 → 이름 기억(해지한 코치 포함) → 「이전 코치」(P4U-9)
  const coachName = (id: string) =>
    coaches?.find((c) => c.id === id)?.name ?? queue.names[id] ?? t("progressSummary.formerCoach");
  const isEmpty = built.kind === "ok" && built.summary.counts.workouts === 0;
  const blockedByOwner = !!ownerConflict || ownerOk === false;
  const canSend =
    !!user && !ownerConflict && ownerOk === true && (coaches?.length ?? 0) > 0 && !!preview && !isEmpty;
  const pendingCount = queue.pending.length;
  const failedCount = queue.failed.length;

  function toggle(sec: SummarySection) {
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(sec)) next.delete(sec);
      else next.add(sec);
      return next;
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <SubAppBar title={t("progressSummary.title")} fallbackHref="/stats" />
      <div
        className="flex flex-1 flex-col px-[var(--spacing-lg)] pt-[var(--spacing-md)] pb-[var(--spacing-xl)]"
        data-testid="ps-page"
      >
        <Segmented
          testId="ps-period"
          className="mb-[var(--spacing-md)]"
          value={preset}
          onChange={(v) => {
            if (v === "custom") setCustomOpen(true);
            else setPreset(v);
          }}
          items={PRESETS.map((p) => ({ value: p.value, label: p.label, testId: `ps-period-${p.value}` }))}
        />

        {built.kind === "loading" ? (
          <div className="flex justify-center py-[var(--spacing-xxl)]" data-testid="ps-loading">
            <span role="status" className="inline-flex">
              <LogoSpinner size={36} label={t("progressSummary.loading")} />
            </span>
          </div>
        ) : built.kind === "failed" || !preview ? (
          <div data-testid="ps-failed" className="py-[var(--spacing-xl)] text-center">
            <AppText variant="body" color="textMuted" className="block">
              {t("progressSummary.failed")}
            </AppText>
            <div className="mt-[var(--spacing-sm)] flex justify-center">
              <Button
                title={t("common.retry")}
                size="sm"
                variant="secondary"
                fullWidth={false}
                onPress={() => setAttempt((n) => n + 1)}
              />
            </div>
          </div>
        ) : isEmpty ? (
          <div data-testid="ps-empty" className="py-[var(--spacing-xl)] text-center">
            <AppText variant="caption" color="textMuted" className="block">
              {formatSummaryRange(range.startMs, range.endMs, range.tz)}
            </AppText>
            <AppText variant="body" className="mt-[var(--spacing-sm)] block font-medium!">
              {t("progressSummary.empty")}
            </AppText>
            <AppText variant="caption" color="textMuted" className="block">
              {t("progressSummary.emptyHint")}
            </AppText>
          </div>
        ) : (
          <div
            data-testid="ps-ready"
            data-read-ms={built.stats.readMs}
            data-compute-ms={built.stats.computeMs}
            data-workouts={built.stats.workouts}
            data-sets={built.stats.sets}
          >
            <SummaryView summary={preview} unit={unit} viewer="member" />

            {sections.length > 0 ? (
              <section className="mt-[var(--spacing-lg)]" data-testid="ps-sections">
                <SectionLabel title={t("progressSummary.sectionsTitle")} />
                <div className="flex flex-wrap gap-[var(--spacing-sm)]">
                  {sections.map((sec) => (
                    <QuietChip
                      key={sec}
                      label={t(SECTION_KEY[sec])}
                      active={!off.has(sec)}
                      onPress={() => toggle(sec)}
                      testId={`ps-section-${sec}`}
                    />
                  ))}
                </div>
                <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-xs)] block">
                  {t("progressSummary.sectionsHint")}
                </AppText>
                {sections.includes("bodyweight") && !off.has("bodyweight") ? (
                  <AppText
                    variant="caption"
                    color="warning"
                    className="mt-[2px] block"
                    data-testid="ps-bodyweight-warn"
                  >
                    {t("progressSummary.bodyweightWarn")}
                  </AppText>
                ) : null}
              </section>
            ) : null}
          </div>
        )}

        {/* 보내기 — 코치 없음·로그인 안 함·다른 계정 기록이면 안내만 */}
        {built.kind === "ok" && !isEmpty ? (
          <div className="mt-[var(--spacing-lg)]">
            {queuedBanner || queue.pending.length > 0 ? (
              <AppText
                variant="caption"
                color="textMuted"
                className="mb-[var(--spacing-xs)] block"
                data-testid="ps-queued"
              >
                {`${t("progressSummary.offlineQueued")} · ${t("progressSummary.queuedNote")}`}
              </AppText>
            ) : null}
            {!user && !authLoading ? (
              <Card data-testid="ps-nocoach">
                <AppText variant="body" className="block font-medium!">
                  {t("progressSummary.noCoach")}
                </AppText>
                <AppText variant="caption" color="textMuted" className="block">
                  {t("progressSummary.loginHint")}
                </AppText>
              </Card>
            ) : blockedByOwner ? (
              <AppText variant="caption" color="textMuted" className="block" data-testid="ps-owner-conflict">
                {t("progressSummary.ownerConflict")}
              </AppText>
            ) : coachesUnknown ? (
              <Card data-testid="ps-coach-unknown">
                <AppText variant="body" className="block font-medium!">
                  {t("progressSummary.coachesOffline")}
                </AppText>
                <div className="mt-[var(--spacing-xs)]">
                  <Button
                    title={t("common.retry")}
                    size="sm"
                    variant="secondary"
                    fullWidth={false}
                    onPress={() => setCoachAttempt((n) => n + 1)}
                    testId="ps-coach-retry"
                  />
                </div>
              </Card>
            ) : coaches !== null && coaches.length === 0 ? (
              <Card data-testid="ps-nocoach">
                <AppText variant="body" className="block font-medium!">
                  {t("progressSummary.noCoach")}
                </AppText>
                <AppText variant="caption" color="textMuted" className="block">
                  {t("progressSummary.noCoachHint")}
                </AppText>
                <Link
                  href="/coaching"
                  className="mt-[var(--spacing-xs)] inline-block text-(--color-brand) text-[length:var(--text-sm)]"
                  data-testid="ps-nocoach-link"
                >
                  {`${t("progressSummary.noCoachLink")} ›`}
                </Link>
              </Card>
            ) : (
              <Button
                title={t("progressSummary.send")}
                icon="send"
                disabled={!canSend}
                onPress={() => setSheet(true)}
                testId="ps-send"
              />
            )}
          </div>
        ) : null}

        {/* 못 보낸 요약 — 접힌 목록 안에만 두면 보냈다고 믿는다(P4U-6). 누르면 목록을 편다. */}
        {user && failedCount > 0 ? (
          <button
            type="button"
            data-testid="ps-failed-note"
            onClick={() => {
              setFoldOpen(true);
              focusTestId("ps-sent-toggle");
            }}
            className="mt-[var(--spacing-sm)] flex min-h-[44px] items-center self-start text-left text-(--color-bad) text-[length:var(--text-sm)]"
          >
            {t("progressSummary.failedNote", { count: failedCount })}
          </button>
        ) : null}

        {/* 보낸 요약 n — 같은 화면 아래 접기(U-15) */}
        {user ? (
          <div className="mt-[var(--spacing-xl)]" data-testid="ps-sent">
            <FoldToggle
              open={foldOpen}
              onToggle={() => setFoldOpen(!foldOpen)}
              // [원본] label={t("progressSummary.sentList", { count: sent?.length ?? 0 })}
              // [개선] 대기·못 보냄도 함께 센다(P4U-6)
              label={[
                t("progressSummary.sentList", { count: sent?.length ?? 0 }),
                pendingCount > 0 ? t("progressSummary.sentListPending", { count: pendingCount }) : null,
                failedCount > 0 ? t("progressSummary.sentListFailed", { count: failedCount }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              testId="ps-sent-toggle"
              controls="ps-sent-list"
            />
            {foldOpen ? (
              <div id="ps-sent-list" className="mt-[var(--spacing-xs)]">
                {sentError ? (
                  <AppText variant="caption" color="textMuted" className="block">
                    {t("progressSummary.listFailed")}
                  </AppText>
                ) : null}
                {queue.pending.length + queue.failed.length + (sent?.length ?? 0) === 0 && !sentError ? (
                  <AppText variant="caption" color="textMuted" className="block" data-testid="ps-sent-empty">
                    {t("progressSummary.sentListEmpty")}
                  </AppText>
                ) : (
                  <ListGroup>
                    {queue.pending.map((p) => (
                      <ListRow
                        key={p.clientId}
                        testId="ps-sent-pending"
                        title={t("progressSummary.sentRow", {
                          name: coachName(p.trainerId),
                          range: formatSummaryRange(p.periodStart, p.periodEnd),
                        })}
                        subtitle={t("progressSummary.pendingRow")}
                      />
                    ))}
                    {queue.failed.map((f) => (
                      <ListRow
                        key={f.clientId}
                        testId="ps-sent-failed"
                        title={t("progressSummary.sentRow", {
                          name: coachName(f.trainerId),
                          range: formatSummaryRange(f.periodStart, f.periodEnd),
                        })}
                        subtitle={t("progressSummary.notSent", {
                          reason: t(REASON_KEY[f.reason] ?? REASON_KEY.unknown),
                        })}
                      />
                    ))}
                    {(sent ?? []).map((s) => (
                      <ListRow
                        key={s.id}
                        testId="ps-sent-row"
                        onPress={() => setOpenId(s.id)}
                        title={t("progressSummary.sentRow", {
                          name: coachName(s.trainerId),
                          range: formatSummaryRange(Number(s.periodStart), Number(s.periodEnd)),
                        })}
                        subtitle={`${t("progressSummary.sentAt", { date: formatSummaryDate(Number(s.createdAt)) })}${
                          s.delivered ? "" : ` · ${t("progressSummary.sentUndelivered")}`
                        }`}
                      />
                    ))}
                  </ListGroup>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {customOpen ? (
        <CustomRangeSheet
          initial={range}
          onClose={() => {
            setCustomOpen(false);
            focusTestId("ps-period-custom");
          }}
          onApply={(r) => {
            setCustom(r);
            setPreset("custom");
            setCustomOpen(false);
            focusTestId("ps-period-custom");
          }}
        />
      ) : null}

      {sheet && preview && user ? (
        <SendSheet
          coaches={coaches ?? []}
          preview={preview}
          sections={sections.filter((s) => !off.has(s))}
          onClose={() => {
            setSheet(false);
            focusTestId("ps-send");
          }}
          onDone={(res) => {
            setSheet(false);
            focusTestId("ps-send");
            if (res === "sent") toast(t("progressSummary.sent"));
            else {
              setQueuedBanner(true);
              toast(t("progressSummary.offlineQueued"));
            }
            refreshQueue();
            void loadSent();
          }}
          ownerUserId={user.id}
        />
      ) : null}

      {openId ? (
        <SummaryOpenDialog summaryId={openId} viewAs="sender" unit={unit} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  );
}

/** 「직접」 — 시트 안 날짜 입력 두 칸(U-15) */
function CustomRangeSheet({
  initial,
  onClose,
  onApply,
}: {
  initial: SummaryRange;
  onClose: () => void;
  onApply: (r: SummaryRange) => void;
}) {
  const [start, setStart] = useState(dayInput(initial.startMs));
  const [end, setEnd] = useState(dayInput(initial.endMs - 1));
  const r = customSummaryRange(start, end);
  const valid = !!r && isValidSummaryRange(r, Date.now());
  const inputCls =
    "mt-[2px] h-[44px] w-full rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) px-[var(--spacing-sm)] text-(--color-ink)";
  const titleRef = useFocusOnMount<HTMLHeadingElement>();
  return (
    <Overlay onClose={onClose} testId="ps-custom-sheet" placement="bottom">
      <h2
        ref={titleRef}
        tabIndex={-1}
        data-testid="ps-custom-title"
        className="block font-bold text-(--color-ink) text-[length:var(--text-lg)] outline-none"
      >
        {t("progressSummary.customTitle")}
      </h2>
      <div className="mt-[var(--spacing-md)] grid grid-cols-2 gap-[var(--spacing-sm)]">
        <label className="block text-(--color-ink2) text-[length:var(--text-sm)]">
          {t("progressSummary.customStart")}
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={inputCls}
            data-testid="ps-custom-start"
          />
        </label>
        <label className="block text-(--color-ink2) text-[length:var(--text-sm)]">
          {t("progressSummary.customEnd")}
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={inputCls}
            data-testid="ps-custom-end"
          />
        </label>
      </div>
      {!valid ? (
        <AppText
          variant="caption"
          color="danger"
          className="mt-[var(--spacing-xs)] block"
          data-testid="ps-custom-invalid"
        >
          {t("progressSummary.rangeInvalid")}
        </AppText>
      ) : null}
      <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
        <Button title={t("common.cancel")} variant="secondary" onPress={onClose} />
        <Button
          title={t("progressSummary.customApply")}
          disabled={!valid}
          onPress={() => r && onApply(r)}
          testId="ps-custom-apply"
        />
      </div>
    </Overlay>
  );
}

/** 보내기 시트 — 받을 코치(여럿이면 고르기) · 보낼 항목 확인 · 전송 */
function SendSheet({
  coaches,
  preview,
  sections,
  ownerUserId,
  onClose,
  onDone,
}: {
  coaches: CoachRef[];
  preview: SummaryV1;
  sections: SummarySection[];
  ownerUserId: string;
  onClose: () => void;
  onDone: (res: "sent" | "queued") => void;
}) {
  const [trainerId, setTrainerId] = useState(coaches[0]?.id ?? "");
  const titleRef = useFocusOnMount<HTMLHeadingElement>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<FailReason | null>(null);
  const snapshot = useMemo(() => serializeSummaryV1(preview), [preview]);
  const tooLarge = !fitsSummaryLimit(snapshot);
  const rangeOk = isValidSummaryRange(preview.range, Date.now());

  async function send() {
    if (busy || !trainerId) return;
    setBusy(true);
    setFailed(null);
    try {
      const coach = coaches.find((c) => c.id === trainerId);
      const res = await sendSummary({
        clientId: newClientId(), // 누를 때마다 새 id — 다른 내용이면 다른 요약(재전송만 같은 id)
        ownerUserId,
        trainerId,
        // 만든 시점의 관계 — 대기 중 해지·재계약이면 보내지 않는다(P4S-4)
        grantId: coach?.grantId,
        consentAt: coach?.consentAt,
        periodStart: preview.range.startMs,
        periodEnd: preview.range.endMs,
        schemaVersion: SUMMARY_SCHEMA_VERSION,
        snapshotJson: snapshot,
      });
      if (res.kind === "failed") setFailed(res.reason);
      else onDone(res.kind);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} testId="ps-send-sheet" placement="bottom">
      <h2
        ref={titleRef}
        tabIndex={-1}
        data-testid="ps-send-title"
        className="block font-bold text-(--color-ink) text-[length:var(--text-lg)] outline-none"
      >
        {t("progressSummary.sendTitle")}
      </h2>
      <AppText variant="caption" color="textMuted" className="mt-[2px] block">
        {formatSummaryRange(preview.range.startMs, preview.range.endMs, preview.range.tz)}
      </AppText>

      <AppText variant="label" color="textMuted" className="mt-[var(--spacing-md)] block">
        {t("progressSummary.sendTo")}
      </AppText>
      {coaches.length === 1 ? (
        <AppText variant="body" className="block font-medium!" data-testid="ps-send-coach">
          {coaches[0].name}
        </AppText>
      ) : (
        // [원본] role="radiogroup" — 안에 라디오가 없고 이름도 없었다(P4U-10). 칩은 aria-pressed 토글 버튼이다.
        <fieldset
          className="m-0 mt-[2px] flex min-w-0 flex-wrap gap-[var(--spacing-sm)] border-0 p-0"
          aria-label={t("progressSummary.sendTo")}
        >
          {coaches.map((c) => (
            <QuietChip
              key={c.id}
              label={c.name}
              active={c.id === trainerId}
              onPress={() => setTrainerId(c.id)}
              testId="ps-send-coach"
            />
          ))}
        </fieldset>
      )}

      <AppText
        variant="caption"
        color="textMuted"
        className="mt-[var(--spacing-md)] block"
        data-testid="ps-send-includes"
      >
        {sections.length
          ? t("progressSummary.sendIncludes", { list: sections.map((s) => t(SECTION_KEY[s])).join(" · ") })
          : t("progressSummary.sendIncludesNone")}
      </AppText>
      {sections.includes("bodyweight") ? (
        <AppText variant="caption" color="warning" className="block">
          {t("progressSummary.bodyweightWarn")}
        </AppText>
      ) : null}
      {tooLarge ? (
        <AppText
          variant="caption"
          color="danger"
          className="mt-[var(--spacing-xs)] block"
          data-testid="ps-send-toolarge"
        >
          {t("progressSummary.tooLarge")}
        </AppText>
      ) : !rangeOk ? (
        <AppText variant="caption" color="danger" className="mt-[var(--spacing-xs)] block">
          {t("progressSummary.rangeInvalid")}
        </AppText>
      ) : null}
      {failed ? (
        <AppText
          variant="caption"
          color="danger"
          className="mt-[var(--spacing-xs)] block"
          data-testid="ps-send-failed"
        >
          {t("progressSummary.notSent", { reason: t(REASON_KEY[failed]) })}
        </AppText>
      ) : null}

      <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
        <Button title={t("common.cancel")} variant="secondary" onPress={onClose} />
        <Button
          title={busy ? t("progressSummary.sending") : t("progressSummary.sendConfirm")}
          loading={busy}
          disabled={busy || tooLarge || !rangeOk || !trainerId}
          onPress={() => void send()}
          testId="ps-send-confirm"
        />
      </div>
    </Overlay>
  );
}
