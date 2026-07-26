// 콘셉트 루틴 카탈로그 — "원하는 몸" 기준 네이밍·스토리·Day 구성 (순수 데이터·테스트 대상). @plm SRS-047
// RapidOverload(Bear Mode식) 벤치마킹(BS-004 C2): 데이터는 기존 시드 종목을 재사용하고 포장 레이어만 얹는다.
// 종목 참조는 nameKo(조회 KEY) — 무결성은 conceptRoutines.test가 시드 대조로 보증한다.
export interface ConceptRoutineDay {
  nameKo: string; // 루틴 이름(저장 시 "콘셉트명 — Day명")
  nameEn: string;
  exercises: string[]; // 시드 nameKo 목록
}

export interface ConceptRoutine {
  id: string;
  nameKo: string;
  nameEn: string;
  storyKo: string; // 한 단락 스토리(웰니스 카피 게이트 준수 — 단정·보장 없음)
  storyEn: string;
  days: ConceptRoutineDay[];
}

export const CONCEPT_ROUTINES: ConceptRoutine[] = [
  {
    id: 'fashion-minimal',
    nameKo: '패션근육 미니멀',
    nameEn: 'Aesthetic Minimal',
    storyKo:
      '옷태를 만드는 부위(가슴 상부·측면 어깨·팔)에 집중하는 주 2일 미니멀 구성이에요. 시간이 없어도 실루엣의 인상을 좌우하는 곳부터 챙깁니다.',
    storyEn:
      'A 2-day minimal split focused on the muscles that shape your silhouette — upper chest, side delts and arms. Short on time, big on impression.',
    days: [
      {
        nameKo: 'Day 1 상체 프레스',
        nameEn: 'Day 1 Upper Press',
        exercises: ['인클라인 프레스 (덤벨)', '덤벨 레터럴 레이즈', '트라이셉스 푸시다운', '푸시업'],
      },
      {
        nameKo: 'Day 2 상체 풀·팔',
        nameEn: 'Day 2 Upper Pull & Arms',
        exercises: ['랫 풀다운', '시티드 케이블 로우', '덤벨 컬', '해머 컬 (덤벨)'],
      },
    ],
  },
  {
    id: 'powerbuilding',
    nameKo: '파워빌딩',
    nameEn: 'Powerbuilding',
    storyKo:
      '3대 리프트의 무게를 쌓으면서 근육 크기도 함께 노리는 구성이에요. 큰 복합 운동을 앞에, 보조 운동을 뒤에 배치했습니다.',
    storyEn:
      'Build your big-three numbers while chasing size. Heavy compounds first, targeted accessories after.',
    days: [
      {
        nameKo: 'Day 1 스쿼트 중심',
        nameEn: 'Day 1 Squat Focus',
        exercises: ['바벨 스쿼트', '레그 프레스', '레그 익스텐션', '스탠딩 카프 레이즈'],
      },
      {
        nameKo: 'Day 2 벤치 중심',
        nameEn: 'Day 2 Bench Focus',
        exercises: ['바벨 벤치프레스', '인클라인 프레스 (덤벨)', '딥스', '트라이셉스 푸시다운'],
      },
      {
        nameKo: 'Day 3 데드 중심',
        nameEn: 'Day 3 Deadlift Focus',
        exercises: ['데드리프트', '바벨 로우', '랫 풀다운', '바벨 컬'],
      },
    ],
  },
  {
    id: 'pure-hypertrophy',
    nameKo: '순수 근비대',
    nameEn: 'Pure Hypertrophy',
    storyKo:
      '볼륨 위주로 근육 성장 자극을 극대화하는 구성이에요. 머신·케이블을 적극 활용해 자극 부위에 집중합니다.',
    storyEn:
      'Volume-first training to maximize growth stimulus, leaning on machines and cables for targeted tension.',
    days: [
      {
        nameKo: 'Day 1 가슴·어깨',
        nameEn: 'Day 1 Chest & Shoulders',
        exercises: ['체스트 프레스 머신', '펙 덱 플라이', '숄더 프레스 머신', '케이블 레터럴 레이즈'],
      },
      {
        nameKo: 'Day 2 등·팔',
        nameEn: 'Day 2 Back & Arms',
        exercises: ['랫 풀다운', '머신 로우', '케이블 컬', '로프 푸시다운'],
      },
      {
        nameKo: 'Day 3 하체',
        nameEn: 'Day 3 Legs',
        exercises: ['레그 프레스', '레그 익스텐션', '시티드 레그 컬', '시티드 카프 레이즈'],
      },
    ],
  },
];
