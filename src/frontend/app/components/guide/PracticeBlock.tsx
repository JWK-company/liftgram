"use client";
// 연습 블록(SPEC-058) — 운동 중 화면을 흉내 낸 작은 판. **저장소(repo)·서버를 부르지 않는다** — 상태는 이 컴포넌트 안에만.
// 칸 이름·순서는 실제 블록과 같다(세트 · 이전 · kg · 횟수 · 여유 · ✓). 모양은 SPEC-057(누르는 것 4px · 원형은 아이콘만).
// 해내면 onDone 을 한 번 부른다 — 자동으로 다음 단계로 넘기지는 않는다(booktarae 규칙).
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PracticeKind } from "@/lib/tabGuide";
import { actionBoxClass, touchPad } from "../ui/Button";

const BOX =
  "flex h-10 min-w-0 items-center justify-center rounded-[var(--radius-sm)] border border-(--color-line-strong) bg-(--color-card) font-semibold text-(--color-ink) text-[length:var(--text-md)] tabular-nums";
const OPTION =
  "min-h-[40px] rounded-[var(--radius-sm)] border px-[var(--spacing-md)] text-left text-[length:var(--text-sm)]";

function useDoneOnce(ok: boolean, onDone: () => void) {
  const fired = useRef(false);
  useEffect(() => {
    if (ok && !fired.current) {
      fired.current = true;
      onDone();
    }
  }, [ok, onDone]);
}

function Head({ oneSide = false }: { oneSide?: boolean }) {
  return (
    <div className="flex items-end gap-[2px] pb-[2px] text-(--color-ink2) text-[length:var(--text-xs)]">
      <span className="w-[34px] text-center">세트</span>
      <span className="w-[64px] text-center">이전</span>
      <span className="flex-[3] text-center">{oneSide ? "한쪽 kg" : "kg"}</span>
      <span className="flex-[2] text-center">횟수</span>
      <span className="w-[32px] text-center">여유</span>
      <span className="w-[40px] text-center">✓</span>
    </div>
  );
}

type RowProps = {
  label: ReactNode;
  prev: ReactNode;
  weight: string;
  reps: string;
  rir?: ReactNode;
  check?: ReactNode;
  done?: boolean;
  testId?: string;
};

function Row({ label, prev, weight, reps, rir, check, done = false, testId }: RowProps) {
  return (
    <div
      data-testid={testId}
      data-done={done ? "1" : "0"}
      className="flex items-center gap-[2px] border-(--color-line) border-t py-[4px]"
    >
      <span className="flex w-[34px] justify-center">{label}</span>
      <span className="flex w-[64px] justify-center text-(--color-ink2) text-[length:var(--text-sm)] tabular-nums">
        {prev}
      </span>
      <span className={`${BOX} flex-[3]`}>{weight}</span>
      <span className={`${BOX} flex-[2]`}>{reps}</span>
      <span className="flex w-[32px] justify-center">
        {rir ?? <span className={`${BOX} w-[28px]`}>–</span>}
      </span>
      <span className="flex w-[40px] justify-center">{check ?? <CheckMark done={done} />}</span>
    </div>
  );
}

