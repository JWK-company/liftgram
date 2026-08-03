"use client";
// @plm SRS-048  코칭 — app의 features/coaching/CoachingScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 한 화면에 두 얼굴이 있다: **내 코치**(회원 시점)와 **담당 회원**(트레이너 시점).
// 같은 사람이 양쪽일 수 있으므로 목록을 나눠 놓는다 — 섞으면 누가 누구를 보는지 헷갈린다.
//
// ── 여기 없는 것 ────────────────────────────────────────────────────────────
// "이 회원은 하체가 부족합니다" 같은 말은 없다. 서버가 주는 것은 **사실 집계뿐**이고
// 판단은 트레이너가 한다(ADR-028). 리포트 아래 고지가 그 말을 한다.
//
// ── 트레이너 표시는 자격 보증이 아니다 ──────────────────────────────────────
// 스스로 켠 표시일 뿐이라 화면 맨 위에 면책을 상시 띄운다. 지우면 안 되는 문장이다.
//
// ── 해지는 언제나 열려 있다 ─────────────────────────────────────────────────
// 상태와 무관하게 해지 버튼을 둔다. 회원이 언제든 닫을 수 없으면 그건 동의가 아니다.
// ─────────────────────────────────────────────────────────────────────────────
import type { Grant, Peer, Routine, RoutineExercise, MemberReport } from "@app/contracts";
import { GrantStatus, Side } from "@app/contracts";
import { formatWeight, muscleLabel, type MuscleGroup, type WeightUnit } from "@app/core";
import { useCallback, useEffect, useState } from "react";
import { t, type TransKey } from "@/lib/i18n";
import { coachingClient } from "@/lib/coachingClient";
import { useAuth } from "../AuthProvider";
import { useWeightUnit } from "../feed/useWeightUnit";
import { rxSummary } from "../routines/PrescriptionRows";
import { Panel } from "./Panel";
import { PrescriptionEditor, toDomainRows } from "./PrescriptionEditor";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/inputs";
import { AppText, Card, EmptyState, SectionHeader } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";
import { useToast } from "../Toast";

const STATUS_KEY: Record<GrantStatus, TransKey> = {
  [GrantStatus.UNSPECIFIED]: "coaching.status.pending",
  [GrantStatus.PENDING]: "coaching.status.pending",
  [GrantStatus.ACTIVE]: "coaching.status.active",
  [GrantStatus.REVOKED]: "coaching.status.revoked",
};

