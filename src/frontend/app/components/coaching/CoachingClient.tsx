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
//
// ── 코칭 v2 연결(SPEC-050 P1b) ──────────────────────────────────────────────
//   코치면 맨 위 「초대 코드」 카드(InviteCard) · 누구나 「코드로 연결」(GetInvite → 코치 카드 + 범위 시트 → AcceptInvite)
//   회원 쪽 요청·수락은 범위 시트(CoachingScopeSheet) — 코치가 수락할 때는 범위를 묻지 않는다(서버도 무시)
//   GrantRow: 줄 버튼은 상대가 요청했을 때 「수락」만 · 나머지(기록 요약·루틴·범위 바꾸기·이력·연결 끊기)는 ⋯ 시트
//   연결 끊기는 확인창을 거친다. 서버의 한국어 거절 문구(「이미 코치가 있어요…」 등)는 errorText 로 그대로.
//   옛 판(줄마다 루틴·리포트·해지 버튼 · 상태 글자를 누르면 이력)은 git 3b561a2 의 이 파일.
// ─────────────────────────────────────────────────────────────────────────────
import { errorText } from "@/lib/errorText";
import type { Grant, MemberDigest, Peer, Routine, RoutineExercise } from "@app/contracts";
import { GrantStatus, Side } from "@app/contracts";
import type { WeightUnit } from "@app/core";
import { Code, ConnectError } from "@connectrpc/connect";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { orderByRest, REST_ALERT_DAYS, restDays, weekStartMs } from "@app/core/domain/coachDigest"; // 담당 회원 점검(P4)
import { lang, t, type TransKey } from "@/lib/i18n";
import { useDayKey } from "@/lib/useDayKey";
import { coachingClient } from "@/lib/coachingClient";
import { scopeOf, type ScopeValue } from "@/lib/coaching";
import { useAuth } from "../AuthProvider";
import { useWeightUnit } from "../feed/useWeightUnit";
import { rxSummary } from "../routines/PrescriptionRows";
import { Panel } from "./Panel";
import { PrescriptionEditor, toDomainRows } from "./PrescriptionEditor";
import { CoachBadge, CoachCard } from "./CoachBits";
import { CoachingScopeSheet, type ScopeSheetMode } from "./CoachingScopeSheet";
import { InviteCard } from "./InviteCard";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { ConfirmDialog, type SheetOption } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/inputs";
import { MoreMenu } from "../ui/MoreMenu";
import { AppText, Card, EmptyState, SectionHeader } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";
import { useToast } from "../Toast";
import { LogoSpinner } from "../ui/LogoSpinner";
import { MemberReportDialog } from "../summary/MemberReportDialog"; // 원본 레코드 + core 계산(ADR-040) @plm SRS-079 SRS-080

const STATUS_KEY: Record<GrantStatus, TransKey> = {
  [GrantStatus.UNSPECIFIED]: "coaching.status.pending",
  [GrantStatus.PENDING]: "coaching.status.pending",
  [GrantStatus.ACTIVE]: "coaching.status.active",
  [GrantStatus.REVOKED]: "coaching.status.revoked",
};

/** 범위 시트 한 번 — 무엇을 하려고 열었는가(요청·수락·코드 연결·범위 바꾸기). */
type ScopeTask =
  | { mode: "request"; trainer: Peer }
  | { mode: "accept"; grant: Grant }
  | { mode: "join"; trainer: Peer; code: string }
  | { mode: "change"; grant: Grant };

