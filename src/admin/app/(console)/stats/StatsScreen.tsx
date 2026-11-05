"use client";

// 통계(관리자, SPEC-033). 구역마다 따로 불러 한 구역의 실패가 나머지를 막지 않는다.
// 집계 숫자만 보인다(이메일·이름·운동 내용 없음). 줄을 숨기는 것은 안내이고 경계는 서버다.
import { Role } from "@app/contracts";
import { type Timestamp, timestampMs } from "@bufbuild/protobuf/wkt";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { RoleGate } from "@/app/components/RoleGate";
import { BarList, DailyBars, Tile } from "@/app/components/statsCharts";
import { Button, PageHeader, Tag, useTick } from "@/app/components/ui";
import { ago, bytes, kst, num } from "@/lib/format";
import { useOpsAlert } from "@/lib/opsAlert";
import { adminApi } from "@/lib/rpc";
import { pct, weeklyRate } from "@/lib/statsCalc";
import { CONTENT_LABELS, EVENT_LABELS, labelOf, PLATFORM_LABELS, PROVIDER_LABELS } from "@/lib/statsLabels";
import { useQueryState } from "@/lib/useQueryState";
import { RefreshSignal, type Resource, useResource } from "@/lib/useResource";

const ADMIN_ONLY = [Role.ADMIN] as const;
const REFRESH_MS = 5 * 60_000;

const dateOnly = (ts?: Timestamp) => kst(ts).slice(0, 10);
const beforeStart = (since?: Timestamp) => `아직 집계 전입니다. ${dateOnly(since)}부터 모읍니다.`;

function Block<T extends { generatedAt?: Timestamp }>({
  id,
  title,
  resource,
  span,
  children,
}: {
  id: string;
  title: string;
  resource: Resource<T>;
  span?: boolean;
  children: (data: T) => ReactNode;
}) {
  const { data, error, loading, loadedAt, reload } = resource;
  useTick();
  return (
    <section
      data-testid={`stats-${id}`}
      className={`rounded-lg border border-line bg-surface p-4 ${span ? "xl:col-span-2" : ""}`}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {data?.generatedAt && (
          <span data-testid={`stats-${id}-at`} className="text-muted text-xs">
            {kst(data.generatedAt)} 집계
          </span>
        )}
      </div>
      {error && (
        <div
          data-testid={`stats-${id}-error`}
          className="mb-3 flex flex-wrap items-center justify-between gap-2"
        >
          <span className="text-xs">
            {error}
            {data && loadedAt ? ` 아래는 ${ago(loadedAt)} 데이터입니다.` : ""}
          </span>
          <Button data-testid={`stats-${id}-retry`} disabled={loading} onClick={() => void reload()}>
            {loading ? "불러오는 중…" : "다시 시도"}
          </Button>
        </div>
      )}
      {data ? (
        children(data)
      ) : error ? null : (
        <p role="status" data-testid={`stats-${id}-loading`} className="py-4 text-muted">
          불러오는 중…
        </p>
      )}
    </section>
  );
}

const Note = ({ children, testid }: { children: ReactNode; testid?: string }) => (
  <p data-testid={testid} className="mt-3 text-muted text-xs">
    {children}
  </p>
);

const Blank = ({ children, testid }: { children: ReactNode; testid: string }) => (
  <p data-testid={testid} className="py-3 text-muted">
    {children}
  </p>
);

const Sub = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="mt-4 min-w-0">
    <h3 className="mb-1.5 text-muted text-xs">{title}</h3>
    {children}
  </div>
);

const TILES = "grid grid-cols-2 gap-2 lg:grid-cols-4";

function actorLine(a?: { user: bigint; guest: bigint }) {
  return `로그인 ${num(a?.user ?? 0n)} · 비로그인 ${num(a?.guest ?? 0n)}`;
}

