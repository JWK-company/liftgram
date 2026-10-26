// @plm SRS-055  종목 그림의 출처 — 픽토그램(자체 제작) · 퍼블릭 도메인 사진 · (나중에) AI 일러스트(ADR-036).
//
// 그림이 어디서 왔는지와 그 라이선스를 한 곳에 둔다. 화면은 이 표에 없는 출처의 그림을 보여 주지 않고,
// 허용 목록 밖의 라이선스가 끼면 테스트가 실패한다. 출처 표기 의무가 있는 라이선스(CC-BY-SA 등)는 쓰지 않는다.
//
// 종목의 media_ref(마스터 표의 media 열) 해석:
//   fedb:<id>   → 픽토그램 + 같은 동작·같은 기구의 실사 사진(상세 화면 보조)
//   gen · none  → 픽토그램만
//   ai:<key>    → (예약) AI 일러스트 + 픽토그램 — GPU 시간이 생기면 데이터만 바꿔 넣는다
// 픽토그램은 모든 카탈로그 종목에 있으므로 출처 목록의 맨 앞은 늘 picto 다(커스텀 종목 제외).

export type VisualSourceKind = 'picto' | 'fedb' | 'ai';

export interface VisualSource {
  kind: VisualSourceKind;
  /** 허용 목록 중 하나 */
  license: 'self-made' | 'public-domain' | 'apache-2.0-model-output';
  author: string;
  url: string | null;
}

/** 출처별 메타 — 화면 크레딧과 라이선스 검사가 같이 읽는다. */
export const VISUAL_SOURCES: Record<VisualSourceKind, VisualSource> = {
  picto: { kind: 'picto', license: 'self-made', author: 'Liftgram', url: null },
  fedb: {
    kind: 'fedb',
    license: 'public-domain',
    author: 'free-exercise-db (Unlicense)',
    url: 'https://github.com/yuhonas/free-exercise-db',
  },
  // 예약 — 아직 한 장도 없다. 들일 때 모델 라이선스를 확인하고(Z-Image Turbo·Qwen-Image = Apache-2.0) 허용 목록을 고친다.
  ai: { kind: 'ai', license: 'apache-2.0-model-output', author: 'Liftgram (AI 생성)', url: null },
};

/** 지금 화면에 낼 수 있는 라이선스 — 출처 표기 의무가 없는 것만. */
export const VISUAL_LICENSE_ALLOWLIST: readonly VisualSource['license'][] = ['self-made', 'public-domain'];

/** media_ref → 출처 목록(앞이 우선). ai 는 허용 목록에 들기 전까지 건너뛴다. */
export function visualSourcesFor(mediaRef: string | null | undefined, isCatalog = true): VisualSource[] {
  const out: VisualSource[] = [];
  const ref = mediaRef ?? '';
  if (ref.startsWith('ai:') && VISUAL_LICENSE_ALLOWLIST.includes(VISUAL_SOURCES.ai.license)) out.push(VISUAL_SOURCES.ai);
  if (isCatalog) out.push(VISUAL_SOURCES.picto);
  if (ref.startsWith('fedb:')) out.push(VISUAL_SOURCES.fedb);
  return out;
}

/** 시드 종목인가 — 픽토그램은 시드 카탈로그 종목에 모두 있다(근력 100% · pictograms.test.ts). */
export function hasPictogram(exerciseId: string | null | undefined): boolean {
  return !!exerciseId && exerciseId.startsWith('seed-');
}
