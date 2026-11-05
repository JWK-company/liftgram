"use client";
// 통계 화면(SPEC-032) — 관리자만. 구역마다 따로 불러 한 구역의 실패가 나머지를 막지 않는다.
// 집계 숫자만 보인다(이메일·이름·운동 내용 없음). 줄을 숨기는 것은 안내이고 경계는 서버다.
import { Role } from "@app/contracts";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { adminClient } from "@/lib/adminClient";
import { t, type TransKey } from "@/lib/i18n";
import { useOpsAlert } from "@/lib/opsAlert";
import { useAuth } from "../AuthProvider";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { LogoSpinner } from "../ui/LogoSpinner";
import { AppText } from "../ui/primitives";
import { ListGroup, ListRow } from "../ui/rows";
import { ScreenHeader } from "../ui/ScreenHeader";
import { BarList, DailyBars, Tile } from "./statsCharts";

const num = (n: bigint | number) => Number(n).toLocaleString();
const pct = (part: bigint | number, whole: bigint | number) =>
  Number(whole) > 0 ? `${Math.round((Number(part) / Number(whole)) * 100)}%` : "—";
const clock = (ts: { seconds: bigint } | undefined) =>
  ts
    ? new Date(Number(ts.seconds) * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : "";
const dateOf = (ts: { seconds: bigint } | undefined) =>
  ts ? new Date(Number(ts.seconds) * 1000).toLocaleDateString("ko-KR") : "";
const bytes = (n: bigint) => {
  const v = Number(n);
  return v >= 1 << 30 ? `${(v / (1 << 30)).toFixed(1)} GB` : `${Math.round(v / (1 << 20))} MB`;
};
const minutes = (sec: bigint | number) => `${Math.round(Number(sec) / 60)}${t("admin.stats.minuteUnit")}`;

/** 구역 하나의 로드·실패 상태. 마지막 요청만 받는다. */
function useSection<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(() => {
    const mine = ++seq.current;
    setFailed(false);
    setData(null);
    loadRef.current().then(
      (v) => {
        if (mine === seq.current) setData(v);
      },
      () => {
        if (mine === seq.current) setFailed(true);
      },
    );
  }, []);
  useEffect(() => {
    reload();
    return () => {
      seq.current += 1;
    };
  }, [reload]);
  return { data, failed, reload };
}

