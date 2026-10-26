// @plm SRS-052  사람 확인 위젯 — Cloudflare Turnstile (auth-golive P1 · D4)
//
// ─────────────────────────────────────────────────────────────────────────────
// 로그인 없이 메일을 내보내는 입구(가입·재설정 요청·인증 메일 재발송)에 붙는다. 서버가 같은 토큰을
// Cloudflare 에 다시 묻는다(backend internal/auth/turnstile.go) — 화면 확인만으로는 아무것도 막지 못한다.
//
//   · siteKey 가 비면 **아무것도 그리지 않는다** — 서버도 비밀키가 없으면 묻지 않는다(짝으로 켠다)
//   · `interaction-only` — 대부분의 사람에게는 보이지 않고, 의심스러울 때만 체크 상자가 뜬다
//   · 토큰은 **한 번 쓰면 끝**이다. 제출할 때마다 resetKey 를 올려 새 토큰을 받는다
//
// 스크립트는 문서당 한 번만 싣는다(여러 폼이 한 화면에 있어도). 외부 스크립트이므로 실패해도
// 폼 자체는 남는다 — 그때는 토큰이 없어 서버가 「보안 확인을 다시 해 주세요」로 답한다.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { useEffect, useRef } from "react";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
type W = Window & { turnstile?: Turnstile; __lgTurnstile?: Promise<Turnstile> };

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstile(): Promise<Turnstile> {
  const w = window as W;
  if (w.turnstile) return Promise.resolve(w.turnstile);
  w.__lgTurnstile ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("turnstile 없음")));
    s.onerror = () => {
      w.__lgTurnstile = undefined; // 다음 마운트에서 다시 시도한다
      reject(new Error("turnstile 스크립트를 불러오지 못했습니다"));
    };
    document.head.appendChild(s);
  });
  return w.__lgTurnstile;
}

export function HumanCheck({
  siteKey,
  onToken,
  resetKey = 0,
}: {
  siteKey: string;
  /** 새 토큰(null = 만료·오류 — 제출을 막아야 한다). */
  onToken: (token: string | null) => void;
  /** 바뀔 때마다 위젯을 새로 돌린다(제출 직후 · 서버가 거절했을 때). */
  resetKey?: number;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  // 최신 콜백을 위젯에 물린다 — 렌더 옵션은 한 번만 넘기므로 클로저가 낡지 않게.
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!siteKey || !box.current) return;
    let alive = true;
    loadTurnstile()
      .then((t) => {
        if (!alive || !box.current) return;
        widget.current = t.render(box.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          language: "ko",
          callback: (tok: string) => cb.current(tok),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      alive = false;
      const t = (window as W).turnstile;
      if (t && widget.current) t.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey === 0) return;
    const t = (window as W).turnstile;
    if (t && widget.current) {
      cb.current(null);
      t.reset(widget.current);
    }
  }, [resetKey]);

  if (!siteKey) return null;
  return <div ref={box} data-testid="human-check" className="min-h-0" />;
}