function UsersBlock() {
  const r = useResource(() => adminApi.getUsageStats({}), REFRESH_MS);
  return (
    <Block id="users" title="사용자" resource={r} span>
      {(d) =>
        !d.started ? (
          <Blank testid="stats-users-before">{beforeStart(d.usageSince)}</Blank>
        ) : (
          <>
            <div className={TILES}>
              {(
                [
                  ["online", "현재 접속", d.online],
                  ["dau", "일 활성", d.dau],
                  ["wau", "주 활성", d.wau],
                  ["mau", "월 활성", d.mau],
                ] as const
              ).map(([key, label, a]) => (
                <Tile
                  key={key}
                  testid={`stat-${key}`}
                  label={label}
                  value={num(a?.total ?? 0n)}
                  caption={actorLine(a)}
                />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <Sub title="최근 30일 일 활성">
                {d.daily.every((x) => x.user === 0n && x.guest === 0n) ? (
                  <Blank testid="stats-users-empty">아직 모인 이용 기록이 없습니다.</Blank>
                ) : (
                  <DailyBars
                    testid="chart-active"
                    series={[
                      { label: "로그인", color: "var(--series-1)" },
                      { label: "비로그인", color: "var(--series-2)" },
                    ]}
                    days={d.daily.map((x) => ({ day: x.day, values: [Number(x.user), Number(x.guest)] }))}
                  />
                )}
              </Sub>
              <Sub title="재방문">
                <table data-testid="stats-retention" className="w-full text-xs">
                  <thead>
                    <tr className="text-muted">
                      <td className="py-1" />
                      <th scope="col" className="py-1 text-right font-normal">
                        로그인
                      </th>
                      <th scope="col" className="py-1 text-right font-normal">
                        비로그인
                      </th>
                      <th scope="col" className="py-1 text-right font-normal">
                        합계
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        [1, d.d1],
                        [7, d.d7],
                        [30, d.d30],
                      ] as const
                    ).map(([n, x]) => (
                      <tr key={n} data-testid={`retention-${n}`} className="border-t border-line">
                        <th scope="row" className="py-1.5 text-left font-normal text-muted">
                          {n}일 뒤
                        </th>
                        <td className="py-1.5 text-right tabular-nums">
                          {pct(x?.returned?.user ?? 0n, x?.cohort?.user ?? 0n)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {pct(x?.returned?.guest ?? 0n, x?.cohort?.guest ?? 0n)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {pct(x?.returned?.total ?? 0n, x?.cohort?.total ?? 0n)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Sub>
            </div>
            <Note testid="stats-users-note">
              합계는 로그인과 비로그인을 더한 값입니다. 비로그인은 기기 기준이라 같은 사람이 여러 번 잡힐 수
              있어 추세로만 보세요. 재방문은 처음 온 날로부터 정확히 그날 다시 온 비율입니다.
            </Note>
          </>
        )
      }
    </Block>
  );
}

function SignupBlock() {
  const r = useResource(() => adminApi.getSignupStats({}), REFRESH_MS);
  return (
    <Block id="signup" title="가입" resource={r}>
      {(d) => (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Tile testid="stat-signup-total" label="누적 가입" value={num(d.total)} />
            <Tile
              testid="stat-email-verified"
              label="메일 확인"
              value={pct(d.emailVerified, d.total)}
              caption={`${num(d.emailVerified)} / ${num(d.total)}`}
            />
          </div>
          <Sub title="최근 30일 신규 가입">
            {d.total === 0n ? (
              <Blank testid="stats-signup-empty">아직 가입자가 없습니다.</Blank>
            ) : (
              <DailyBars
                testid="chart-signup"
                series={[{ label: "신규 가입", color: "var(--series-1)" }]}
                days={d.daily.map((x) => ({ day: x.day, values: [Number(x.count)] }))}
              />
            )}
          </Sub>
          {d.providers.some((p) => p.count > 0n) && (
            <Sub title="가입 경로">
              <BarList
                testid="chart-providers"
                rows={d.providers.map((p) => ({
                  key: p.name,
                  label: labelOf(PROVIDER_LABELS, p.name),
                  value: Number(p.count),
                }))}
              />
            </Sub>
          )}
          <Sub title="가입 7일 안 첫 운동">
            {!d.started ? (
              <Note testid="stats-first-workout-before">{beforeStart(d.usageSince)}</Note>
            ) : d.firstWorkoutCohort === 0n ? (
              <Note testid="stats-first-workout-empty">시행일 뒤 가입해 7일이 지난 계정부터 보입니다.</Note>
            ) : (
              <Tile
                testid="stat-first-workout"
                label="완료율"
                value={pct(d.firstWorkoutDone, d.firstWorkoutCohort)}
                caption={`${num(d.firstWorkoutDone)} / ${num(d.firstWorkoutCohort)}`}
              />
            )}
          </Sub>
          <Note>
            운영진과 제외 계정은 뺐습니다. 일 집계는 제외를 켠 날 이전으로 소급하지 않습니다. 연결한 경로가
            여럿이면 경로마다 셉니다.
          </Note>
        </>
      )}
    </Block>
  );
}

function FeaturesBlock() {
  const r = useResource(() => adminApi.getFeatureStats({}), REFRESH_MS);
  const [query, setQuery] = useQueryState();
  const range = query.get("range") === "30" ? 30 : 7;
  const rows = (list: { name: string; last7d: bigint; last30d: bigint }[], labels: Record<string, string>) =>
    list
      .map((x) => ({
        key: x.name,
        label: labelOf(labels, x.name),
        value: Number(range === 7 ? x.last7d : x.last30d),
      }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  return (
    <Block id="features" title="기능" resource={r}>
      {(d) => {
        if (!d.started) return <Blank testid="stats-features-before">{beforeStart(d.usageSince)}</Blank>;
        const screens = rows(d.screens, EVENT_LABELS);
        const actions = rows(d.actions, EVENT_LABELS);
        const platforms = rows(d.platforms, PLATFORM_LABELS);
        const platformTotal = platforms.reduce((a, b) => a + b.value, 0);
        return (
          <>
            <div data-testid="stats-range" className="flex gap-1">
              {([7, 30] as const).map((n) => (
                <Button
                  key={n}
                  data-testid={`stats-range-${n}`}
                  aria-pressed={range === n}
                  variant={range === n ? "primary" : "secondary"}
                  onClick={() => setQuery({ range: n === 7 ? null : "30" })}
                >
                  {n}일
                </Button>
              ))}
            </div>
            {screens.length + actions.length === 0 ? (
              <Blank testid="stats-features-empty">아직 모인 이용 기록이 없습니다.</Blank>
            ) : (
              <>
                <Sub title="화면 순위">
                  <BarList testid="chart-screens" rows={screens} />
                </Sub>
                <Sub title="행동 순위">
                  <BarList testid="chart-actions" rows={actions} />
                </Sub>
                <Sub title="플랫폼">
                  <BarList
                    testid="chart-platforms"
                    rows={platforms.map((p) => ({ ...p, display: pct(p.value, platformTotal) }))}
                  />
                </Sub>
              </>
            )}
            <Note>집계는 한 시간마다 갱신됩니다. 끄기를 켠 사람과 운영진은 빠집니다.</Note>
          </>
        );
      }}
    </Block>
  );
}

function RoutineBlock() {
  const r = useResource(() => adminApi.getRoutineStats({}), REFRESH_MS);
  return (
    <Block id="routine" title="루틴·운동" resource={r}>
      {(d) =>
        !d.started ? (
          <Blank testid="stats-routine-before">{beforeStart(d.usageSince)}</Blank>
        ) : (
          <>
            <Sub title="사용자당 루틴 수">
              <BarList
                testid="chart-routines"
                rows={d.routineBuckets.map((b) => ({
                  key: b.name,
                  label: `${b.name}개`,
                  value: Number(b.count),
                }))}
              />
            </Sub>
            {d.workouts === 0n ? (
              <Blank testid="stats-routine-empty">최근 28일 완료한 운동이 아직 없습니다.</Blank>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3">
                <Tile
                  testid="stat-from-routine"
                  label="루틴으로 시작한 운동"
                  value={pct(d.workoutsFromRoutine, d.workouts)}
                  caption={`${num(d.workoutsFromRoutine)} / ${num(d.workouts)}`}
                />
                <Tile
                  testid="stat-weekly"
                  label="주당 운동 횟수"
                  value={weeklyRate(
                    Number(d.workouts),
                    Number(d.activeUsers),
                    d.usageSince ? timestampMs(d.usageSince) : Date.now(),
                    Date.now(),
                  )}
                  caption={`최근 28일 운동한 ${num(d.activeUsers)}명 평균`}
                />
                <Tile
                  testid="stat-median"
                  label="운동 시간 중앙값"
                  value={
                    d.medianDurationSeconds > 0n
                      ? `${Math.round(Number(d.medianDurationSeconds) / 60)}분`
                      : "—"
                  }
                />
              </div>
            )}
            <Note>
              로그인 사용자가 시행일 뒤 올린 기록만 셉니다. 불러온 기록은 뺐고, 기기에만 있는 기록은 보이지
              않습니다.
            </Note>
          </>
        )
      }
    </Block>
  );
}

function ContentBlock() {
  const r = useResource(() => adminApi.getContentStats({}), REFRESH_MS);
  return (
    <Block id="content" title="콘텐츠" resource={r}>
      {(d) => (
        <>
          <table data-testid="stats-content-table" className="w-full text-xs">
            <thead>
              <tr className="text-muted">
                <td className="py-1" />
                {["7일", "30일", "전체"].map((h) => (
                  <th key={h} scope="col" className="py-1 text-right font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((x) => (
                <tr key={x.key} data-testid={`content-${x.key}`} className="border-t border-line">
                  <th scope="row" className="py-1.5 text-left font-normal text-muted">
                    {labelOf(CONTENT_LABELS, x.key)}
                  </th>
                  <td className="py-1.5 text-right tabular-nums">{num(x.last7d)}</td>
                  <td className="py-1.5 text-right tabular-nums">{num(x.last30d)}</td>
                  <td className="py-1.5 text-right tabular-nums">{num(x.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note>삭제된 글과 내려간 글은 건수에서 빠집니다.</Note>
        </>
      )}
    </Block>
  );
}

function OperationsBlock() {
  const r = useResource(() => adminApi.getOperationsStats({}), REFRESH_MS);
  const ops = useOpsAlert();
  // 답을 받기 전이나 한 번도 못 받았을 때 「정상」이라고 말하지 않는다.
  return (
    <Block id="operations" title="운영" resource={r}>
      {(d) => {
        const line = (testid: string, label: string, value: ReactNode, href?: string, sub?: string) => (
          <li
            data-testid={testid}
            className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0"
          >
            <span className="min-w-0">
              {href ? (
                <Link className="underline" href={href}>
                  {label}
                </Link>
              ) : (
                label
              )}
              {sub && <span className="ml-2 text-muted text-xs">{sub}</span>}
            </span>
            <span className="tabular-nums">{value}</span>
          </li>
        );
        return (
          <>
            <ul>
              {line("stat-pending-reports", "검토 대기 신고", num(d.pendingReports), "/moderation")}
              {line(
                "stat-open-user-feedback",
                "미처리 사용자 의견",
                num(d.openUserFeedback),
                "/user-feedback",
              )}
              {line("stat-open-ops-feedback", "미처리 운영 피드백", num(d.openOpsFeedback), "/ops-feedback")}
              {line(
                "stat-ops-status",
                "운영 상태",
                ops.alert ? <Tag tone="danger">확인 필요</Tag> : ops.checked ? "정상" : "확인 전",
                "/ops",
              )}
              {line(
                "stat-usage-tables",
                "이용 기록 표",
                bytes(d.usageBytes),
                undefined,
                `최근 24시간 ${num(d.usageRows24h)}행`,
              )}
            </ul>
            {d.usageWarn && (
              <p data-testid="stat-usage-warn" role="status" className="mt-2 text-danger text-xs">
                이용 기록 표가 커졌습니다. 확인이 필요합니다.
              </p>
            )}
            <Note>
              신고는 건수 기준이라 대상별로 묶고 자동 보류까지 넣는 신고 화면의 줄 수와 다를 수 있습니다.
            </Note>
          </>
        );
      }}
    </Block>
  );
}

function Screen() {
  const [signal, setSignal] = useState(0);
  return (
    <div data-testid="stats-screen">
      <PageHeader title="통계">
        <Button data-testid="stats-refresh" onClick={() => setSignal((n) => n + 1)}>
          새로고침
        </Button>
      </PageHeader>
      <RefreshSignal.Provider value={signal}>
        <div className="grid gap-4 xl:grid-cols-2">
          <UsersBlock />
          <SignupBlock />
          <FeaturesBlock />
          <RoutineBlock />
          <ContentBlock />
          <OperationsBlock />
        </div>
      </RefreshSignal.Provider>
    </div>
  );
}

export function StatsScreen() {
  return (
    <RoleGate roles={ADMIN_ONLY}>
      <Screen />
    </RoleGate>
  );
}
