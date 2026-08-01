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

  // ── 카탈로그 대확장 (2026-08 · spec 20260801) — 표의 패턴 컬럼 기재분만(공란=제외 확정).
  // 괄호 신규 엔트리(힙 쓰러스트 (덤벨)·슈러그 (머신) 등)는 베이스 폴백 자동 도달 — 매핑 추가 금지.
  // 단 베이스가 맵에 없는 괄호 계열(프론트 레이즈·리버스 컬)은 베이스명 키로 계열 전체를 잇는다. @plm SRS-047
  // 수평 프레스
  '디클라인 푸시업': 'horizontalPress',
  '클랩 푸시업': 'horizontalPress',
  '닐링 푸시업': 'horizontalPress',
  '원암 푸시업': 'horizontalPress',
  '플랭크 푸시업': 'horizontalPress',
  '링 푸시업': 'horizontalPress',
  '플로어 프레스': 'horizontalPress',
  '덤벨 스퀴즈 프레스': 'horizontalPress',
  '스벤드 프레스': 'horizontalPress',
  '링 딥스': 'horizontalPress',
  // 플라이
  '디클라인 덤벨 플라이': 'fly',
  '시티드 케이블 플라이': 'fly',
  '덤벨 어라운드 더 월드': 'fly',
  '밴드 풀 어파트': 'fly', // 리어
  // 수평 당기기
  '랜드마인 로우': 'horizontalPull',
  '메도우스 로우': 'horizontalPull',
  '씰 로우': 'horizontalPull',
  '고릴라 로우': 'horizontalPull',
  '레니게이드 로우': 'horizontalPull',
  // 수직 당기기
  '풀오버 머신': 'verticalPull',
  '네거티브 풀업': 'verticalPull',
  '스캐퓰러 풀업': 'verticalPull',
  '키핑 풀업': 'verticalPull',
  '스터넘 풀업': 'verticalPull',
  '머슬업': 'verticalPull',
  '링 풀업': 'verticalPull',
  // 수직 프레스
  '파이크 푸시업': 'verticalPress',
  '핸드스탠드 푸시업': 'verticalPress',
  '핸드스탠드 홀드': 'verticalPress',
  '푸시 프레스': 'verticalPress',
  // 레터럴 레이즈 (프론트 레이즈는 베이스 키 — (덤벨)/(케이블)/(바벨)/(플레이트) 폴백 도달)
  '케이블 Y 레이즈': 'lateralRaise',
  '체스트 서포티드 Y 레이즈': 'lateralRaise',
  '프론트 레이즈': 'lateralRaise',
  '오버헤드 플레이트 레이즈': 'lateralRaise',
  // 컬 (리버스 컬은 베이스 키 — (덤벨)/(케이블) 폴백 도달)
  '드래그 컬': 'curl',
  '조트맨 컬': 'curl',
  '크로스 바디 해머 컬': 'curl',
  '웨이터 컬': 'curl',
  '21 컬': 'curl',
  '오버헤드 케이블 컬': 'curl',
  '비하인드 백 케이블 컬': 'curl',
  '플레이트 컬': 'curl',
  '비하인드 백 리스트 컬': 'curl',
  '리버스 컬': 'curl',
  // 삼두 신전
  '리버스 그립 푸시다운': 'extension',
  '트라이셉스 익스텐션 머신': 'extension',
  '와이드 엘보 트라이셉스 프레스': 'extension',
  // 스쿼트
  '박스 스쿼트': 'squat',
  '포즈 스쿼트': 'squat',
  '오버헤드 스쿼트': 'squat',
  '저처 스쿼트': 'squat',
  '스모 스쿼트': 'squat',
  '피스톨 스쿼트': 'squat',
  '월 싯': 'squat',
  '점프 스쿼트': 'squat',
  '박스 점프': 'squat', // 양발 플라이오 — 점프 스쿼트와 동조(qa)
  '프로그 점프': 'squat',
  '레터럴 스쿼트': 'squat',
  // 런지·스텝 (기존 런지 계열과 정합 — 표의 〃 연쇄는 squat로 읽히나 대체후보 계열 분열 방지가 우선)
  '레터럴 박스 점프': 'lungeStep',
  '리버스 런지': 'lungeStep',
  '레터럴 런지': 'lungeStep',
  '커시 런지': 'lungeStep',
  '점프 런지': 'lungeStep',
  '오버헤드 런지': 'lungeStep',
  '스플릿 스쿼트': 'lungeStep',
  // 힌지
  '백 익스텐션 머신': 'hinge',
  '케이블 풀 스루': 'hinge',
  '리버스 하이퍼익스텐션': 'hinge',
  '데드리프트 하이 풀': 'hinge',
  // 코어·캐리
  '슈퍼맨': 'core',
  '숄더 탭': 'core',
  '수트케이스 캐리': 'carry',
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
