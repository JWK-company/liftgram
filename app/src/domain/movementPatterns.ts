// 무브먼트 패턴 그룹 — "같은 패턴 대체운동" 조회의 기반 (순수 데이터·테스트 대상). @plm SRS-047
// SAD-021 편차(스펙 qa 결정): DB 컬럼 대신 도메인 정적 매핑(nameKo KEY — exerciseMedia 선례).
// 마이그레이션 불필요·오프라인 안전·커스텀 종목은 null. 괄호 기구 토큰 제거 폴백은 media와 동일 규칙.
export type MovementPattern =
  | 'horizontalPress' // 수평 프레스(벤치 계열)
  | 'verticalPress' // 수직 프레스(오버헤드)
  | 'horizontalPull' // 수평 당기기(로우)
  | 'verticalPull' // 수직 당기기(풀업·풀다운)
  | 'squat'
  | 'hinge' // 힌지(데드리프트·굿모닝)
  | 'lungeStep' // 런지·스텝
  | 'fly' // 가슴·후면 플라이
  | 'lateralRaise'
  | 'curl'
  | 'extension' // 삼두 신전
  | 'carry'
  | 'core'
  | 'calf';

// 매핑 키 = 시드 nameKo(베이스명 — 괄호 변형은 폴백으로 흡수). 신규 종목 추가 시 여기도 함께.
const PATTERN_BY_NAME: Record<string, MovementPattern> = {
  // 수평 프레스
  '바벨 벤치프레스': 'horizontalPress',
  '덤벨 벤치프레스': 'horizontalPress',
  '스미스 벤치프레스': 'horizontalPress',
  '체스트 프레스 머신': 'horizontalPress',
  '인클라인 프레스': 'horizontalPress',
  '디클라인 프레스': 'horizontalPress',
  '해머스트렝스 체스트 프레스': 'horizontalPress',
  '디클라인 체스트 프레스 머신': 'horizontalPress',
  '라잉 체스트 프레스 머신': 'horizontalPress',
  '컨버징 체스트 프레스 머신': 'horizontalPress',
  '원암 체스트 프레스 머신': 'horizontalPress',
  '시티드 케이블 체스트 프레스': 'horizontalPress',
  '스탠딩 케이블 체스트 프레스': 'horizontalPress',
  '라잉 케이블 체스트 프레스': 'horizontalPress',
  '라슨 프레스': 'horizontalPress',
  '피트 업 벤치프레스': 'horizontalPress',
  '푸시업': 'horizontalPress',
  '인클라인 푸시업': 'horizontalPress',
  '와이드 그립 푸시업': 'horizontalPress',
  '데피싯 푸시업': 'horizontalPress',
  '다이아몬드 푸시업': 'horizontalPress',
  '클로즈 그립 벤치프레스': 'horizontalPress',
  '딥스': 'horizontalPress',
  '딥 머신': 'horizontalPress',
  '어시스트 딥스': 'horizontalPress',
  // 수직 프레스
  '오버헤드 프레스': 'verticalPress',
  '밀리터리 프레스': 'verticalPress',
  '덤벨 숄더 프레스': 'verticalPress',
  '아놀드 프레스': 'verticalPress',
  '숄더 프레스 머신': 'verticalPress',
  '숄더 프레스': 'verticalPress',
  '랜드마인 프레스': 'verticalPress',
  // 수평 당기기
  '바벨 로우': 'horizontalPull',
  '펜들레이 로우': 'horizontalPull',
  '티바 로우': 'horizontalPull',
  '덤벨 로우': 'horizontalPull',
  '시티드 케이블 로우': 'horizontalPull',
  '머신 로우': 'horizontalPull',
  '하이 로우': 'horizontalPull',
  '로우 로우': 'horizontalPull',
  '체스트 서포티드 로우': 'horizontalPull',
  '체스트 서포티드 티바 로우': 'horizontalPull',
  '인버티드 로우': 'horizontalPull',
  '로우': 'horizontalPull',
  // 수직 당기기
  '랫 풀다운': 'verticalPull',
  '클로즈그립 풀다운': 'verticalPull',
  '원암 랫풀다운': 'verticalPull',
  '풀업': 'verticalPull',
  '친업': 'verticalPull',
  '어시스트 풀업': 'verticalPull',
  '어시스트 친업': 'verticalPull',
  // 스쿼트
  '바벨 스쿼트': 'squat',
  '프론트 스쿼트': 'squat',
  '하이바 스쿼트': 'squat',
  '핵 스쿼트': 'squat',
  '레그 프레스': 'squat',
  '고블릿 스쿼트': 'squat',
  '스미스 스쿼트': 'squat',
  '펜듈럼 스쿼트': 'squat',
  '벨트 스쿼트': 'squat',
  '시시 스쿼트': 'squat',
  // 힌지
  '데드리프트': 'hinge',
  '스모 데드리프트': 'hinge',
  '랙 풀': 'hinge',
  '루마니안 데드리프트': 'hinge',
  '스티프 레그 데드리프트': 'hinge',
  '굿모닝': 'hinge',
  '케틀벨 스윙': 'hinge',
  '힙 쓰러스트': 'hinge',
  '스미스 힙 쓰러스트': 'hinge',
  '글루트 브릿지': 'hinge',
  // 런지·스텝
  '런지': 'lungeStep',
  '워킹 런지': 'lungeStep',
  '불가리안 스플릿 스쿼트': 'lungeStep',
  '스텝업': 'lungeStep',
  // 플라이
  '덤벨 플라이': 'fly',
  '인클라인 덤벨 플라이': 'fly',
  '케이블 크로스오버': 'fly',
  '로우 케이블 플라이': 'fly',
  '펙 덱 플라이': 'fly',
  '덤벨 리어 델트 플라이': 'fly',
  '리버스 펙 덱': 'fly',
  '케이블 리어 델트 플라이': 'fly',
  // 레터럴 레이즈
  '덤벨 레터럴 레이즈': 'lateralRaise',
  '케이블 레터럴 레이즈': 'lateralRaise',
  '머신 레터럴 레이즈': 'lateralRaise',
};

// 괄호 기구 토큰 제거 폴백('인클라인 프레스 (바벨)' → '인클라인 프레스') — exerciseMedia와 동일 규칙.
export function movementPatternOf(nameKo: string): MovementPattern | null {
  const direct = PATTERN_BY_NAME[nameKo];
  if (direct) return direct;
  const base = nameKo.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (base && base !== nameKo) return PATTERN_BY_NAME[base] ?? null;
  return null;
}

// 같은 패턴의 종목명 목록(자기 자신 제외) — "이 기구가 없어요" 대체 후보의 상위 그룹.
export function samePatternNames(pattern: MovementPattern, excludeNameKo?: string): string[] {
  return Object.entries(PATTERN_BY_NAME)
    .filter(([name, p]) => p === pattern && name !== excludeNameKo)
    .map(([name]) => name);
}

export function movementPatternMapKeys(): string[] {
  return Object.keys(PATTERN_BY_NAME);
}
