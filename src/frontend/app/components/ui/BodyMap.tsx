// @plm SRS-075 SRS-076 SRS-090  근육 지도 — 앞·뒤 인라인 SVG 12구역(ADR-039 · UX U-4·U-12·U-13)
//
// [개선 · SRS-090 · ADR-044] 그림 = MuscleMap(MIT) 실제 근육 윤곽(bodyMapPaths.ts) · 칠하기 = 회색 바탕 위 주황(brandVivid) 농도.
//   · 단계 0 = 회색(--color-line) · 1~3 = brandVivid 불투명도 45%·75%·100% + brand 윤곽선(회색 카드 바탕에서도 3:1).
//   · 선택 근육 = ink(무채 진함) · 머리카락 = ink3 · 그 밖 부위 = 회색 바탕.
//   · 아래 옛 실루엣(FRONT/BACK·zoneStyle·Body)은 원복용으로 남긴다 — 호출부는 주석 처리.
//
// 그림은 「대략 어디를 했나」만 보여 준다. 단계 사이 구분은 그림이 아니라 옆·아래의 **숫자 목록**이 맡는다(U-4).
// ↓ 아래 「단계·색」 두 줄과 「구역 모양」 단락은 [원본] 옛 실루엣 설명이다(지금 그림은 위 [개선] 줄) — full/mini 접근성 규칙은 그대로.
//   · 단계: 0 = 안 함(윤곽선만 `--color-line-strong`) · 칠함 1~3(30%·60%·100%). 30% 구역은 진한 윤곽선(`--color-ink2`)을 둘러
//     「칠한 구역 vs 바탕」 3:1 을 윤곽선으로 확보한다.
//   · 색(채택 시안 — 보고서 p2-ui-report): **무채 농도(`--color-ink2`) + 선택한 근육만 brand-vivid**.
//     빨강 농도안(tone="brand")은 시안 비교용으로 남겨 둔다 — 화면 정리 규칙(빨강 = 주 행동·완료·선택, 화면별 빨강 ≤2종)과
//     부딪히고 몸 전체가 빨갛게 칠해지면 통증·부상처럼 읽혀서 채택하지 않았다.
//   · full: `<svg role="img" aria-label="많이 한 근육: 가슴 9세트…">` 한 덩어리 — 안쪽 구역은 img 의 표시용 자식(구역마다 초점이 멈추지 않게).
//     숫자 목록(`<ul>`)은 부르는 쪽이 그림 아래에 실제 글자로 둔다(U-13). `<title>` 은 마우스 툴팁 용도로만.
//   · mini: 2단계(주근육 = 진함 · 보조근 = 옅음)만, 통째로 aria-hidden(옆 caption 글자 「가슴·삼두 중심」이 대신한다 · U-12).
//
// 구역 모양은 픽토그램과 같은 결(둥근 끝·둥근 이음)의 단순 실루엣이다. 왼쪽 절반만 그리고 오른쪽은 거울로 뒤집는다.
// 앞: 어깨·가슴·이두·전완·복근·대퇴사두·종아리(정강이 쪽) / 뒤: 승모·어깨(뒤)·등·삼두·전완·둔근·햄스트링·종아리.
import type { CSSProperties } from "react";
import { MAP_MUSCLES, type MapMuscle, type MuscleLoad, muscleShadeLevel } from "@app/core/domain/muscleLoad";
import { muscleLabel } from "@app/core";
import { lang, t } from "@/lib/i18n";
import { BODY_PATHS } from "./bodyMapPaths";

// ── 모양 데이터(한 몸 = 폭 100 · 높이 200 좌표, 가운데 x=50) ──────────────────────────────

type Shape = { d: string; mirror: boolean };

