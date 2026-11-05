"use client";

import { useState } from "react";
import { safeNext } from "@/lib/roles";
import { type LoginResult, logIn } from "@/lib/session";

const MESSAGE: Record<Exclude<LoginResult, "ok">, string> = {
  credentials: "이메일이나 비밀번호가 맞지 않습니다.",
  role: "운영 권한이 없는 계정입니다. 권한이 필요하면 관리자에게 요청하세요.",
  limited: "시도가 너무 많습니다. 잠시 뒤 다시 시도하세요.",
  unavailable: "서버에 연결할 수 없습니다. 잠시 뒤 다시 시도하세요.",
};

export function LoginForm({ appUrl }: { appUrl: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await logIn(email.trim(), password).catch((): LoginResult => "unavailable");
    if (result === "ok") {
      // 전체 이동: 비밀번호를 담았던 화면의 상태를 남기지 않는다.
      location.assign(safeNext(new URLSearchParams(location.search).get("next"), location.origin));
      return;
    }
    setPassword("");
    setError(MESSAGE[result]);
    setBusy(false);
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 space-y-4"
      >
        <h1 className="text-lg font-semibold">리프트그램 운영</h1>
        <label className="block space-y-1">
          <span className="text-muted">이메일</span>
          <input
            data-testid="login-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-line bg-bg px-3 py-2"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-muted">비밀번호</span>
          <input
            data-testid="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-line bg-bg px-3 py-2"
          />
        </label>
        {error && (
          <p data-testid="login-error" role="alert" className="text-danger">
            {error}
          </p>
        )}
        <button
          data-testid="login-submit"
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent px-3 py-2 font-medium text-accent-text disabled:opacity-60"
        >
          {busy ? "확인 중…" : "로그인"}
        </button>
        <p className="text-muted text-xs">
          비밀번호를 잊었거나 소셜 로그인만 쓰셨다면{" "}
          <a className="underline" href={`${appUrl}/account`} target="_blank" rel="noreferrer noopener">
            앱 계정 화면
          </a>
          에서 먼저 비밀번호를 만들어 주세요. 소셜 계정은 로그인하고 10분 안에 만들 수 있습니다.
        </p>
      </form>
    </main>
  );
}