function Section({
  id,
  title,
  at,
  failed,
  loading,
  onRetry,
  children,
}: {
  id: string;
  title: TransKey;
  at?: { seconds: bigint };
  failed: boolean;
  loading: boolean;
  onRetry: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="mb-[var(--spacing-xl)]" data-testid={`stats-${id}`}>
      <div className="mb-[var(--spacing-sm)] flex items-baseline justify-between gap-[var(--spacing-sm)]">
        <AppText variant="heading">{t(title)}</AppText>
        {at ? (
          <span className="text-xs text-(--color-ink3)" data-testid={`stats-${id}-at`}>
            {t("admin.stats.at", { time: clock(at) })}
          </span>
        ) : null}
      </div>
      {failed ? (
        <div
          className="flex items-center justify-between gap-[var(--spacing-sm)] py-[var(--spacing-sm)]"
          data-testid={`stats-${id}-error`}
        >
          <AppText variant="caption" color="danger">
            {t("ops.loadFailed")}
          </AppText>
          <Button
            title={t("admin.stats.retry")}
            variant="secondary"
            size="sm"
            onPress={onRetry}
            testId={`stats-${id}-retry`}
          />
        </div>
      ) : loading ? (
        <div
          className="flex justify-center py-[var(--spacing-md)]"
          role="status"
          data-testid={`stats-${id}-loading`}
        >
          <LogoSpinner size={24} label={t(title)} />
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function Note({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="mt-[var(--spacing-xs)] text-xs text-(--color-ink3)" data-testid={testId}>
      {children}
    </p>
  );
}

function Empty({ text, testId }: { text: string; testId: string }) {
  return (
    <div className="py-[var(--spacing-sm)]" data-testid={testId}>
      <AppText variant="caption" color="textMuted">
        {text}
      </AppText>
    </div>
  );
}

const grid = "grid grid-cols-2 gap-[var(--spacing-sm)]";

type Actor = { user: bigint; guest: bigint; total: bigint } | undefined;

function ActorTile({
  label,
  a,
  caption,
  testId,
}: {
  label: string;
  a: Actor;
  caption?: string;
  testId: string;
}) {
  return (
    <Tile
      label={label}
      value={num(a?.total ?? 0n)}
      caption={
        caption ?? t("admin.stats.actorLine", { user: num(a?.user ?? 0n), guest: num(a?.guest ?? 0n) })
      }
      testId={testId}
    />
  );
}

function UsersSection() {
  const { data, failed, reload } = useSection(() => adminClient().getUsageStats({}));
  return (
    <Section
      id="users"
      title="admin.stats.users"
      at={data?.generatedAt}
      failed={failed}
      loading={!data && !failed}
      onRetry={reload}
    >
      {data && !data.started ? (
        <Empty
          text={t("admin.stats.beforeStart", { date: dateOf(data.usageSince) })}
          testId="stats-users-before"
        />
      ) : data ? (
        <>
          <div className={grid}>
            <ActorTile label={t("admin.stats.online")} a={data.online} testId="stat-online" />
            <ActorTile label={t("admin.stats.dau")} a={data.dau} testId="stat-dau" />
            <ActorTile label={t("admin.stats.wau")} a={data.wau} testId="stat-wau" />
            <ActorTile label={t("admin.stats.mau")} a={data.mau} testId="stat-mau" />
          </div>
          <div className="mt-[var(--spacing-md)]">
            <AppText variant="label" color="textMuted">
              {t("admin.stats.dailyActive")}
            </AppText>
            {data.daily.every((d) => d.user === 0n && d.guest === 0n) ? (
              <Empty text={t("admin.stats.noUsage")} testId="stats-users-empty" />
            ) : (
              <DailyBars
                testId="chart-active"
                series={[
                  { label: t("admin.stats.loginSeries"), color: "var(--stats-series-1)" },
                  { label: t("admin.stats.guestSeries"), color: "var(--stats-series-2)" },
                ]}
                days={data.daily.map((d) => ({ day: d.day, values: [Number(d.user), Number(d.guest)] }))}
              />
            )}
          </div>
          <div className="mt-[var(--spacing-md)]" data-testid="stats-retention">
            <AppText variant="label" color="textMuted">
              {t("admin.stats.retention")}
            </AppText>
            <table className="mt-[var(--spacing-xs)] w-full text-xs text-(--color-ink)">
              <thead>
                <tr className="text-left text-(--color-ink3)">
                  <th className="py-[4px] font-normal" />
                  <th className="py-[4px] text-right font-normal">{t("admin.stats.loginSeries")}</th>
                  <th className="py-[4px] text-right font-normal">{t("admin.stats.guestSeries")}</th>
                  <th className="py-[4px] text-right font-normal">{t("admin.stats.total")}</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    [1, data.d1],
                    [7, data.d7],
                    [30, data.d30],
                  ] as const
                ).map(([n, r]) => (
                  <tr key={n} className="border-(--color-line) border-t" data-testid={`retention-${n}`}>
                    <td className="py-[6px] text-(--color-ink2)">{t("admin.stats.retentionDay", { n })}</td>
                    <td className="py-[6px] text-right tabular-nums">
                      {pct(r?.returned?.user ?? 0n, r?.cohort?.user ?? 0n)}
                    </td>
                    <td className="py-[6px] text-right tabular-nums">
                      {pct(r?.returned?.guest ?? 0n, r?.cohort?.guest ?? 0n)}
                    </td>
                    <td className="py-[6px] text-right tabular-nums">
                      {pct(r?.returned?.total ?? 0n, r?.cohort?.total ?? 0n)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note testId="stats-users-note">{t("admin.stats.usersNote")}</Note>
        </>
      ) : null}
    </Section>
  );
}

function FeaturesSection() {
  const { data, failed, reload } = useSection(() => adminClient().getFeatureStats({}));
  const [range, setRange] = useState<7 | 30>(7);
  const rows = (list: { name: string; last7d: bigint; last30d: bigint }[], prefix: string) =>
    list
      .map((r) => ({
        key: r.name,
        label: labelOf(`${prefix}${r.name}`, r.name),
        value: Number(range === 7 ? r.last7d : r.last30d),
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  const screens = data ? rows(data.screens, "admin.stats.event.").slice(0, 8) : [];
  const actions = data ? rows(data.actions, "admin.stats.event.").slice(0, 8) : [];
  const platforms = data ? rows(data.platforms, "admin.stats.platform.") : [];
  const platformTotal = platforms.reduce((a, b) => a + b.value, 0);
  return (
    <Section
      id="features"
      title="admin.stats.features"
      at={data?.generatedAt}
      failed={failed}
      loading={!data && !failed}
      onRetry={reload}
    >
      {data && !data.started ? (
        <Empty
          text={t("admin.stats.beforeStart", { date: dateOf(data.usageSince) })}
          testId="stats-features-before"
        />
      ) : data ? (
        <>
          <div className="mb-[var(--spacing-sm)] flex gap-[var(--spacing-xs)]" data-testid="stats-range">
            {([7, 30] as const).map((r) => (
              <Button
                key={r}
                title={t(r === 7 ? "admin.stats.range7" : "admin.stats.range30")}
                variant={range === r ? "primary" : "secondary"}
                size="sm"
                onPress={() => setRange(r)}
                testId={`stats-range-${r}`}
              />
            ))}
          </div>
          {screens.length + actions.length === 0 ? (
            <Empty text={t("admin.stats.noUsage")} testId="stats-features-empty" />
          ) : (
            <>
              <Group title={t("admin.stats.screens")}>
                <BarList testId="chart-screens" rows={screens} />
              </Group>
              <Group title={t("admin.stats.actions")}>
                <BarList testId="chart-actions" rows={actions} />
              </Group>
              <Group title={t("admin.stats.platforms")}>
                <BarList
                  testId="chart-platforms"
                  rows={platforms.map((p) => ({ ...p, display: pct(p.value, platformTotal) }))}
                />
              </Group>
            </>
          )}
          <Note>{t("admin.stats.featuresNote")}</Note>
        </>
      ) : null}
    </Section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-[var(--spacing-md)]">
      <div className="mb-[var(--spacing-xs)]">
        <AppText variant="label" color="textMuted">
          {title}
        </AppText>
      </div>
      {children}
    </div>
  );
}

/** 번역이 없으면 이름 그대로. */
function labelOf(key: string, fallback: string): string {
  const label = t(key as TransKey);
  return label === key ? fallback : label;
}

function SignupSection() {
  const { data, failed, reload } = useSection(() => adminClient().getSignupStats({}));
  return (
    <Section
      id="signup"
      title="admin.stats.signup"
      at={data?.generatedAt}
      failed={failed}
      loading={!data && !failed}
      onRetry={reload}
    >
      {data ? (
        <>
          <div className={grid}>
            <Tile label={t("admin.stats.signupTotal")} value={num(data.total)} testId="stat-signup-total" />
            <Tile
              label={t("admin.stats.emailVerified")}
              value={pct(data.emailVerified, data.total)}
              caption={`${num(data.emailVerified)} / ${num(data.total)}`}
              testId="stat-email-verified"
            />
          </div>
          <div className="mt-[var(--spacing-md)]">
            <AppText variant="label" color="textMuted">
              {t("admin.stats.signupDaily")}
            </AppText>
            {data.total === 0n ? (
              <Empty text={t("admin.stats.noSignups")} testId="stats-signup-empty" />
            ) : (
              <DailyBars
                testId="chart-signup"
                series={[{ label: t("admin.stats.signupNew"), color: "var(--stats-series-1)" }]}
                days={data.daily.map((d) => ({ day: d.day, values: [Number(d.count)] }))}
              />
            )}
          </div>
          {data.providers.some((p) => p.count > 0n) ? (
            <div className="mt-[var(--spacing-md)]">
              <div className="mb-[var(--spacing-xs)]">
                <AppText variant="label" color="textMuted">
                  {t("admin.stats.providers")}
                </AppText>
              </div>
              <BarList
                testId="chart-providers"
                rows={data.providers.map((p) => ({
                  key: p.name,
                  label: providerLabel(p.name),
                  value: Number(p.count),
                }))}
              />
            </div>
          ) : null}
          <div className="mt-[var(--spacing-md)]">
            {!data.started ? (
              <Note testId="stats-first-workout-before">
                {t("admin.stats.beforeStart", { date: dateOf(data.usageSince) })}
              </Note>
            ) : data.firstWorkoutCohort === 0n ? (
              <Note testId="stats-first-workout-empty">{t("admin.stats.firstWorkoutEmpty")}</Note>
            ) : (
              <Tile
                label={t("admin.stats.firstWorkout")}
                value={pct(data.firstWorkoutDone, data.firstWorkoutCohort)}
                caption={`${num(data.firstWorkoutDone)} / ${num(data.firstWorkoutCohort)}`}
                testId="stat-first-workout"
              />
            )}
          </div>
          <Note>{t("admin.stats.excludedNote")}</Note>
        </>
      ) : null}
    </Section>
  );
}

function providerLabel(name: string): string {
  return labelOf(`admin.stats.provider.${name}`, name);
}

function RoutineSection() {
  const { data, failed, reload } = useSection(() => adminClient().getRoutineStats({}));
  return (
    <Section
      id="routine"
      title="admin.stats.routine"
      at={data?.generatedAt}
      failed={failed}
      loading={!data && !failed}
      onRetry={reload}
    >
      {data && !data.started ? (
        <Empty
          text={t("admin.stats.beforeStart", { date: dateOf(data.usageSince) })}
          testId="stats-routine-before"
        />
      ) : data ? (
        <>
          <div className="mb-[var(--spacing-xs)]">
            <AppText variant="label" color="textMuted">
              {t("admin.stats.routineBuckets")}
            </AppText>
          </div>
          <BarList
            testId="chart-routines"
            rows={data.routineBuckets.map((b) => ({
              key: b.name,
              label: t("admin.stats.routineBucket", { n: b.name }),
              value: Number(b.count),
            }))}
          />
          {data.workouts === 0n ? (
            <Empty text={t("admin.stats.noWorkouts")} testId="stats-routine-empty" />
          ) : (
            <div className={`${grid} mt-[var(--spacing-md)]`}>
              <Tile
                label={t("admin.stats.fromRoutine")}
                value={pct(data.workoutsFromRoutine, data.workouts)}
                caption={`${num(data.workoutsFromRoutine)} / ${num(data.workouts)}`}
                testId="stat-from-routine"
              />
              <Tile
                label={t("admin.stats.weekly")}
                // [원본] .../ 4 — 시행 후 4주가 안 되면 실제보다 낮게 나왔다(코드 리뷰 L-1)
                value={(Number(data.workouts) / Math.max(1, Number(data.activeUsers)) / statsWeeks()).toFixed(1)}
                caption={t("admin.stats.weeklyCaption", { n: num(data.activeUsers) })}
                testId="stat-weekly"
              />
              <Tile
                label={t("admin.stats.medianDuration")}
                value={data.medianDurationSeconds > 0n ? minutes(data.medianDurationSeconds) : "—"}
                testId="stat-median"
              />
            </div>
          )}
          <Note>{t("admin.stats.routineNote")}</Note>
        </>
      ) : null}
    </Section>
  );
}

function ContentSection() {
  const { data, failed, reload } = useSection(() => adminClient().getContentStats({}));
  return (
    <Section
      id="content"
      title="admin.stats.content"
      at={data?.generatedAt}
      failed={failed}
      loading={!data && !failed}
      onRetry={reload}
    >
      {data ? (
        <>
          <table className="w-full text-xs text-(--color-ink)" data-testid="stats-content-table">
            <thead>
              <tr className="text-left text-(--color-ink3)">
                <th className="py-[4px] font-normal" />
                <th className="py-[4px] text-right font-normal">{t("admin.stats.d7")}</th>
                <th className="py-[4px] text-right font-normal">{t("admin.stats.d30")}</th>
                <th className="py-[4px] text-right font-normal">{t("admin.stats.total")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.key} className="border-(--color-line) border-t" data-testid={`content-${r.key}`}>
                  <td className="py-[6px] text-(--color-ink2)">
                    {t(`admin.stats.contentKey.${r.key}` as TransKey)}
                  </td>
                  <td className="py-[6px] text-right tabular-nums">{num(r.last7d)}</td>
                  <td className="py-[6px] text-right tabular-nums">{num(r.last30d)}</td>
                  <td className="py-[6px] text-right tabular-nums">{num(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note>{t("admin.stats.contentNote")}</Note>
        </>
      ) : null}
    </Section>
  );
}

function OperationsSection() {
  const { data, failed, reload } = useSection(() => adminClient().getOperationsStats({}));
  const ops = useOpsAlert();
  return (
    <Section
      id="operations"
      title="admin.stats.operations"
      at={data?.generatedAt}
      failed={failed}
      loading={!data && !failed}
      onRetry={reload}
    >
      {data ? (
        <>
          <ListGroup>
            <ListRow
              testId="stat-pending-reports"
              icon="flag-outline"
              title={t("admin.stats.pendingReports")}
              value={num(data.pendingReports)}
              href="/moderation"
            />
            <ListRow
              testId="stat-open-user-feedback"
              icon="chatbubbles-outline"
              title={t("admin.stats.openUserFeedback")}
              value={num(data.openUserFeedback)}
              href="/admin/feedback"
            />
            <ListRow
              testId="stat-open-ops-feedback"
              icon="chatbubble-outline"
              title={t("admin.stats.openOpsFeedback")}
              value={num(data.openOpsFeedback)}
              href="/admin/feedback"
            />
            <ListRow
              testId="stat-ops-status"
              icon="stats-chart"
              title={t("admin.stats.opsStatus")}
              value={t(ops.alert ? "ops.needsCheck" : "admin.stats.opsFine")}
              href="/ops"
            />
            <ListRow
              testId="stat-usage-tables"
              title={t("admin.stats.usageTables")}
              subtitle={t("admin.stats.usageRows", { n: num(data.usageRows24h) })}
              value={bytes(data.usageBytes)}
            />
          </ListGroup>
          {data.usageWarn ? (
            <div
              className="mt-[var(--spacing-xs)] flex items-center gap-[var(--spacing-xs)]"
              data-testid="stat-usage-warn"
              role="status"
            >
              <Icon name="alert-circle-outline" size={16} color="var(--color-warn)" />
              <AppText variant="caption">{t("admin.stats.usageWarn")}</AppText>
            </div>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

/** 주당 횟수의 분모 — 최근 28일 집계지만 시행(2026-11-05) 후 4주가 안 됐으면 지난 주 수로 나눈다. */
const STATS_SINCE_MS = Date.parse("2026-11-05T00:00:00+09:00");
function statsWeeks(): number {
  const weeks = (Date.now() - STATS_SINCE_MS) / (7 * 24 * 60 * 60 * 1000);
  return Math.min(4, Math.max(1, weeks));
}

export default function StatsClient() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("admin.stats.title")}
        back={
          <a href="/admin" aria-label={t("staff.title")} data-testid="stats-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />
      <div className="flex-1 p-[var(--spacing-lg)]" data-testid="stats-screen">
        {loading && !isAdmin ? (
          <div className="flex justify-center py-[var(--spacing-xl)]" role="status">
            <LogoSpinner size={32} label={t("admin.stats.title")} />
          </div>
        ) : !isAdmin ? (
          // 관리자가 아니면 집계를 부르지 않는다.
          <div className="py-[var(--spacing-xl)] text-center" data-testid="stats-denied">
            <AppText variant="body" color="danger">
              {t("ops.adminOnly")}
            </AppText>
          </div>
        ) : (
          <>
            <UsersSection />
            <SignupSection />
            <FeaturesSection />
            <RoutineSection />
            <ContentSection />
            <OperationsSection />
          </>
        )}
      </div>
    </div>
  );
}
