"use client";

// 8칸 초대 코드 입력(SPEC-059 · #T19) — 인증 코드처럼 칸 8개로 보이지만 **진짜 입력칸은 하나**다(REV-142 U1).
//   · 투명한 input 하나를 칸 그림 위에 덮는다 → 붙여넣기·Backspace·IME·시험 fill 이 한 번에 풀린다.
//   · 붙여넣은 공유 문구·링크에서는 코드 부분만 뽑는다(pickCode).
//   · 값 정리: 영문·숫자만 남기고 대문자, 8자에서 자른다. 하이픈·공백은 버린다(서버 정규화 I·L→1, O→0 은 그대로).
//   · 한글 조합 중(compositionstart~end)에는 거르지 않고 기다린다 — 조합이 끝나면 한 번에 거른다.
//   · 영문·숫자가 아닌 글자를 치면 칸 아래 안내(aria-live polite).
//   · 칸 폭은 360px 에서 약 36px — 누르는 자리 44px 는 높이 48px·그림 전체가 한 자리인 것으로 대신한다(이 부품의 예외).

import { type KeyboardEvent, useId, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { AppText } from "../ui/primitives";

export const CODE_LEN = 8;

/** 영문·숫자만 · 대문자 · 8자까지. */
export function cleanCode(raw: string): string {
  return raw
    .replace(/[^0-9a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, CODE_LEN);
}

/**
 * 붙여넣기·공유 문구에서 코드 뽑기(REV-145 A2) — 링크면 `?code=` 값, 아니면 「4자-4자」 모양의 마지막 것.
 * 못 찾으면 그대로(정리는 cleanCode). 짧은 입력(한 글자씩)은 건드리지 않는다.
 */
export function pickCode(raw: string): string {
  if (raw.replace(/[^0-9a-zA-Z]/g, "").length <= CODE_LEN) return raw;
  const q = /[?&]code=([0-9A-Za-z-]+)/.exec(raw);
  if (q) return q[1];
  const all = [...raw.matchAll(/(?<![0-9A-Za-z])[0-9A-Za-z]{4}-?[0-9A-Za-z]{4}(?![0-9A-Za-z])/g)];
  return all.length ? all[all.length - 1][0] : raw;
}

/** 버려지는 글자가 하이픈·공백 말고도 있었나(안내를 띄울지). */
function hasForeign(raw: string): boolean {
  return /[^0-9a-zA-Z\s-]/.test(raw);
}

const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;

export function CodeBoxes({
  value,
  onChange,
  onSubmit,
  invalid = false,
  describedBy,
  testId = "coaching-code-input",
}: {
  value: string;
  onChange: (next: string) => void;
  /** Enter — 8자일 때만 부른다(8자에서 저절로 확인하지 않는다). */
  onSubmit: () => void;
  invalid?: boolean;
  /** 오류 글자의 id(aria-describedby) */
  describedBy?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const [raw, setRaw] = useState<string | null>(null); // 조합 중일 때만 날 값
  const [focused, setFocused] = useState(false);
  const [foreign, setForeign] = useState(false);
  const hintId = useId();

  // [원본] function commit(next: string) { setForeign(hasForeign(next)); onChange(cleanCode(next)); }
  // [개선] 공유 문구·링크도 받는다 · 결과가 8자로 깔끔히 맞으면 안내를 띄우지 않는다(REV-145 A2·A9)
  function commit(next: string) {
    const picked = pickCode(next);
    const code = cleanCode(picked);
    setForeign(hasForeign(picked) && code.length < CODE_LEN);
    onChange(code);
  }
  /** 커서는 늘 끝 — 칸 그림이 끝을 가리키므로 중간에 끼워 넣지 않게(REV-145 A4) */
  function caretToEnd() {
    const el = ref.current;
    if (!el) return;
    const n = el.value.length;
    if (el.selectionStart === 0 && el.selectionEnd === n && n > 0) return; // 전체 선택은 둔다
    if (el.selectionStart !== n || el.selectionEnd !== n) el.setSelectionRange(n, n);
  }

  const chars = value.split("");
  const active = Math.min(value.length, CODE_LEN - 1);
  const ids = [describedBy, foreign ? hintId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <div className="mb-[var(--spacing-sm)]">
      {/* 투명 입력칸은 초점 테두리를 못 그린다 — 감싸개가 칸 줄 전체 테두리를 그린다(고대비에선 Highlight · REV-145 A9) */}
      <div className="relative rounded-[var(--radius-sm)] outline-offset-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--color-brand) forced-colors:has-[:focus-visible]:outline-[Highlight]">
        {/* 칸 그림 — 읽는 프로그램에는 아래 input 하나만 보인다 */}
        <div aria-hidden className="flex items-center gap-[4px]" data-testid="coaching-code-boxes">
          {Array.from({ length: CODE_LEN }, (_, i) => {
            const ch = chars[i] ?? "";
            const on = focused && i === active && (value.length < CODE_LEN || i === CODE_LEN - 1);
            const border = on
              ? "border-(--color-brand) border-2"
              : invalid
                ? "border-(--color-danger) border"
                : ch
                  ? "border-(--color-line-strong) border"
                  : "border-(--color-line) border";
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: 자리 고정 칸 8개 — 순서가 곧 정체
              <span key={i} className="contents">
                {i === CODE_LEN / 2 ? (
                  <span className="w-[12px] shrink-0 text-center text-(--color-ink2)">–</span>
                ) : null}
                <span
                  data-testid="coaching-code-box"
                  data-filled={ch ? "1" : "0"}
                  className={`flex h-[48px] min-w-0 flex-1 items-center justify-center rounded-[var(--radius-sm)] bg-(--color-surface) font-semibold text-(--color-ink) text-[length:var(--text-lg)] tabular-nums ${border}`}
                >
                  {ch}
                </span>
              </span>
            );
          })}
        </div>
        <input
          ref={ref}
          data-testid={testId}
          aria-label={t("coaching.join.boxesLabel")}
          aria-invalid={invalid || undefined}
          aria-describedby={ids}
          inputMode="text"
          // [원본] autoComplete="one-time-code" — 휴대폰이 받은 SMS 인증번호(은행 6자리 등)를 제안해 엉뚱한 값이 들어갔다(REV-145 A5)
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={raw ?? value}
          onFocus={() => {
            setFocused(true);
            caretToEnd();
          }}
          onClick={caretToEnd}
          onSelect={caretToEnd}
          onBlur={(e) => {
            setFocused(false);
            // 조합 끝 신호 없이 초점이 빠지면 날 값에 묶이지 않게(REV-145 A8)
            if (composing.current || raw !== null) {
              composing.current = false;
              setRaw(null);
              commit(e.currentTarget.value);
            }
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            setRaw(null);
            commit(e.currentTarget.value);
          }}
          onChange={(e) => {
            // [원본] 조합 중이면 늘 기다렸다 — 안드로이드 Gboard 는 영문도 조합으로 보내 칸이 비어 보였다(REV-145 A1)
            // [개선] 한글이 섞였을 때만 기다린다
            if (composing.current && HANGUL.test(e.target.value)) {
              setRaw(e.target.value);
              return;
            }
            setRaw(null);
            commit(e.target.value);
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.nativeEvent.isComposing || composing.current) return; // 조합을 끝내는 Enter 는 확인이 아니다(REV-145 A7)
            if (e.key === "Enter" && value.length === CODE_LEN) onSubmit();
          }}
          // 글자가 보이지 않게 덮는다(커서도) — 칸 그림이 값을 보인다 · 16px 은 iOS 확대 막기
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-[16px] text-transparent caret-transparent opacity-0 outline-none"
        />
      </div>
      {/* 라이브 영역은 늘 있어야 바뀐 글이 읽힌다 — 글만 갈아 끼운다 */}
      <AppText
        variant="caption"
        color="textMuted"
        className={foreign ? "mt-[var(--spacing-xs)] block" : "sr-only"}
        id={hintId}
        aria-live="polite"
        data-testid="coaching-code-hint"
      >
        {foreign ? t("coaching.join.onlyAlnum") : ""}
      </AppText>
    </div>
  );
}