export default function CoachingClient() {
  const { user, loading: authLoading } = useAuth();
  const unit = useWeightUnit() as WeightUnit;
  const toast = useToast();

  // [원본] const [grants, setGrants] = useState<Grant[]>([]);
  // [개선] null = 아직 읽는 중 — 빈 목록 문구가 잠깐 비쳤다 바뀌지 않게(로드 뒤 판단)
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Peer[] | null>(null);

  // 겹쳐 뜨는 판: 리포트 · 루틴 처방 · 이력. 한 번에 하나만 연다.
  const [reportFor, setReportFor] = useState<Peer | null>(null); // 새 리포트(GetMemberRecords) @plm SRS-079
  const [routinesFor, setRoutinesFor] = useState<Peer | null>(null);
  const [history, setHistory] = useState<{ grant: Grant; lines: string[] } | null>(null);

  // 코칭 v2(SPEC-050) — 범위 시트 · 연결 끊기 확인 · 코드로 연결
  const [task, setTask] = useState<ScopeTask | null>(null);
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Grant | null>(null);
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setGrants((await coachingClient().listGrants({})).grants);
    } catch {
      setGrants((prev) => prev ?? []);
      toast(t("common.error"), "error");
    }
  }, [user, toast]);

  useEffect(() => {
    // 신원이 정해지기 전에 부르면 서버가 401로 되받는다 — 확정된 뒤에 읽는다.
    if (!authLoading) void load();
  }, [authLoading, load]);

  // 담당 회원 점검(SPEC-050 P4) — 활성 회원이 있을 때만 묻는다. null = 읽는 중(줄 순서가 바뀌므로 다 읽은 뒤에 그린다)
  //   실패하면 빈 표 — 줄은 원래 순서로, 점검 줄 없이. 메모리만(회원 데이터는 기기에 남기지 않는다).
  const [digest, setDigest] = useState<Map<string, MemberDigest> | null>(null);
  // 점검이 3초 넘게 걸리면 원래 순서로 먼저 그린다(리뷰 중간-2). 한 번 그린 뒤에는 점검이 와도 줄을 다시 줄 세우지 않는다
  // (줄이 뛰지 않게) — 점검 줄만 채운다. 이 화면을 다시 열면 다시 기다린다.
  const [digestLate, setDigestLate] = useState(false);
  const digestGen = useRef(0);
  // [원본] activeMemberKey 를 grants 와 함께 deps 에 — grants 가 새로 올 때마다(같은 회원이어도) 다시 물었다
  // [개선] deps = 활성 회원 열쇠(null = 관계 읽는 중) + 날짜 열쇠(자정을 넘기면 「이번 주」를 다시 센다 · 리뷰 낮음)
  const activeMemberKey =
    grants === null
      ? null
      : grants
          .filter((g) => g.roleOfMe === Side.TRAINER && g.status === GrantStatus.ACTIVE)
          .map((g) => g.peer?.id ?? "")
          .join(",");
  const dayKey = useDayKey();
  // biome-ignore lint/correctness/useExhaustiveDependencies: dayKey — 날이 바뀌면 이번 주 시작이 달라져 다시 묻는다
  useEffect(() => {
    if (activeMemberKey === null) return;
    const gen = ++digestGen.current;
    if (!activeMemberKey) {
      setDigest(new Map());
      return;
    }
    const late = setTimeout(() => {
      if (gen === digestGen.current) setDigestLate(true);
    }, 3000);
    coachingClient()
      .listMemberDigest({ weekStart: BigInt(weekStartMs()) })
      .then((r) => {
        if (gen === digestGen.current) setDigest(new Map(r.members.map((m) => [m.memberId, m])));
      })
      .catch(() => {
        if (gen === digestGen.current) setDigest(new Map());
      })
      .finally(() => clearTimeout(late));
    return () => clearTimeout(late);
  }, [activeMemberKey, dayKey]);

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      toast(errorText(e), "error");
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
    // [개선] 원본 레코드를 받아 이 기기의 core 가 계산한다(회원 요약과 같은 숫자) — 결과는 판 상태에만(S-20)
    setReportFor(g.peer);
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

  function openTask(next: ScopeTask) {
    setTaskError(null);
    setTask(next);
  }

  /** 범위 시트의 주 버튼 — 성공하면 닫고 목록을 다시 읽는다. 거절 문구는 시트 안에 남긴다. */
  async function confirmTask(scope: ScopeValue, note: string) {
    if (!task || taskBusy) return;
    setTaskBusy(true);
    setTaskError(null);
    try {
      const c = coachingClient();
      switch (task.mode) {
        case "request":
          await c.requestCoaching({ trainerId: task.trainer.id, scope, note });
          toast(t("coaching.requestSent"));
          break;
        case "accept":
          await c.acceptGrant({ grantId: task.grant.id, scope });
          toast(t("coaching.connected"));
          break;
        case "join":
          await c.acceptInvite({ code: task.code, scope });
          setCode("");
          toast(t("coaching.connected"));
          break;
        case "change":
          await c.updateScope({ grantId: task.grant.id, scope });
          toast(t("coaching.scopeSaved"));
          break;
      }
      setTask(null);
      await load();
    } catch (e) {
      setTaskError(errorText(e));
    } finally {
      setTaskBusy(false);
    }
  }

  /** 코드로 연결 — 코치 카드부터 본다. 이미 코치가 있으면 서버가 범위 시트 전에 거절한다. */
  async function checkCode() {
    const raw = code.trim();
    if (!raw || codeBusy) return;
    setCodeBusy(true);
    setCodeError(null);
    try {
      const res = await coachingClient().getInvite({ code: raw });
      if (!res.trainer) throw new Error(t("common.errNotFound"));
      openTask({ mode: "join", trainer: res.trainer, code: raw });
    } catch (e) {
      setCodeError(errorText(e));
    } finally {
      setCodeBusy(false);
    }
  }

  if (authLoading) {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center py-[var(--spacing-xl)]">
          <span role="status" className="inline-flex">
            <LogoSpinner size={32} label="불러오는 중" />
          </span>
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
  const live = (grants ?? []).filter((g) => g.status !== GrantStatus.REVOKED);
  const asMember = live.filter((g) => g.roleOfMe === Side.MEMBER);
  // [원본] const asTrainer = live.filter((g) => g.roleOfMe === Side.TRAINER);
  // [개선] 3일 이상 쉰 회원이 위로(오래 쉰 순 · 나머지는 원래 순서 — SPEC-050 P4)
  const digestLike = new Map(
    [...(digest ?? new Map<string, MemberDigest>()).values()].map((d) => [
      d.memberId,
      { memberId: d.memberId, logView: d.logView, lastWorkoutAt: Number(d.lastWorkoutAt) },
    ]),
  );
  const trainerRows = live.filter((g) => g.roleOfMe === Side.TRAINER);
  // 점검보다 먼저 그렸으면(3초 넘음) 원래 순서 그대로
  const asTrainer = digestLate ? trainerRows : orderByRest(trainerRows, (g) => g.peer?.id ?? "", digestLike);
  const alreadyLinked = new Set(live.map((g) => g.peer?.id).filter(Boolean));

  /** ⋯ 시트 선택지 — 역할·상태마다 다르다. 서버가 막을 일은 아예 넣지 않는다. */
  function menuFor(g: Grant): SheetOption[] {
    const active = g.status === GrantStatus.ACTIVE;
    const opts: SheetOption[] = [];
    if (g.roleOfMe === Side.TRAINER && active && g.peer) {
      // 리포트·루틴은 **연결된 뒤에만** 열린다. 서버도 같은 판단을 한다.
      // [원본] (다음 단계 P2 에서 줄 누름 → 회원 화면 /coaching/m/[memberId] 로 옮긴다)
      // [개선] P2 — 줄(아바타·이름)을 누르면 회원 화면. 이 두 판은 빠른 보기로 남긴다(같은 부품 MemberReportBody·MemberRoutinesBody)
      const peer = g.peer;
      opts.push({
        label: t("coaching.reportMenu"),
        testId: "coaching-report",
        onPress: () => void openReport(g),
      });
      opts.push({
        label: t("coaching.routinesMenu"),
        testId: "coaching-routines",
        onPress: () => setRoutinesFor(peer),
      });
    }
    if (g.roleOfMe === Side.MEMBER && active) {
      opts.push({
        label: t("coaching.scopeMenu"),
        testId: "coaching-scope",
        onPress: () => openTask({ mode: "change", grant: g }),
      });
    }
    opts.push({
      label: t("coaching.historyMenu"),
      testId: "coaching-history-link",
      onPress: () => void openHistory(g),
    });
    opts.push({
      label: active ? t("coaching.revokeMenu") : t("coaching.cancelRequestMenu"),
      testId: "coaching-revoke",
      destructive: true,
      onPress: () => setRevoking(g),
    });
    return opts;
  }

  function accept(g: Grant) {
    // 회원이 수락할 때만 범위를 고른다 — 코치가 수락하면 회원이 요청 때 고른 범위 그대로다.
    if (g.roleOfMe === Side.MEMBER) openTask({ mode: "accept", grant: g });
    else void act(() => coachingClient().acceptGrant({ grantId: g.id }));
  }

  const loadingGrants = grants === null;
  const loadingMembers =
    loadingGrants ||
    (asTrainer.some((g) => g.status === GrantStatus.ACTIVE) && digest === null && !digestLate);

  return (
    <Shell>
      <div className="flex-1 p-[var(--spacing-lg)]" data-testid="coaching-body">
        {/* 자격 보증이 아니라는 고지 — 상시 노출한다. */}
        <AppText variant="caption" color="textFaint" className="mb-[var(--spacing-md)] block">
          {t("experience.trainerDisclaimer")}
        </AppText>

        {/* 코치(코칭 의향을 켠 사람)만 — 회원이 코드·링크로 바로 연결한다(SPEC-050) */}
        {user.trainerIntent ? <InviteCard /> : null}

        <SectionHeader title={t("coaching.myCoaches")} />
        {loadingGrants ? (
          <GrantsLoading />
        ) : asMember.length === 0 ? (
          <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-md)] block">
            {t("coaching.myCoachesEmpty")}
          </AppText>
        ) : (
          <div data-testid="coaching-coaches">
            {asMember.map((g) => (
              <GrantRow key={g.id} grant={g} busy={busy} onAccept={() => accept(g)} options={menuFor(g)} />
            ))}
          </div>
        )}

        {/* 코드로 연결 — 코치에게 받은 8자 코드(4-4 · 하이픈·공백·소문자는 서버가 정리) */}
        <SectionHeader title={t("coaching.join.section")} />
        <div className="flex items-start gap-[var(--spacing-sm)]">
          <div className="min-w-0 flex-1">
            <TextField
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && void checkCode()}
              placeholder={t("coaching.join.placeholder")}
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={20}
              testId="coaching-code-input"
            />
          </div>
          <Button
            title={t("coaching.join.check")}
            variant="secondary"
            fullWidth={false}
            loading={codeBusy}
            disabled={!code.trim()}
            onPress={() => void checkCode()}
            testId="coaching-code-check"
            className="shrink-0"
          />
        </div>
        {codeError ? (
          <AppText
            variant="caption"
            color="danger"
            className="-mt-[var(--spacing-xs)] mb-[var(--spacing-md)] block"
            data-testid="coaching-code-error"
          >
            {codeError}
          </AppText>
        ) : null}

        <SectionHeader title={t("coaching.myMembers")} />
        {/* [원본] {loadingGrants ? ( — 점검을 다 읽은 뒤 그린다(순서가 바뀌어 줄이 뛰지 않게) */}
        {loadingMembers ? (
          <GrantsLoading />
        ) : asTrainer.length === 0 ? (
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
                onAccept={() => accept(g)}
                options={menuFor(g)}
                digest={g.status === GrantStatus.ACTIVE ? digest?.get(g.peer?.id ?? "") : undefined}
              />
            ))}
          </div>
        )}

        <SectionHeader title={t("coaching.findTrainer")} />
        <div className="mb-[var(--spacing-sm)] flex items-start gap-[var(--spacing-sm)]">
          <div className="min-w-0 flex-1">
            <TextField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder={t("coaching.searchPlaceholder")}
              testId="coaching-query"
            />
          </div>
          {/* [원본] size="sm" · 빨강 채움 — 이 화면의 빨강은 「코드 만들기」·시트의 주 버튼 몫(SPEC-050) · 36px 은 44px 미달 */}
          <Button
            title={t("coaching.searchButton")}
            variant="secondary"
            fullWidth={false}
            onPress={search}
            testId="coaching-search"
            className="shrink-0"
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
                {/* [원본] onPress={() => act(() => coachingClient().requestCoaching({ trainerId: p.id }))} · size="sm"
                    [개선] 범위 시트(+한 줄 메시지)를 거쳐 요청한다(SPEC-050) */}
                <Button
                  title={alreadyLinked.has(p.id) ? t("coaching.requested") : t("coaching.requestButton")}
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  disabled={busy || alreadyLinked.has(p.id)}
                  onPress={() => openTask({ mode: "request", trainer: p })}
                  testId="coaching-request"
                  className="min-h-11 shrink-0"
                />
              </Card>
            ))}
          </div>
        ) : null}
      </div>

      {reportFor ? (
        <MemberReportDialog peer={reportFor} unit={unit} onClose={() => setReportFor(null)} />
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

      {task ? (
        <CoachingScopeSheet
          mode={task.mode as ScopeSheetMode}
          initial={task.mode === "accept" || task.mode === "change" ? scopeOf(task.grant.scope) : undefined}
          header={<TaskHeader task={task} />}
          busy={taskBusy}
          error={taskError}
          onConfirm={(scope, note) => void confirmTask(scope, note)}
          onClose={() => setTask(null)}
        />
      ) : null}

      {revoking ? (
        <ConfirmDialog
          testId="coaching-revoke-confirm"
          title={t("coaching.revokeTitle")}
          message={
            revoking.roleOfMe === Side.MEMBER
              ? t("coaching.revokeMessageMember")
              : t("coaching.revokeMessageTrainer")
          }
          confirmLabel={t("coaching.revokeConfirm")}
          destructive
          onCancel={() => setRevoking(null)}
          onConfirm={() => {
            const g = revoking;
            setRevoking(null);
            void act(() => coachingClient().revokeGrant({ grantId: g.id }));
          }}
        />
      ) : null}
    </Shell>
  );
}