/** 구역이 아닌 몸(머리·목·손·골반·발) — 늘 윤곽선만 */
const FRONT_BASE: Shape[] = [
  { d: "M50 4 a11 11 0 1 0 0.01 0 Z", mirror: false }, // 머리
  { d: "M45 25 L55 25 L55 31 L45 31 Z", mirror: false }, // 목
  { d: "M16 104 C14 108 15 113 19 114 C23 114 24 109 23 104 Z", mirror: true }, // 손
  { d: "M38 81 C43 85 57 85 62 81 L64 95 C60 99 55 101 50 101 C45 101 40 99 36 95 Z", mirror: false }, // 골반
  { d: "M38 187 L47 187 L48 192 C44 195 38 195 34 192 Z", mirror: true }, // 발
];
const BACK_BASE: Shape[] = [
  { d: "M50 4 a11 11 0 1 0 0.01 0 Z", mirror: false },
  { d: "M16 104 C14 108 15 113 19 114 C23 114 24 109 23 104 Z", mirror: true },
  { d: "M38 187 L47 187 L48 192 C44 195 38 195 34 192 Z", mirror: true },
];

const SHOULDER = "M37 32 C29 31 22 35 21 44 C21 48 22 51 23 53 C26 48 31 43 37 41 Z";
const UPPER_ARM = "M23 56 C21 62 20 67 21 73 L28 74 C30 67 32 60 35 49 C30 50 26 52 23 56 Z";
const FOREARM = "M21 77 C19 85 17 93 16 101 L23 102 C26 93 28 85 29 78 Z";

const FRONT: Partial<Record<MapMuscle, Shape[]>> = {
  shoulders: [{ d: SHOULDER, mirror: true }],
  chest: [{ d: "M49 33 L40 33 C37 36 36 43 37 50 C41 54 45 54 49 52 Z", mirror: true }],
  biceps: [{ d: UPPER_ARM, mirror: true }],
  forearms: [{ d: FOREARM, mirror: true }],
  abs: [{ d: "M39 56 C43 58 57 58 61 56 L61 72 C60 77 56 80 50 80 C44 80 40 77 39 72 Z", mirror: false }],
  quads: [
    {
      d: "M36 98 C34 110 34 124 37 138 C40 140 45 140 48 138 C49 126 50 113 49 103 C45 102 40 100 36 98 Z",
      mirror: true,
    },
  ],
  calves: [
    {
      d: "M37 147 C35 158 36 172 39 184 L46 184 C48 172 48 158 47 147 C44 145 40 145 37 147 Z",
      mirror: true,
    },
  ],
};

const BACK: Partial<Record<MapMuscle, Shape[]>> = {
  traps: [
    { d: "M50 22 L45 25 C42 29 38 31 33 33 L40 40 L50 54 L60 40 L67 33 C62 31 58 29 55 25 Z", mirror: false },
  ],
  shoulders: [{ d: SHOULDER, mirror: true }],
  back: [{ d: "M36 42 C34 51 35 63 39 73 C42 77 46 79 49 79 L49 58 L39 43 Z", mirror: true }],
  triceps: [{ d: UPPER_ARM, mirror: true }],
  forearms: [{ d: FOREARM, mirror: true }],
  glutes: [
    { d: "M37 84 C35 92 37 100 43 102 C47 103 49 100 49 97 L49 83 C45 81 40 81 37 84 Z", mirror: true },
  ],
  hamstrings: [
    {
      d: "M36 106 C34 117 35 128 38 139 L48 139 C49 128 50 117 49 107 C45 104 40 104 36 106 Z",
      mirror: true,
    },
  ],
  calves: [
    {
      d: "M37 147 C33 155 34 166 39 176 L40 184 L46 184 L47 176 C50 166 50 155 47 147 C44 145 40 145 37 147 Z",
      mirror: true,
    },
  ],
};

/** 한 몸이 실제로 차지하는 가로 범위(14~86) — 둘을 나란히 놓을 때 쓰는 자르기 */
const BODY_X0 = 13;
const BODY_W = 74;
const GAP = 8;
// biome-ignore lint/correctness/noUnusedVariables: 옛 실루엣 원복용 보존(SRS-090 · 코드 보존 규칙)
const VIEW_W = BODY_W * 2 + GAP;
// biome-ignore lint/correctness/noUnusedVariables: 옛 실루엣 원복용 보존(SRS-090)
const VIEW_H = 198;