function CheckMark({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border font-bold ${
        done ? "border-(--color-ok) text-(--color-ok)" : "border-(--color-line-strong) text-(--color-ink3)"
      }`}
    >
      ✓
    </span>
  );
}

function SetNo({ n }: { n: ReactNode }) {
  return <span className="font-semibold text-(--color-ink2) text-[length:var(--text-sm)]">{n}</span>;
}

/** 이전 값처럼 누를 수 있는 글자 — 누르는 자리 44px */
function PressText({
  children,
  onPress,
  testId,
  ariaLabel,
  className = "",
}: {
  children: ReactNode;
  onPress: () => void;
  testId: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel}
      onClick={onPress}
      className={`-my-[2px] inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] px-[4px] active:bg-(--color-surface-alt) ${className}`}
    >
      {children}
    </button>
  );
}

// ── 1. 이전 값 채우기 ────────────────────────────────────────────────────────
function PrevFill({ onDone }: { onDone: () => void }) {
  const [filled, setFilled] = useState(false);
  useDoneOnce(filled, onDone);
  return (
    <>
      <Head />
      <Row
        label={<SetNo n={1} />}
        prev={
          <PressText testId="practice-prev" ariaLabel="이전 60kg 10회 채우기" onPress={() => setFilled(true)}>
            60×10
          </PressText>
        }
        weight={filled ? "60" : ""}
        reps={filled ? "10" : ""}
      />
      <Hint>👆 「60×10」을 눌러 보세요</Hint>
    </>
  );
}

// ── 2. 세트 종류 ─────────────────────────────────────────────────────────────
const SET_TYPES = [
  { k: "normal", mark: "1", name: "일반 세트" },
  { k: "warmup", mark: "W", name: "워밍업 (W) — 볼륨·PR 에 안 들어가요" },
  { k: "drop", mark: "D", name: "드롭세트 (D) — 쉬지 않고 무게를 내려요" },
  { k: "failed", mark: "F", name: "실패 (F) — 목표 횟수를 못 채웠어요" },
  { k: "top", mark: "T", name: "탑세트 (T) — 그날 가장 무거운 세트" },
  { k: "backoff", mark: "B", name: "백오프 (B) — 탑 뒤에 가볍게" },
] as const;

function SetType({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [k, setK] = useState<(typeof SET_TYPES)[number]["k"]>("normal");
  useDoneOnce(k !== "normal", onDone);
  const cur = SET_TYPES.find((x) => x.k === k) ?? SET_TYPES[0];
  return (
    <>
      <Head />
      <Row
        label={
          <PressText
            testId="practice-set-number"
            ariaLabel="세트 1 — 종류 바꾸기"
            onPress={() => setOpen((v) => !v)}
            className={`font-bold ${k === "normal" ? "text-(--color-ink)" : "text-(--color-brand)"}`}
          >
            {cur.mark}
          </PressText>
        }
        prev="60×10"
        weight="60"
        reps="10"
      />
      {open ? (
        <fieldset
          aria-label="세트 종류"
          className="m-0 min-w-0 border-0 p-0 mt-[var(--spacing-xs)] flex flex-col gap-[4px]"
        >
          {SET_TYPES.map((x) => (
            <button
              key={x.k}
              type="button"
              data-testid={`practice-type-${x.k}`}
              aria-pressed={x.k === k}
              onClick={() => {
                setK(x.k);
                setOpen(false);
              }}
              className={`${OPTION} ${x.k === k ? "border-(--color-brand) font-semibold text-(--color-ink)" : "border-(--color-line-strong) text-(--color-ink2)"}`}
            >
              {x.name}
            </button>
          ))}
        </fieldset>
      ) : (
        <Hint>👆 세트 번호 「{cur.mark}」를 눌러 보세요</Hint>
      )}
    </>
  );
}

// ── 3. 세트 방식 ─────────────────────────────────────────────────────────────
type Planned = { mark: string; w: string; r: string };
const SCHEMES: { k: string; name: string; desc: string; rows: Planned[] }[] = [
  {
    k: "straight",
    name: "일반",
    desc: "같은 무게·횟수로 여러 세트",
    rows: [
      { mark: "1", w: "60", r: "10" },
      { mark: "2", w: "60", r: "10" },
      { mark: "3", w: "60", r: "10" },
    ],
  },
  {
    k: "topBackoff",
    name: "탑세트 + 백오프",
    desc: "무거운 1세트 뒤 가볍게 볼륨 · 백오프는 탑의 85%",
    rows: [
      { mark: "T", w: "80", r: "5" },
      { mark: "B", w: "68", r: "8" },
      { mark: "B", w: "68", r: "8" },
    ],
  },
  {
    k: "fiveByFive",
    name: "스트렝스 5×5",
    desc: "같은 무게로 5회 5세트 · 다 성공하면 다음엔 무게를 올려요",
    rows: [1, 2, 3, 4, 5].map((n) => ({ mark: String(n), w: "70", r: "5" })),
  },
  {
    k: "pyramid",
    name: "피라미드",
    desc: "무게를 올리며 횟수를 줄여요",
    rows: [
      { mark: "1", w: "50", r: "12" },
      { mark: "2", w: "60", r: "10" },
      { mark: "3", w: "70", r: "8" },
    ],
  },
  {
    k: "reversePyramid",
    name: "역피라미드",
    desc: "가장 무거운 세트를 먼저 · 백오프는 탑의 90%·80%",
    rows: [
      { mark: "T", w: "70", r: "6" },
      { mark: "B", w: "63", r: "8" },
      { mark: "B", w: "56", r: "10" },
    ],
  },
  {
    k: "dropSet",
    name: "드롭세트",
    desc: "마지막에 쉬지 않고 무게를 내려 한계까지",
    rows: [
      { mark: "1", w: "60", r: "10" },
      { mark: "2", w: "60", r: "10" },
      { mark: "D", w: "45", r: "최대" },
      { mark: "D", w: "30", r: "최대" },
    ],
  },
];

function Scheme({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [k, setK] = useState("straight");
  useDoneOnce(k !== "straight", onDone);
  const cur = SCHEMES.find((s) => s.k === k) ?? SCHEMES[0];
  return (
    <>
      <button
        type="button"
        data-testid="practice-scheme"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="mb-[var(--spacing-xs)] inline-flex min-h-[40px] items-center gap-[4px] rounded-[var(--radius-sm)] border border-(--color-line-strong) px-[var(--spacing-md)] text-(--color-ink) text-[length:var(--text-sm)]"
      >
        세트 방식: {cur.name} ▾
      </button>
      {open ? (
        <fieldset
          aria-label="세트 방식"
          className="m-0 min-w-0 border-0 p-0 mb-[var(--spacing-sm)] flex flex-col gap-[4px]"
        >
          {SCHEMES.map((s) => (
            <button
              key={s.k}
              type="button"
              data-testid={`practice-scheme-${s.k}`}
              aria-pressed={s.k === k}
              onClick={() => {
                setK(s.k);
                setOpen(false);
              }}
              className={`${OPTION} py-[6px] ${s.k === k ? "border-(--color-brand)" : "border-(--color-line-strong)"}`}
            >
              <span className="block font-semibold text-(--color-ink)">{s.name}</span>
              <span className="block text-(--color-ink2) text-[length:var(--text-xs)]">{s.desc}</span>
            </button>
          ))}
        </fieldset>
      ) : null}
      <Head />
      <div data-testid="practice-scheme-rows" data-scheme={k}>
        {cur.rows.map((r, idx) => (
          <Row
            // biome-ignore lint/suspicious/noArrayIndexKey: 고정된 연습 표
            key={idx}
            label={<SetNo n={r.mark} />}
            prev="–"
            weight={r.w}
            reps={r.r}
          />
        ))}
      </div>
      {!open && k === "straight" ? <Hint>👆 「세트 방식」을 눌러 다른 방식을 골라 보세요</Hint> : null}
    </>
  );
}

// ── 4. 조합(변형) ────────────────────────────────────────────────────────────
const COMBOS = [
  { k: "base", name: "기본", prev: "60×10" },
  { k: "hammer", name: "해머스트렝스", prev: "70×8" },
  { k: "rope", name: "로프 부착물", prev: "–" },
];

function Variant({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [k, setK] = useState("base");
  useDoneOnce(k !== "base", onDone);
  const cur = COMBOS.find((c) => c.k === k) ?? COMBOS[0];
  return (
    <>
      <p className="font-bold text-(--color-ink) text-[length:var(--text-md)]">케이블 푸시다운</p>
      <button
        type="button"
        data-testid="practice-variant"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="mb-[var(--spacing-xs)] inline-flex min-h-[40px] items-center rounded-[var(--radius-sm)] px-[4px] text-(--color-ink2) text-[length:var(--text-sm)] active:bg-(--color-surface-alt)"
      >
        조합: {cur.name} ▾
      </button>
      {open ? (
        <fieldset
          aria-label="조합"
          className="m-0 min-w-0 border-0 p-0 mb-[var(--spacing-sm)] flex flex-col gap-[4px]"
        >
          {COMBOS.map((c) => (
            <button
              key={c.k}
              type="button"
              data-testid={`practice-combo-${c.k}`}
              aria-pressed={c.k === k}
              onClick={() => {
                setK(c.k);
                setOpen(false);
              }}
              className={`${OPTION} ${c.k === k ? "border-(--color-brand) font-semibold text-(--color-ink)" : "border-(--color-line-strong) text-(--color-ink2)"}`}
            >
              {c.name}{" "}
              <span className="text-(--color-ink3) text-[length:var(--text-xs)]">· 지난 기록 {c.prev}</span>
            </button>
          ))}
        </fieldset>
      ) : null}
      <Head />
      <Row
        label={<SetNo n={1} />}
        prev={<span data-testid="practice-variant-prev">{cur.prev}</span>}
        weight=""
        reps=""
      />
      <Hint>
        {k === "base"
          ? "👆 「조합」을 눌러 다른 브랜드·부착물을 골라 보세요"
          : cur.prev === "–"
            ? "이 조합으로는 아직 기록이 없어요 — 「이전」이 비어요. 기록은 조합별로 따로 쌓여요."
            : "「이전」이 이 조합의 지난 기록으로 바뀌었어요. 팔·그립은 세트 번호 옆 옵션에서 이 세트만 바꿀 수 있어요."}
      </Hint>
    </>
  );
}

// ── 5. 완료와 휴식 ───────────────────────────────────────────────────────────
function useFakeRest(start: number) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left == null || left <= 0) return;
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // 연습용 빠른 시계 — 0.1초마다 1초(움직임 줄이기면 실제 속도)
    const id = setTimeout(() => setLeft((x) => (x == null ? x : Math.max(0, x - 1))), reduce ? 1000 : 100);
    return () => clearTimeout(id);
  }, [left]);
  return [left, () => setLeft(start)] as const;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Done({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(false);
  const [left, startRest] = useFakeRest(90);
  useDoneOnce(done, onDone);
  return (
    <>
      <Head />
      <Row
        label={<SetNo n={1} />}
        prev="60×10"
        weight="60"
        reps="10"
        done={done}
        check={
          <button
            type="button"
            data-testid="practice-check"
            aria-pressed={done}
            aria-label="세트 1 완료"
            onClick={() => {
              if (done) return;
              setDone(true);
              startRest();
            }}
          >
            <CheckMark done={done} />
          </button>
        }
      />
      {left != null ? (
        <div
          data-testid="practice-rest"
          className="mt-[var(--spacing-sm)] flex items-center justify-between rounded-[var(--radius-lg)] bg-(--color-ink) px-[var(--spacing-md)] py-[var(--spacing-sm)] font-semibold text-(--color-surface) tabular-nums"
        >
          <span>{left > 0 ? `휴식 ${clock(left)}` : "휴식 끝 — 다음 세트!"}</span>
          <span className="text-[length:var(--text-xs)] opacity-80">연습용 빠른 시계</span>
        </div>
      ) : (
        <Hint>👆 ✓ 를 눌러 세트를 끝내 보세요</Hint>
      )}
    </>
  );
}

// ── 6. 슈퍼세트 — 길게 눌러 이 종목만 ──────────────────────────────────────────
const LONG_MS = 500;

function LongDone({ onDone }: { onDone: () => void }) {
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [usedLong, setUsedLong] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  useDoneOnce(usedLong, onDone);

  const begin = () => {
    fired.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fired.current = true;
      setA(true);
      setUsedLong(true);
      setMsg("길게 눌러 이 종목(벤치프레스)만 완료했어요");
    }, LONG_MS);
  };
  const end = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!fired.current) {
      setA(true);
      setB(true);
      setMsg("묶음 전체가 완료됐어요 · 이 종목만은 ✓ 를 길게 눌러요");
    }
    fired.current = false;
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <>
      <p className="text-(--color-ink2) text-[length:var(--text-xs)]">슈퍼세트 — 벤치프레스 + 바벨 로우</p>
      <Head />
      <Row
        testId="practice-ss-a"
        label={<SetNo n="A1" />}
        prev="60×10"
        weight="60"
        reps="10"
        done={a}
        check={
          <button
            type="button"
            data-testid="practice-ss-check"
            aria-label="벤치프레스 세트 완료 — 길게 누르면 이 종목만"
            aria-describedby="practice-long-help"
            onPointerDown={begin}
            onPointerUp={end}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
                e.preventDefault();
                begin();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                end();
              }
            }}
            className="select-none [-webkit-touch-callout:none]"
          >
            <CheckMark done={a} />
          </button>
        }
      />
      <Row testId="practice-ss-b" label={<SetNo n="B1" />} prev="50×12" weight="50" reps="12" done={b} />
      <p id="practice-long-help" className="sr-only">
        키보드는 Enter 나 Space 를 0.5초 이상 누르고 있으면 길게 누른 것으로 봐요.
      </p>
      <Hint>{msg ?? "👆 A1 의 ✓ 를 짧게, 또는 길게(0.5초) 눌러 보세요"}</Hint>
      {a || b ? (
        <button
          type="button"
          data-testid="practice-ss-reset"
          onClick={() => {
            setA(false);
            setB(false);
            setMsg(null);
          }}
          // [원본] className="mt-[4px] min-h-[40px] rounded-[var(--radius-sm)] px-[4px] text-(--color-ink2) …" — 회색 글자만(SPEC-061 · REV-149 6)
          className={`${actionBoxClass()} ${touchPad} mt-[4px] min-h-[40px] self-start px-[var(--spacing-md)] text-[length:var(--text-sm)]`}
        >
          다시 해 보기
        </button>
      ) : null}
    </>
  );
}

// ── 7. 여유(RIR) ─────────────────────────────────────────────────────────────
const RIR_TEXT: Record<string, string> = {
  "0": "0 — 한계까지 했어요. 한 개도 더 못 해요.",
  "1": "1 — 한 개 더 할 수 있었어요.",
  "2": "2 — 두 개 더 가능. 근성장에 알맞은 강도예요.",
  "3": "3 — 여유 있어요. 다음엔 무게를 올려 봐도 돼요.",
  "4+": "4+ — 아주 여유 있어요. 워밍업에 가까워요.",
};

function Rir({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<string | null>(null);
  useDoneOnce(v != null, onDone);
  return (
    <>
      <Head />
      <Row
        label={<SetNo n={1} />}
        prev="60×10"
        weight="60"
        reps="10"
        done
        rir={
          <button
            type="button"
            data-testid="practice-rir"
            aria-label="여유 고르기"
            aria-expanded={open}
            onClick={() => setOpen((x) => !x)}
            className={`${BOX} w-[28px]`}
          >
            {v ?? "–"}
          </button>
        }
      />
      {open ? (
        <fieldset
          aria-label="여유"
          className="m-0 min-w-0 border-0 p-0 mt-[var(--spacing-xs)] flex flex-wrap gap-[4px]"
        >
          {Object.keys(RIR_TEXT).map((k) => (
            <button
              key={k}
              type="button"
              data-testid={`practice-rir-${k}`}
              aria-pressed={k === v}
              onClick={() => {
                setV(k);
                setOpen(false);
              }}
              className={`min-h-[40px] min-w-[44px] rounded-[var(--radius-sm)] border px-[var(--spacing-sm)] text-[length:var(--text-sm)] ${k === v ? "border-(--color-brand) font-semibold" : "border-(--color-line-strong)"}`}
            >
              {k}
            </button>
          ))}
        </fieldset>
      ) : null}
      <Hint>{v ? RIR_TEXT[v] : "👆 「여유」 칸을 눌러 몇 개 더 할 수 있었는지 골라 보세요"}</Hint>
    </>
  );
}

// ── 8. 금색 PR ───────────────────────────────────────────────────────────────
function PrFill({ onDone }: { onDone: () => void }) {
  const [filled, setFilled] = useState(false);
  useDoneOnce(filled, onDone);
  return (
    <>
      <p className="font-bold text-(--color-ink) text-[length:var(--text-md)]">바벨 스쿼트</p>
      <button
        type="button"
        data-testid="practice-pr"
        aria-label="PR 80kg 5회 — 누르면 다음 세트에 채워요"
        onClick={() => setFilled(true)}
        className="mb-[var(--spacing-xs)] inline-flex min-h-[40px] items-center rounded-[var(--radius-sm)] px-[4px] font-bold text-(--color-pr) text-[length:var(--text-sm)] active:bg-(--color-surface-alt)"
      >
        PR 80kg×5
      </button>
      <Head />
      <Row label={<SetNo n={1} />} prev="75×5" weight="75" reps="5" done />
      <Row label={<SetNo n={2} />} prev="75×5" weight={filled ? "80" : ""} reps={filled ? "5" : ""} />
      <Hint>
        {filled
          ? "아직 안 한 첫 세트(2세트)에 PR 무게×횟수를 채웠어요."
          : "👆 금색 「PR 80kg×5」를 눌러 보세요"}
      </Hint>
    </>
  );
}

// ── 9. 원판 한쪽 무게 ────────────────────────────────────────────────────────
function Plate({ onDone }: { onDone: () => void }) {
  const [oneSide, setOneSide] = useState(false);
  const [toggled, setToggled] = useState(false);
  useDoneOnce(toggled, onDone);
  return (
    <>
      <p className="font-bold text-(--color-ink) text-[length:var(--text-md)]">레그 프레스 (원판 머신)</p>
      <button
        type="button"
        data-testid="practice-plate"
        aria-pressed={oneSide}
        onClick={() => {
          setOneSide((x) => !x);
          setToggled(true);
        }}
        className={`mb-[var(--spacing-xs)] inline-flex min-h-[40px] items-center rounded-[var(--radius-sm)] border px-[var(--spacing-md)] text-[length:var(--text-sm)] ${
          oneSide
            ? "border-(--color-brand) font-semibold text-(--color-ink)"
            : "border-(--color-line-strong) text-(--color-ink2)"
        }`}
      >
        한쪽 무게로 입력 {oneSide ? "켜짐" : "꺼짐"}
      </button>
      <Head oneSide={oneSide} />
      <Row label={<SetNo n={1} />} prev="20×10" weight="20" reps="10" />
      <Hint>
        <span data-testid="practice-plate-calc">
          {oneSide
            ? "칸에는 한쪽 20kg 이 남고, 볼륨·PR 은 양쪽 40kg × 10 으로 계산해요."
            : "지금은 적은 20kg 그대로 계산해요. 「한쪽 무게로 입력」을 켜 보세요."}
        </span>
      </Hint>
    </>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="mt-[var(--spacing-xs)] text-(--color-ink2) text-[length:var(--text-xs)]">{children}</p>
  );
}

export function PracticeBlock({ kind, onDone }: { kind: PracticeKind; onDone: () => void }) {
  return (
    <div
      data-testid="guide-practice"
      data-kind={kind}
      className="border-(--color-line) border-b pb-[var(--spacing-xs)]"
    >
      {kind === "prevFill" ? <PrevFill onDone={onDone} /> : null}
      {kind === "setType" ? <SetType onDone={onDone} /> : null}
      {kind === "scheme" ? <Scheme onDone={onDone} /> : null}
      {kind === "variant" ? <Variant onDone={onDone} /> : null}
      {kind === "done" ? <Done onDone={onDone} /> : null}
      {kind === "longDone" ? <LongDone onDone={onDone} /> : null}
      {kind === "rir" ? <Rir onDone={onDone} /> : null}
      {kind === "prFill" ? <PrFill onDone={onDone} /> : null}
      {kind === "plate" ? <Plate onDone={onDone} /> : null}
    </div>
  );
}