export default function CoachingClient() {
  const { user, loading: authLoading } = useAuth();
  const unit = useWeightUnit() as WeightUnit;
  const toast = useToast();

  const [grants, setGrants] = useState<Grant[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Peer[] | null>(null);

  // 겹쳐 뜨는 판: 리포트 · 루틴 처방 · 이력. 한 번에 하나만 연다.
  const [report, setReport] = useState<{ peer: Peer; data: MemberReport } | null>(null);
  const [routinesFor, setRoutinesFor] = useState<Peer | null>(null);
  const [history, setHistory] = useState<{ grant: Grant; lines: string[] } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setGrants((await coachingClient().listGrants({})).grants);
    } catch {
      toast(t("common.error"), "error");
    }
  }, [user, toast]);

  useEffect(() => {
    // 신원이 정해지기 전에 부르면 서버가 401로 되받는다 — 확정된 뒤에 읽는다.
    if (!authLoading) void load();
  }, [authLoading, load]);

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    try {
      setResults((await coachingClient().searchTrainers({ query: query.trim() })).peers);
    } catch {
      toast(t("common.error"), "error");
    }
  }

  async function openReport(g: Grant) {
    if (!g.peer) return;
    try {
      const res = await coachingClient().getMemberReport({ memberId: g.peer.id });
      if (res.report) setReport({ peer: g.peer, data: res.report });
    } catch {
      toast(t("common.error"), "error");
    }
  }

  async function openHistory(g: Grant) {
    try {
      const res = await coachingClient().listAudit({ grantId: g.id });
      const lines = res.entries.map((e) => {
        const when = new Date(Number(e.createdAt)).toLocaleString();
        return `${when} · ${t(`coaching.action.${e.action}` as TransKey)}`;
      });
      setHistory({ grant: g, lines });
    } catch {
      toast(t("common.error"), "error");
    }
  }

  if (authLoading) {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center py-[var(--spacing-xl)]">
          <span
            role="status"
            className="h-5 w-5 animate-spin rounded-full border-2 border-(--color-brand) border-t-transparent"
          />
        </div>
      </Shell>
    );
  }

  // 코칭은 계정에 묶인다 — 로컬 기록만으로는 관계를 맺을 수 없다.
  if (!user) {
    return (
      <Shell>
        <div data-testid="coaching-login-required">
          <EmptyState
            icon="lock-closed-outline"
            title={t("coaching.loginRequiredTitle")}
            message={t("coaching.loginRequiredMessage")}
            action={
              <a href="/account">
                <Button title={t("auth.login")} variant="secondary" fullWidth={false} />
              </a>
            }
          />
        </div>
      </Shell>
    );
  }

  // 해지된 관계는 목록에서 내린다 — 다시 요청하면 되살아난다.
  const live = grants.filter((g) => g.status !== GrantStatus.REVOKED);
  const asMember = live.filter((g) => g.roleOfMe === Side.MEMBER);
  const asTrainer = live.filter((g) => g.roleOfMe === Side.TRAINER);
  const alreadyLinked = new Set(live.map((g) => g.peer?.id).filter(Boolean));

  return (
    <Shell>
      <div className="flex-1 p-[var(--spacing-lg)]" data-testid="coaching-body">
        {/* 자격 보증이 아니라는 고지 — 상시 노출한다. */}
        <AppText variant="caption" color="textFaint" className="mb-[var(--spacing-md)] block">
          {t("experience.trainerDisclaimer")}
        </AppText>

        <SectionHeader title={t("coaching.myCoaches")} />
        {asMember.length === 0 ? (
          <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-md)] block">
            {t("coaching.myCoachesEmpty")}
          </AppText>
        ) : (
          <div data-testid="coaching-coaches">
            {asMember.map((g) => (
              <GrantRow
                key={g.id}
                grant={g}
                busy={busy}
                onAccept={() => act(() => coachingClient().acceptGrant({ grantId: g.id }))}
                onRevoke={() => act(() => coachingClient().revokeGrant({ grantId: g.id }))}
                onHistory={() => openHistory(g)}
              />
            ))}
          </div>
        )}

        <SectionHeader title={t("coaching.myMembers")} />
        {asTrainer.length === 0 ? (
          <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-md)] block">
            {t("coaching.myMembersEmpty")}
          </AppText>
        ) : (
          <div data-testid="coaching-members">
            {asTrainer.map((g) => (
              <GrantRow
                key={g.id}
                grant={g}
                busy={busy}
                onAccept={() => act(() => coachingClient().acceptGrant({ grantId: g.id }))}
                onRevoke={() => act(() => coachingClient().revokeGrant({ grantId: g.id }))}
                onHistory={() => openHistory(g)}
                // 리포트·루틴은 **연결된 뒤에만** 열린다. 서버도 같은 판단을 한다.
                onReport={g.status === GrantStatus.ACTIVE ? () => openReport(g) : undefined}
                onRoutines={
                  g.status === GrantStatus.ACTIVE && g.peer ? () => setRoutinesFor(g.peer ?? null) : undefined
                }
              />
            ))}
          </div>
        )}

        <SectionHeader title={t("coaching.findTrainer")} />
        <div className="mb-[var(--spacing-sm)] flex items-start gap-[var(--spacing-sm)]">
          <div className="flex-1">
            <TextField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder={t("coaching.searchPlaceholder")}
              testId="coaching-query"
            />
          </div>
          <Button
            title={t("coaching.searchButton")}
            size="sm"
            fullWidth={false}
            onPress={search}
            testId="coaching-search"
          />
        </div>

        {results?.length === 0 ? (
          <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-md)] block">
            {t("coaching.searchEmpty")}
          </AppText>
        ) : null}
        {results && results.length > 0 ? (
          <div data-testid="coaching-results">
            {results.map((p) => (
              <Card key={p.id} className="mb-[var(--spacing-sm)] flex items-center gap-[var(--spacing-sm)]">
                <Avatar name={p.displayName} url={p.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <AppText variant="body" className="block truncate font-medium!">
                    {p.displayName || t("discover.unnamed")}
                  </AppText>
                  {p.experienceLevel ? (
                    <AppText variant="caption" color="textMuted">
                      {t(`experience.level.${p.experienceLevel}` as TransKey)}
                    </AppText>
                  ) : null}
                </div>
                <Button
                  title={alreadyLinked.has(p.id) ? t("coaching.requested") : t("coaching.requestButton")}
                  size="sm"
                  fullWidth={false}
                  disabled={busy || alreadyLinked.has(p.id)}
                  onPress={() => act(() => coachingClient().requestCoaching({ trainerId: p.id }))}
                  testId="coaching-request"
                />
              </Card>
            ))}
          </div>
        ) : null}
      </div>

      {report ? (
        <ReportDialog report={report.data} peer={report.peer} unit={unit} onClose={() => setReport(null)} />
      ) : null}

      {routinesFor ? <MemberRoutinesDialog peer={routinesFor} onClose={() => setRoutinesFor(null)} /> : null}

      {history ? (
        <Panel
          testId="coaching-history"
          title={t("coaching.historyTitle")}
          onClose={() => setHistory(null)}
          actions={<Button title={t("common.ok")} variant="secondary" onPress={() => setHistory(null)} />}
        >
          {history.lines.length === 0 ? (
            <AppText variant="caption" color="textMuted">
              {t("coaching.historyEmpty")}
            </AppText>
          ) : (
            history.lines.slice(0, 30).map((line) => (
              <AppText key={line} variant="caption" color="textMuted" className="block py-[2px]">
                {line}
              </AppText>
            ))
          )}
        </Panel>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("coaching.title")}
        back={
          <a href="/profile" aria-label={t("nav.profile")} data-testid="coaching-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />
      {children}
    </div>
  );
}

/** 관계 한 줄. 수락은 **반대편에게만** 보인다 — 눌러도 서버가 막을 버튼은 그리지 않는다. */
function GrantRow({
  grant,
  busy,
  onAccept,
  onRevoke,
  onReport,
  onRoutines,
  onHistory,
}: {
  grant: Grant;
  busy: boolean;
  onAccept: () => void;
  onRevoke: () => void;
  onReport?: () => void;
  onRoutines?: () => void;
  onHistory: () => void;
}) {
  const canAccept = grant.status === GrantStatus.PENDING && grant.requestedBy !== grant.roleOfMe;
  return (
    <Card
      className="mb-[var(--spacing-sm)] flex items-center gap-[var(--spacing-xs)]"
      data-testid="coaching-grant"
    >
      <Avatar name={grant.peer?.displayName} url={grant.peer?.avatarUrl} size={36} />
      <div className="min-w-0 flex-1">
        <AppText variant="body" className="block truncate font-medium!">
          {grant.peer?.displayName || "?"}
        </AppText>
        {/* 상태를 누르면 이력이 열린다 — 양쪽 다 읽을 수 있다. */}
        <button type="button" onClick={onHistory} data-testid="coaching-history-link">
          <AppText variant="caption" color={grant.status === GrantStatus.ACTIVE ? "primary" : "textMuted"}>
            {`${t(STATUS_KEY[grant.status])} · ${t("coaching.historyLink")}`}
          </AppText>
        </button>
      </div>
      {onRoutines ? (
        <Button
          title={t("coaching.routinesButton")}
          size="sm"
          variant="secondary"
          fullWidth={false}
          onPress={onRoutines}
          testId="coaching-routines"
        />
      ) : null}
      {onReport ? (
        <Button
          title={t("coaching.reportButton")}
          size="sm"
          variant="secondary"
          fullWidth={false}
          onPress={onReport}
          testId="coaching-report"
        />
      ) : null}
      {canAccept ? (
        <Button
          title={t("coaching.acceptButton")}
          size="sm"
          fullWidth={false}
          disabled={busy}
          onPress={onAccept}
          testId="coaching-accept"
        />
      ) : null}
      <Button
        title={t("coaching.revokeButton")}
        size="sm"
        variant="ghost"
        fullWidth={false}
        disabled={busy}
        onPress={onRevoke}
        testId="coaching-revoke"
      />
    </Card>
  );
}

/** 리포트 — **사실만**. 맨 아래 고지가 "판단은 코치가 한다"고 말한다(ADR-028). */
function ReportDialog({
  report,
  peer,
  unit,
  onClose,
}: {
  report: MemberReport;
  peer: Peer;
  unit: WeightUnit;
  onClose: () => void;
}) {
  return (
    <Panel
      testId="coaching-report-view"
      title={t("coaching.reportTitle", { name: peer.displayName || "?" })}
      onClose={onClose}
      actions={<Button title={t("common.ok")} variant="secondary" onPress={onClose} />}
    >
      <AppText variant="caption" color="textMuted" className="block">
        {t("coaching.reportRange", { weeks: report.weeks })}
      </AppText>

      <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
        <Stat
          label={t("coaching.statSessions")}
          value={String(report.sessionsCount)}
          testId="report-sessions"
        />
        <Stat
          label={t("coaching.statPerWeek")}
          value={String(report.sessionsPerWeek)}
          testId="report-per-week"
        />
        <Stat
          label={t("coaching.statVolume")}
          value={formatWeight(report.totalVolumeKg, unit)}
          testId="report-volume"
        />
      </div>

      {report.muscleVolume.length > 0 ? (
        <>
          <AppText variant="label" color="textMuted" className="mt-[var(--spacing-md)] block">
            {t("coaching.muscleVolumeTitle")}
          </AppText>
          <div data-testid="report-muscles">
            {report.muscleVolume.slice(0, 6).map((m) => (
              <RowKV key={m.muscle} k={muscleLabelSafe(m.muscle)} v={formatWeight(m.volumeKg, unit)} />
            ))}
          </div>
        </>
      ) : null}

      {report.recentSessions.length > 0 ? (
        <>
          <AppText variant="label" color="textMuted" className="mt-[var(--spacing-md)] block">
            {t("coaching.recentSessionsTitle")}
          </AppText>
          {report.recentSessions.map((s) => (
            <RowKV
              // 같은 날 두 번 운동할 수 있어 날짜로는 겹친다 — 시작 시각(ms)이 세션의 정체다.
              key={String(s.startedAt)}
              k={`${new Date(Number(s.startedAt)).toLocaleDateString()} ${s.name}`.trim()}
              v={formatWeight(s.totalVolumeKg, unit)}
            />
          ))}
        </>
      ) : null}

      <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-sm)] block">
        {t("coaching.reportFactOnly")}
      </AppText>
    </Panel>
  );
}