// ── 칠하기 ──────────────────────────────────────────────────────────────────

export type BodyMapTone = "neutral" | "brand";
/** 0 = 안 함 · 1~3 = 30%·60%·100% · "sel" = 선택한 근육(brand) */
type Level = 0 | 1 | 2 | 3 | "sel";

function zoneStyle(level: Level, tone: BodyMapTone, strokeWidth: number): CSSProperties {
  const ink = tone === "brand" ? "var(--color-brand-vivid)" : "var(--color-ink2)";
  const base: CSSProperties = { strokeWidth, strokeLinejoin: "round", strokeLinecap: "round" };
  if (level === "sel")
    return { ...base, fill: "var(--color-brand-vivid)", fillOpacity: 1, stroke: "var(--color-brand)" };
  if (level === 0) return { ...base, fill: "none", stroke: "var(--color-line-strong)" };
  const op = level === 3 ? 1 : level === 2 ? 0.6 : 0.3;
  // 30% 구역은 바탕 대비 3:1 이 안 나와 진한 윤곽선(ink2)을 두른다(U-4). 나머지는 칠한 색 그대로 윤곽.
  return { ...base, fill: ink, fillOpacity: op, stroke: level === 1 ? "var(--color-ink2)" : ink };
}

const BASE_STYLE = (strokeWidth: number): CSSProperties => ({
  fill: "none",
  stroke: "var(--color-line-strong)",
  strokeWidth,
  strokeLinejoin: "round",
  strokeLinecap: "round",
});

function ShapePaths({
  shapes,
  style,
  muscle,
  level,
  title,
}: {
  shapes: Shape[];
  style: CSSProperties;
  muscle?: MapMuscle;
  level?: Level;
  title?: string;
}) {
  return (
    <g data-muscle={muscle} data-level={level === undefined ? undefined : String(level)}>
      {title ? <title>{title}</title> : null}
      {shapes.map((s) => (
        <g key={s.d + (s.mirror ? "m" : "")}>
          <path d={s.d} style={style} vectorEffect="non-scaling-stroke" />
          {s.mirror ? (
            <path
              d={s.d}
              style={style}
              vectorEffect="non-scaling-stroke"
              transform="translate(100 0) scale(-1 1)"
            />
          ) : null}
        </g>
      ))}
    </g>
  );
}

// biome-ignore lint/correctness/noUnusedVariables: 옛 실루엣 원복용 보존(SRS-090) — 호출부는 주석
function Body({
  side,
  levelOf,
  tone,
  strokeWidth,
  titles,
}: {
  side: "front" | "back";
  levelOf: (m: MapMuscle) => Level;
  tone: BodyMapTone;
  strokeWidth: number;
  titles: boolean;
}) {
  const zones = side === "front" ? FRONT : BACK;
  const base = side === "front" ? FRONT_BASE : BACK_BASE;
  const dx = side === "front" ? -BODY_X0 : BODY_W + GAP - BODY_X0;
  return (
    <g transform={`translate(${dx} 0)`} data-side={side}>
      <ShapePaths shapes={base} style={BASE_STYLE(strokeWidth)} />
      {MAP_MUSCLES.map((m) => {
        const shapes = zones[m];
        if (!shapes) return null;
        const level = levelOf(m);
        return (
          <ShapePaths
            key={m}
            shapes={shapes}
            muscle={m}
            level={level}
            style={zoneStyle(level, tone, strokeWidth)}
            title={titles ? muscleLabel(m, lang) : undefined}
          />
        );
      })}
    </g>
  );
}

// ── 실제 근육 그림(SRS-090) ─────────────────────────────────────────────────

