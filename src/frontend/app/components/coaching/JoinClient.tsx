"use client";
// 코칭 초대 링크 화면(SPEC-050 P1b) — /coaching/join?code=
//
//   로그인 전   코드를 sessionStorage 에 두고 「로그인하고 연결」 → /account?next=/coaching/join?code=… (로그인 뒤 이 화면으로)
//   로그인 뒤   GetInvite → 코치 카드 + 범위 시트(처음 한 번 저절로 열림) → AcceptInvite → /coaching
//   거절        서버 한국어 문구 그대로(없는 코드·내 코드·이미 코치가 있어요) — 범위 시트를 띄우기 전에
//
// 판단은 응답이 온 뒤에만 한다 — 읽는 동안 오류·카드를 번갈아 그리지 않는다.
import type { Peer } from "@app/contracts";
import { useEffect, useRef, useState } from "react";
import { coachingClient } from "@/lib/coachingClient";
import {
  clearJoinCode,
  formatInviteCode,
  joinPath,
  normalizeInviteCode,
  peekJoinCode,
  stashJoinCode,
  type ScopeValue,
} from "@/lib/coaching";
import { errorText } from "@/lib/errorText";
import { t } from "@/lib/i18n";
import { navigate } from "@/lib/nav";
import { useAuth } from "../AuthProvider";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { LogoSpinner } from "../ui/LogoSpinner";
import { AppText, EmptyState } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";
import { CoachCard } from "./CoachBits";
import { CoachingScopeSheet } from "./CoachingScopeSheet";

type Lookup = { state: "loading" } | { state: "ok"; trainer: Peer } | { state: "error"; message: string };

export default function JoinClient({ code: codeParam }: { code: string }) {
  const { user, loading, restoring } = useAuth();
  const toast = useToast();
  // 주소의 코드가 먼저 · 없으면 로그인 전에 맡겨 둔 코드. 정규화(공백·하이픈 빼고 대문자) 뒤 8자 영숫자가 아니면
  // 「코드 없음」 — 엉터리·긴 코드를 서버에 묻지 않는다(코드 리뷰 지적 6).
  const fromParam = normalizeInviteCode(codeParam);
  const [code, setCode] = useState<string | null>(fromParam);
  // 맡겨 둔 코드는 sessionStorage 라 첫 그림 뒤에 읽는다 — 읽기 전엔 스피너만(「코드 없음」 깜빡임 금지 · 지적 5)
  const [codeReady, setCodeReady] = useState(codeParam.trim() !== "");
  const [lookup, setLookup] = useState<Lookup>({ state: "loading" });
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  /** 범위 시트는 처음 응답 때 한 번만 저절로 연다 — 닫은 뒤 다시 읽혀도 또 열지 않는다(지적 4) */
  const autoOpened = useRef(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!codeParam.trim()) {
      const kept = normalizeInviteCode(peekJoinCode() ?? "");
      if (kept) setCode(kept);
    }
    setCodeReady(true);
  }, [codeParam]);

  // 의존성은 user 객체가 아니라 user?.id — 프로필 갱신으로 객체만 바뀔 때 다시 읽고 시트를 또 열지 않게(지적 4)
  useEffect(() => {
    if (loading || restoring || !userId || !code) return;
    let closed = false;
    setLookup({ state: "loading" });
    coachingClient()
      .getInvite({ code })
      .then((res) => {
        if (closed) return;
        if (!res.trainer) {
          setLookup({ state: "error", message: t("common.errNotFound") });
          return;
        }
        setLookup({ state: "ok", trainer: res.trainer });
        if (!autoOpened.current) {
          autoOpened.current = true;
          setSheet(true);
        }
      })
      .catch((e) => {
        if (closed) return;
        clearJoinCode();
        setLookup({ state: "error", message: errorText(e) });
      });
    return () => {
      closed = true;
    };
  }, [loading, restoring, userId, code]);

  async function connect(scope: ScopeValue) {
    if (busy || !code) return;
    setBusy(true);
    setSheetError(null);
    try {
      await coachingClient().acceptInvite({ code, scope });
      clearJoinCode();
      toast(t("coaching.connected"));
      navigate("/coaching", { replace: true });
    } catch (e) {
      setSheetError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  let body: React.ReactNode;
  if (loading || restoring || !codeReady) {
    body = <Spinner />;
  } else if (!code) {
    body = (
      <div data-testid="join-no-code">
        <EmptyState
          tone="error"
          icon="alert-circle-outline"
          title={t("coaching.join.title")}
          message={t("coaching.join.noCode")}
          action={<ToCoaching />}
        />
      </div>
    );
  } else if (!user) {
    body = (
      <div data-testid="join-login-required">
        <EmptyState
          icon="lock-closed-outline"
          title={t("coaching.join.loginTitle")}
          message={t("coaching.join.loginMessage")}
          action={
            <Button
              title={t("auth.login")}
              fullWidth={false}
              testId="join-login"
              onPress={() => {
                stashJoinCode(code);
                navigate(`/account?next=${encodeURIComponent(joinPath(code))}`);
              }}
            />
          }
        />
      </div>
    );
  } else if (lookup.state === "loading") {
    body = <Spinner />;
  } else if (lookup.state === "error") {
    body = (
      <div data-testid="join-error">
        <EmptyState
          tone="error"
          icon="alert-circle-outline"
          title={t("coaching.join.title")}
          message={lookup.message}
          action={<ToCoaching />}
        />
      </div>
    );
  } else {
    const p = lookup.trainer;
    body = (
      <div className="flex flex-col gap-[var(--spacing-md)]" data-testid="join-ready">
        <CoachCard name={p.displayName} avatarUrl={p.avatarUrl} bio={p.coachBio} tags={p.coachTags} />
        <AppText variant="caption" color="textMuted" className="block text-center" data-testid="join-code">
          {formatInviteCode(code)}
        </AppText>
        <Button title={t("coaching.scope.joinConfirm")} onPress={() => setSheet(true)} testId="join-open" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("coaching.join.title")}
        back={
          <a href="/coaching" aria-label={t("coaching.title")} data-testid="join-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />
      <div className="flex-1 p-[var(--spacing-lg)]">{body}</div>
      {sheet && lookup.state === "ok" ? (
        <CoachingScopeSheet
          mode="join"
          header={
            <CoachCard
              name={lookup.trainer.displayName}
              avatarUrl={lookup.trainer.avatarUrl}
              bio={lookup.trainer.coachBio}
              tags={lookup.trainer.coachTags}
              testId="scope-coach-card"
            />
          }
          busy={busy}
          error={sheetError}
          onConfirm={(scope) => void connect(scope)}
          onClose={() => setSheet(false)}
        />
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-[var(--spacing-xl)]">
      <span role="status" className="inline-flex">
        <LogoSpinner size={32} label={t("common.loading")} />
      </span>
    </div>
  );
}

// <a href="/coaching"><Button/></a> 가 아니다 — 링크 안에 버튼(누르는 대상 둘 · 지적 9) → 버튼 하나가 이동한다
function ToCoaching() {
  return (
    <Button
      title={t("coaching.join.toCoaching")}
      variant="secondary"
      fullWidth={false}
      testId="join-to-coaching"
      onPress={() => navigate("/coaching")}
    />
  );
}