/** 회원 루틴 처방 — 종목을 누르면 편집기가 열린다. */
function MemberRoutinesDialog({ peer, onClose }: { peer: Peer; onClose: () => void }) {
  const toast = useToast();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [editing, setEditing] = useState<{ routine: Routine; block: RoutineExercise } | null>(null);

  const load = useCallback(async () => {
    try {
      setRoutines((await coachingClient().listMemberRoutines({ memberId: peer.id })).routines);
    } catch {
      toast(t("common.error"), "error");
      setRoutines([]);
    }
  }, [peer.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (editing) {
    return (
      <PrescriptionEditor
        peer={peer}
        routine={editing.routine}
        block={editing.block}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  return (
    <Panel
      testId="coaching-routines-view"
      title={t("coaching.routinesTitle", { name: peer.displayName || "?" })}
      onClose={onClose}
      actions={<Button title={t("common.ok")} variant="secondary" onPress={onClose} />}
    >
      <AppText variant="caption" color="textMuted" className="block">
        {t("coaching.routinesHint")}
      </AppText>

      {routines === null ? (
        <div className="flex justify-center py-[var(--spacing-lg)]">
          <span
            role="status"
            className="h-5 w-5 animate-spin rounded-full border-2 border-(--color-brand) border-t-transparent"
          />
        </div>
      ) : routines.length === 0 ? (
        <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-md)] block">
          {t("coaching.routinesEmpty")}
        </AppText>
      ) : (
        <div className="mt-[var(--spacing-md)]" data-testid="member-routines">
          {routines.map((r) => (
            <div key={r.id} className="mb-[var(--spacing-md)]">
              <AppText variant="body" className="block font-medium!">
                {r.name}
              </AppText>
              {r.exercises.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  data-testid="member-exercise"
                  onClick={() => setEditing({ routine: r, block: b })}
                  className="mt-[var(--spacing-xs)] flex w-full items-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[var(--spacing-sm)] text-left"
                >
                  <AppText variant="caption" className="min-w-0 flex-1 truncate">
                    {b.exerciseName || b.exerciseId}
                  </AppText>
                  {/* 처방 요약은 편집기와 **같은 표기**를 쓴다(웜업 △ 탑 ● …). */}
                  <AppText variant="label" color={b.prescription.length > 0 ? "primary" : "textFaint"}>
                    {rxSummary(toDomainRows(b.prescription)) ?? t("coaching.rxNone")}
                  </AppText>
                  <Icon name="chevron-forward" size={14} color="var(--color-ink3)" />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex-1 rounded-[var(--radius-md)] bg-(--color-surface-alt) py-[var(--spacing-sm)] text-center">
      <AppText variant="heading" className="block" data-testid={testId}>
        {value}
      </AppText>
      <AppText variant="label" color="textMuted" className="block">
        {label}
      </AppText>
    </div>
  );
}

function RowKV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-[var(--spacing-sm)] py-[3px]">
      <AppText variant="caption" color="textMuted" className="min-w-0 flex-1 truncate">
        {k}
      </AppText>
      <AppText variant="caption" className="font-medium!">
        {v}
      </AppText>
    </div>
  );
}

/** 서버가 준 근육 이름이 우리 목록 밖일 수 있다 — 그럴 땐 원문을 그대로 보여 준다(무해). */
function muscleLabelSafe(muscle: string): string {
  try {
    return muscleLabel(muscle as MuscleGroup, "ko");
  } catch {
    return muscle;
  }
}