/** 앞·뒤 한 몸의 그릴 범위(MuscleMap 좌표) — 빈 여백을 잘라 둘을 붙인다. */
const REAL_CROP: Record<"front" | "back", [number, number, number, number]> = {
  // 경로 getBBox 실측(앞 x 53~675 · 뒤 x 773~1394 · y 96~1342) + 여백 5
  front: [48, 92, 632, 1254],
  back: [767, 92, 632, 1254],
};
const REAL_GAP = 40;
const REAL_W = REAL_CROP.front[2];
const REAL_H = REAL_CROP.front[3];
const REAL_VIEW_W = REAL_W * 2 + REAL_GAP;
const REAL_VIEW_H = REAL_H;

function realZoneStyle(level: Level): CSSProperties {
  // 선택 근육 = ink(무채 진함) — 주황 단계 어느 것과도 섞이지 않는다
  if (level === "sel")
    return { fill: "var(--color-ink)", stroke: "var(--color-ink)", strokeWidth: 1, strokeLinejoin: "round" };
  if (level === 0) return { fill: "var(--color-line)" };
  // 진할수록 많이: brandVivid 불투명도 45%·75%·100% — 라이트·다크 어느 쪽이든 바탕에 가까울수록 적다.
  // 칠은 회색 카드 바탕(#F7F7F7 등)에서 3:1 이 안 나올 수 있어 칠한 단계는 모두 brand 윤곽선을 두른다(U-4 와 같은 방법).
  return {
    fill: "var(--color-brand-vivid)",
    fillOpacity: level === 3 ? 1 : level === 2 ? 0.75 : 0.45,
    stroke: "var(--color-brand)",
    strokeWidth: 0.75,
    strokeLinejoin: "round",
  };
}

