// 콘셉트 루틴 카탈로그 — "원하는 몸" 기준 네이밍·스토리·Day 구성 (순수 데이터·테스트 대상). @plm SRS-047
// RapidOverload(Bear Mode식) 벤치마킹(BS-004 C2): 데이터는 기존 시드 종목을 재사용하고 포장 레이어만 얹는다.
// 네이밍은 국내 헬스 문화 코드(3대 500·어깨깡패·바디프로필·직장인 미니멀)를 차용 — 2026-07 리뉴얼.
// 종목 참조는 nameKo(조회 KEY) — 무결성은 catalogGap.test가 시드 대조로 보증한다.
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
    id: 'boulder-shoulders',
    nameKo: '어깨깡패 프로젝트',
    nameEn: 'Boulder Shoulders',
    storyKo:
      '프레임이 달라 보이는 건 결국 어깨예요. 측면·후면 삼각근을 볼륨 있게 공략하는 주 2일 구성으로, 상체 실루엣의 인상을 노립니다.',
    storyEn:
      'Frames are built at the shoulders. A 2-day plan hammering side and rear delts to sharpen your upper-body silhouette.',
    days: [
      {
        nameKo: 'Day 1 프레스·측면',
        nameEn: 'Day 1 Press & Side Delts',
        exercises: ['오버헤드 프레스', '덤벨 레터럴 레이즈', '인클라인 프레스 (덤벨)', '케이블 레터럴 레이즈'],
      },
      {
        nameKo: 'Day 2 후면·상체 풀',
        nameEn: 'Day 2 Rear Delts & Pull',
        exercises: ['페이스 풀', '덤벨 리어 델트 플라이', '랫 풀다운', '덤벨 슈러그'],
      },
    ],
  },
  {
    id: 'big3-500',
    nameKo: '3대 500 로드',
    nameEn: 'Road to Big-3 500',
    storyKo:
      '스쿼트·벤치·데드 합계 500을 향해 가는 파워빌딩 구성이에요. 메인 리프트를 앞에 무겁게, 보조 운동으로 약점을 채웁니다.',
    storyEn:
      'Chase the big-three total. Heavy main lifts first, targeted accessories to patch the weak points.',
    days: [
      {
        nameKo: 'Day 1 스쿼트',
        nameEn: 'Day 1 Squat',
        exercises: ['바벨 스쿼트', '레그 프레스', '시티드 레그 컬', '플랭크'],
      },
      {
        nameKo: 'Day 2 벤치',
        nameEn: 'Day 2 Bench',
        exercises: ['바벨 벤치프레스', '인클라인 프레스 (덤벨)', '딥스', '트라이셉스 푸시다운'],
      },
      {
        nameKo: 'Day 3 데드리프트',
        nameEn: 'Day 3 Deadlift',
        exercises: ['데드리프트', '바벨 로우', '풀업', '바벨 컬'],
      },
    ],
  },
  {
    id: 'profile-season',
    nameKo: '바디프로필 시즌',
    nameEn: 'Body Profile Season',
    storyKo:
      '촬영이 잡힌 것처럼 라인에 집중하는 볼륨 구성이에요. 머신·케이블로 자극 부위를 정확히 노리고, 코어 마무리로 미드섹션까지 챙깁니다.',
    storyEn:
      'Train like the shoot is booked. Machines and cables for precise tension, core finishers for the midsection.',
    days: [
      {
        nameKo: 'Day 1 가슴·어깨',
        nameEn: 'Day 1 Chest & Shoulders',
        exercises: ['체스트 프레스 머신', '케이블 크로스오버', '숄더 프레스 머신', '케이블 레터럴 레이즈'],
      },
      {
        nameKo: 'Day 2 등·팔',
        nameEn: 'Day 2 Back & Arms',
        exercises: ['랫 풀다운', '시티드 케이블 로우', '케이블 컬', '로프 푸시다운'],
      },
      {
        nameKo: 'Day 3 하체·코어',
        nameEn: 'Day 3 Legs & Core',
        exercises: ['레그 프레스', '힙 쓰러스트 (바벨)', '시티드 레그 컬', '케이블 크런치'],
      },
    ],
  },
  {
    id: 'after-work-30',
    nameKo: '퇴근 후 30분',
    nameEn: 'After-Work 30',
    storyKo:
      '바쁜 날에도 끊기지 않는 게 우선이에요. 복합 운동 위주로 전신을 훑는 주 2일 미니멀 구성 — 짧게 끝내고 꾸준함을 지킵니다.',
    storyEn:
      'Consistency beats perfection. Two 30-minute full-body days built on compound moves — get in, get it done.',
    days: [
      {
        nameKo: 'Day 1 전신 푸시',
        nameEn: 'Day 1 Full-Body Push',
        exercises: ['고블릿 스쿼트', '덤벨 벤치프레스', '덤벨 숄더 프레스', '플랭크'],
      },
      {
        nameKo: 'Day 2 전신 풀',
        nameEn: 'Day 2 Full-Body Pull',
        exercises: ['루마니안 데드리프트 (바벨)', '랫 풀다운', '시티드 케이블 로우', '덤벨 컬'],
      },
    ],
  },
];