/** 범위 시트 머리 — 코치 카드(요청·코드 연결) 또는 상대 이름(수락·바꾸기). */
function TaskHeader({ task }: { task: ScopeTask }) {
  const peer = task.mode === "request" || task.mode === "join" ? task.trainer : task.grant.peer;
  if (!peer) return null;
  return (
    <CoachCard
      name={peer.displayName}
      avatarUrl={peer.avatarUrl}
      bio={peer.coachBio}
      tags={peer.coachTags}
      testId="scope-coach-card"
    />
  );
}

function GrantsLoading() {
  return (
    <div className="flex justify-center py-[var(--spacing-md)]">
      <span role="status" className="inline-flex">
        <LogoSpinner size={24} label={t("common.loading")} />
      </span>
    </div>
  );
}

/** 줄의 아바타·글자 칸 — 갈 곳이 있으면 링크(44px 이상), 없으면 그냥 칸. */
function RowMain({
  href,
  label,
  describedBy,
  children,
}: {
  href: string | null;
  label: string;
  /** 이름 대신 읽힐 label 이 상태(「코칭 중」 등)를 덮지 않게 — 상태 글자의 id(코드 리뷰 L-5) */
  describedBy?: string;
  children: React.ReactNode;
}) {
  const cls = "flex min-w-0 flex-1 items-center gap-[var(--spacing-sm)]";
  if (!href) return <div className={cls}>{children}</div>;
  return (
    <a
      href={href}
      aria-label={label}
      aria-describedby={describedBy}
      data-testid="coaching-member-open"
      className={`${cls} min-h-11`}
    >
      {children}
    </a>
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

/**
 * 관계 한 줄. 수락은 **반대편에게만** 보인다 — 눌러도 서버가 막을 버튼은 그리지 않는다.
 * [원본] 줄 끝에 루틴·리포트·수락·해지 버튼이 나란히(360px 에서 이름이 밀렸다) · 상태 글자를 누르면 이력 — git 3b561a2
 * [개선] 줄 버튼은 「수락」 하나 · 나머지는 ⋯ 시트 · 활성 상태 글자 청록 · 상대가 남긴 한 줄 메시지(SPEC-050)
 */
function GrantRow({
  grant,
  busy,
  onAccept,
  options,
  digest,
}: {
  grant: Grant;
  busy: boolean;
  onAccept: () => void;
  options: SheetOption[];
  /** 담당 회원 점검(SPEC-050 P4) — 코치 쪽 활성 회원만 */
  digest?: MemberDigest;
}) {
  const canAccept = grant.status === GrantStatus.PENDING && grant.requestedBy !== grant.roleOfMe;
  const active = grant.status === GrantStatus.ACTIVE;
  const name = grant.peer?.displayName || "?";
  // 상대가 코치(내 코치 칸)면 이름 옆에 「코치」 배지
  const peerIsCoach = grant.roleOfMe === Side.MEMBER && !!grant.peer?.trainerIntent;
  const note = canAccept ? grant.requestNote.trim() : "";
  const memberHref =
    active && grant.roleOfMe === Side.TRAINER && grant.peer?.id
      ? `/coaching/m/${encodeURIComponent(grant.peer.id)}`
      : null;
  const statusId = useId();
  return (
    <Card
      className="mb-[var(--spacing-sm)] flex items-center gap-[var(--spacing-sm)] py-[var(--spacing-md)]! pr-[var(--spacing-xs)]!"
      data-testid="coaching-grant"
      data-status={active ? "active" : grant.status === GrantStatus.PENDING ? "pending" : "revoked"}
    >
      {/* [원본] 아바타·이름 칸은 누를 수 없었다(P1b 보류) — 코치 쪽 활성 회원이면 회원 화면으로(SPEC-050 P2).
          줄 전체를 링크로 감싸면 수락·⋯ 버튼이 링크 안에 들어가 그 둘은 밖에 둔다(REV-099 「링크 안의 버튼」). */}
      <RowMain href={memberHref} label={t("coaching.member.open", { name })} describedBy={statusId}>
        <Avatar name={grant.peer?.displayName} url={grant.peer?.avatarUrl} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-[var(--spacing-xs)]">
            <AppText variant="body" className="min-w-0 truncate font-medium!">
              {name}
            </AppText>
            {peerIsCoach ? <CoachBadge testId="coaching-coach-badge" /> : null}
          </div>
          <AppText
            variant="caption"
            color="textMuted"
            className={`block truncate ${active ? "font-semibold" : ""}`}
            style={active ? { color: "var(--color-coaching-ink)" } : undefined}
            data-testid="coaching-status"
            id={statusId}
          >
            {t(STATUS_KEY[grant.status])}
          </AppText>
          {digest ? <DigestLine d={digest} /> : null}
          {note ? (
            <AppText
              variant="caption"
              color="textMuted"
              className="block break-words"
              data-testid="coaching-note"
            >
              {t("coaching.requestNote", { note })}
            </AppText>
          ) : null}
        </div>
      </RowMain>
      {canAccept ? (
        <Button
          title={t("coaching.acceptButton")}
          size="sm"
          variant="tonal"
          fullWidth={false}
          disabled={busy}
          onPress={onAccept}
          testId="coaching-accept"
          className="min-h-11 shrink-0 px-[var(--spacing-md)]!"
        />
      ) : null}
      <MoreMenu
        options={options}
        title={name}
        label={t("coaching.more", { name })}
        testId="coaching-grant-more"
        sheetTestId="coaching-grant-sheet"
      />
    </Card>
  );
}

/** 담당 회원 줄의 점검 — 이번 주 N회 · 마지막 운동 · 코치 루틴 N회 · 3일 이상이면 「N일째 쉬는 중」(사실만 · ADR-028). */
function DigestLine({ d }: { d: MemberDigest }) {
  if (!d.logView)
    return (
      <AppText variant="caption" color="textMuted" className="block truncate" data-testid="coaching-digest">
        {t("coaching.digest.logOff")}
      </AppText>
    );
  const last = Number(d.lastWorkoutAt);
  const rest = restDays(last);
  const lastText =
    rest === null
      ? t("coaching.digest.none")
      : t("coaching.digest.last", {
          date:
            rest === 0
              ? t("coaching.digest.today")
              : rest === 1
                ? t("coaching.digest.yesterday")
                : new Date(last).toLocaleDateString(lang === "en" ? "en-US" : "ko-KR", {
                    month: "short",
                    day: "numeric",
                  }),
        });
  const bits = [
    // [원본] t("coaching.digest.week", { count: d.weekWorkouts }) — 단수 짝(리뷰 중간-3)
    d.weekWorkouts === 1
      ? t("coaching.digest.weekOne")
      : t("coaching.digest.week", { count: d.weekWorkouts }),
    lastText,
    d.weekCoachRoutineWorkouts > 0
      ? t("coaching.digest.coachRoutine", { count: d.weekCoachRoutineWorkouts })
      : null,
  ].filter(Boolean);
  return (
    <div className="min-w-0" data-testid="coaching-digest" data-week={d.weekWorkouts} data-rest={rest ?? ""}>
      <AppText
        variant="caption"
        color="textMuted"
        className="block truncate"
        data-testid="coaching-digest-text"
      >
        {bits.join(" · ")}
      </AppText>
      {rest !== null && rest >= REST_ALERT_DAYS ? (
        <AppText
          variant="caption"
          className="block truncate font-semibold"
          style={{ color: "var(--color-coaching-ink)" }}
          data-testid="coaching-digest-rest"
        >
          {t("coaching.digest.rest", { count: rest })}
        </AppText>
      ) : null}
    </div>
  );
}

/** 회원 루틴 처방 — 종목을 누르면 편집기가 열린다. DM 요약 카드의 「루틴 처방」도 이 판을 연다(SRS-080).
 * [원본] 목록 읽기·편집기 열기가 이 함수 안에 있었다 — 회원 화면 루틴 탭(SPEC-050 P2)과 같이 쓰려고 MemberRoutinesBody 로 옮겼다. */
export function MemberRoutinesDialog({ peer, onClose }: { peer: Peer; onClose: () => void }) {
  return (
    <MemberRoutinesBody peer={peer}>
      {(content) => (
        <Panel
          testId="coaching-routines-view"
          title={t("coaching.routinesTitle", { name: peer.displayName || "?" })}
          onClose={onClose}
          actions={<Button title={t("common.ok")} variant="secondary" onPress={onClose} />}
        >
          {content}
        </Panel>
      )}
    </MemberRoutinesBody>
  );
}

/**
 * 회원 루틴 목록 + 처방 편집기. 편집기가 열려 있으면 편집기만 그린다(판 위에 판을 겹치지 않는다).
 * children = 목록을 감쌀 틀(판 또는 탭) — 없으면 그대로 그린다.
 */
export function MemberRoutinesBody({
  peer,
  children,
  onEnded,
}: {
  peer: Peer;
  children?: (content: React.ReactNode) => React.ReactNode;
  /** 서버가 PermissionDenied(해지·범위 끔)로 답했을 때 — 회원 화면이 연결을 다시 읽어 판단한다(코드 리뷰 M-1) */
  onEnded?: () => void;
}) {
  const toast = useToast();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [editing, setEditing] = useState<{ routine: Routine; block: RoutineExercise } | null>(null);

  const load = useCallback(async () => {
    try {
      setRoutines((await coachingClient().listMemberRoutines({ memberId: peer.id })).routines);
      // [원본] } catch {
      //   toast(t("common.error"), "error");
      //   setRoutines([]);
      // }
      // [개선] 회원 화면(onEnded 있음)에서 PermissionDenied 면 「빈 목록」으로 덮지 않고 화면에 맡긴다 —
      //   해지·루틴 처방 끔을 「루틴이 없어요」로 오해하지 않게(코드 리뷰 M-1). 판(다이얼로그)은 그대로 알림 + 빈 목록.
    } catch (e) {
      if (onEnded && ConnectError.from(e).code === Code.PermissionDenied) {
        onEnded();
        return;
      }
      toast(t("common.error"), "error");
      setRoutines([]);
    }
  }, [peer.id, toast, onEnded]);

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

  const content = (
    <>
      <AppText variant="caption" color="textMuted" className="block">
        {t("coaching.routinesHint")}
      </AppText>

      {routines === null ? (
        <div className="flex justify-center py-[var(--spacing-lg)]">
          <span role="status" className="inline-flex">
            <LogoSpinner size={32} label={t("common.loading")} />
          </span>
        </div>
      ) : routines.length === 0 ? (
        <AppText
          variant="caption"
          color="textMuted"
          className="mt-[var(--spacing-md)] block"
          data-testid="member-routines-empty"
        >
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
                  // [원본] py-[var(--spacing-sm)] — 줄 높이가 44px 에 못 미쳤다(회원 화면 탭 · SPEC-050 P2)
                  className="mt-[var(--spacing-xs)] flex min-h-11 w-full min-w-0 items-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[var(--spacing-sm)] text-left"
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
    </>
  );
  return <>{children ? children(content) : content}</>;
}