function RealBody({
  side,
  levelOf,
  titles,
}: {
  side: "front" | "back";
  levelOf: (m: MapMuscle) => Level;
  titles: boolean;
}) {
  const data = BODY_PATHS[side];
  const [x, y, w, h] = REAL_CROP[side];
  return (
    <svg
      x={side === "front" ? 0 : REAL_W + REAL_GAP}
      y={0}
      width={REAL_W}
      height={REAL_H}
      viewBox={`${x} ${y} ${w} ${h}`}
      data-side={side}
      overflow="visible"
      aria-hidden="true"
    >
      {data.base.map((d) => (
        <path key={d} d={d} style={{ fill: "var(--color-line)" }} />
      ))}
      {data.hair.map((d) => (
        <path key={d} d={d} style={{ fill: "var(--color-ink3)" }} />
      ))}
      {MAP_MUSCLES.map((m) => {
        const paths = data.zones[m];
        if (!paths) return null;
        const level = levelOf(m);
        const style = realZoneStyle(level);
        return (
          <g key={m} data-muscle={m} data-level={String(level)}>
            {titles ? <title>{muscleLabel(m, lang)}</title> : null}
            {paths.map((d) => (
              <path key={d} d={d} style={style} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ── 접근 이름 ────────────────────────────────────────────────────────────────

/** 세트 수 표기 — 0.5 단위(보조근육)만 소수 한 자리 */
export function formatMuscleSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 「많이 한 근육: 가슴 9세트, 등 6세트 …」 — full 그림의 aria-label. 비었으면 「아직 한 근육이 없어요」. */
export function muscleMapAriaLabel(load: MuscleLoad): string {
  const rows = MAP_MUSCLES.map((m) => ({ m, n: load.byMuscle[m] }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || MAP_MUSCLES.indexOf(a.m) - MAP_MUSCLES.indexOf(b.m));
  if (!rows.length) return t("muscleMap.ariaEmpty");
  const list = rows
    .map((r) => `${muscleLabel(r.m, lang)} ${t("muscleMap.setsCount", { count: formatMuscleSets(r.n) })}`)
    .join(", ");
  return t("muscleMap.ariaSummary", { list });
}

// ── 바깥 ────────────────────────────────────────────────────────────────────

/** 큰 그림 — 단계 칠하기(0~3) + 선택 근육 brand. 숫자 목록 `<ul>` 은 부르는 쪽이 아래에 둔다. */
export function BodyMapFull({
  load,
  selected = null,
  // 옛 실루엣 전용(새 그림은 늘 주황 · ADR-044) — 부르는 쪽 호환을 위해 받기만 한다. 원복 시 `_tone` → `tone` 으로 되돌린다.
  tone: _tone = "neutral",
  height = 180,
  ariaLabel,
  testId,
}: {
  load: MuscleLoad;
  selected?: MapMuscle | null;
  tone?: BodyMapTone;
  height?: number;
  /** 기본 = muscleMapAriaLabel(load) */
  ariaLabel?: string;
  testId?: string;
}) {
  const levelOf = (m: MapMuscle): Level => (m === selected ? "sel" : muscleShadeLevel(load, m));
  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? muscleMapAriaLabel(load)}
      data-testid={testId}
      data-size="full"
      // [원본] viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} · width={(height * VIEW_W) / VIEW_H}
      viewBox={`0 0 ${REAL_VIEW_W} ${REAL_VIEW_H}`}
      height={height}
      width={(height * REAL_VIEW_W) / REAL_VIEW_H}
      className="block shrink-0"
    >
      {/* role="img" 의 자식은 표시용(presentational children)이라 보조기기가 구역을 따로 읽지 않는다 — aria-hidden 을 따로 달지 않는다 */}
      <g>
        {/* [원본] 원복 시 아래 두 줄을 살리고 RealBody 를 주석 처리(viewBox·width 도 [원본]으로)
        <Body side="front" levelOf={levelOf} tone={tone} strokeWidth={1.25} titles />
        <Body side="back" levelOf={levelOf} tone={tone} strokeWidth={1.25} titles />
        */}
        {/* [개선] 실제 근육 그림 · 주황 농도(tone 은 옛 그림 전용 — 새 그림은 늘 주황) @plm SRS-090 */}
        <RealBody side="front" levelOf={levelOf} titles />
        <RealBody side="back" levelOf={levelOf} titles />
      </g>
    </svg>
  );
}

/** 작은 그림(루틴 카드) — 주근육 진함 · 보조근 옅음 2단계만, 통째로 aria-hidden. */
export function BodyMapMini({
  primary,
  secondary,
  tone: _tone = "neutral", // 원복 시 `tone` 으로(위 BodyMapFull 주석)
  height = 56,
  testId,
}: {
  primary: readonly MapMuscle[];
  secondary: readonly MapMuscle[];
  tone?: BodyMapTone;
  height?: number;
  testId?: string;
}) {
  const p = new Set(primary);
  const s = new Set(secondary);
  // 작은 크기에서는 30% 가 바탕에 묻힌다 — 보조근은 60%(2단계)로 칠한다.
  const levelOf = (m: MapMuscle): Level => (p.has(m) ? 3 : s.has(m) ? 2 : 0);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-testid={testId}
      data-size="mini"
      // [원본] viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} · width={Math.round((height * VIEW_W) / VIEW_H)}
      viewBox={`0 0 ${REAL_VIEW_W} ${REAL_VIEW_H}`}
      height={height}
      width={bodyMapMiniWidth(height)}
      className="block shrink-0"
    >
      {/* [원본] 원복 시 아래 두 줄을 살리고 RealBody 를 주석 처리
      <Body side="front" levelOf={levelOf} tone={tone} strokeWidth={1} titles={false} />
      <Body side="back" levelOf={levelOf} tone={tone} strokeWidth={1} titles={false} />
      */}
      {/* [개선] @plm SRS-090 */}
      <RealBody side="front" levelOf={levelOf} titles={false} />
      <RealBody side="back" levelOf={levelOf} titles={false} />
    </svg>
  );
}

/** mini 그림 폭(px) — 자리 고정용 */
export function bodyMapMiniWidth(height = 56): number {
  // [원본] return Math.round((height * VIEW_W) / VIEW_H);
  return Math.round((height * REAL_VIEW_W) / REAL_VIEW_H);
}
