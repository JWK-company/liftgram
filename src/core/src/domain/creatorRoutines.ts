// 크리에이터 루틴 — 주제(프로의 어깨·가슴·등·하체·팔·푸시·풀·전신 · 초보자 전신·분할·부위별)별로 국내외 프로 선수·유명 보디빌더·운동 유튜버의 영상 루틴을 정리한 정적 데이터. @plm SRS-091 SRS-092
// [원본] 주제: 어깨깡패·3대 500·퇴근 후(2026-10-28) → 2026-11-05 사용자 지시로 교체. 옛 영상은 hidden 으로 데이터에 남긴다(3대 500·퇴근 후) · 어깨 3개는 새 주제로 옮겼다.
//
// 규칙(ADR-045 · spec 20261028_creator-routines rev1):
//   · 출처(source)의 title·channel 은 공식 oEmbed 값 그대로 — 점검: node scripts/check-creator-routines.mjs
//   · 루틴(종목·세트·횟수)은 사실 정보만 · src 'video' = 출처(영상 설명란, 또는 basis 로 밝힌 영상 분석 자료·시청자 정리 댓글)에 적힌 값 · 'default' = 출처에 없어 우리가 채운 값(화면에 「기본값」)
//   · 대본·설명란 원문·썸네일은 넣지 않는다. summaryKo·labelKo 는 우리 말로 — 채널명(실명)을 넣지 않는다(공유 시 이름만 퍼짐 · qa H-2)
//   · 균일하지 않은 처방(피라미드·탑셋)은 근삿값 + reps 'default' + noteKo 로 원래 방식을 적는다 · 하루 안 같은 종목 두 번 금지
//   · draft: true = 아직 사람 검수 전 — 화면에 내지 않는다(check 스크립트는 경고로 알린다)
//   · 영상이 삭제·비공개면 hidden: true
// 옛 AI 콘셉트 루틴(conceptRoutines.ts)은 사용자 결정(2026-10-28)으로 화면에서 뺐다 — 데이터는 원복용 보존.

// [원본] export type CreatorTopicId = 'boulder-shoulders' | 'big3-500' | 'after-work';
// [개선] 프로 주제 8개 + 초보자 주제 3개(2026-11-06) + 숨긴 옛 영상이 쓰는 주제 2개(화면 목록 CREATOR_TOPICS 에는 없다)
export type CreatorTopicId =
  | 'pro-shoulders'
  | 'pro-chest'
  | 'pro-back'
  | 'pro-legs'
  | 'pro-arms'
  | 'pro-push'
  | 'pro-pull'
  | 'pro-full'
  | 'beginner-full'
  | 'beginner-split'
  | 'beginner-part'
  | 'big3-500'
  | 'after-work';

export interface CreatorTopic {
  id: CreatorTopicId;
  nameKo: string;
  nameEn: string;
  blurbKo: string;
  blurbEn: string;
}

export type PrescriptionSource = 'video' | 'default';

export interface CreatorRoutineItem {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec?: number;
  src: { sets: PrescriptionSource; reps: PrescriptionSource };
  /** 영상의 원래 방식(피라미드 등) — 저장 시 루틴 종목 메모로 */
  noteKo?: string;
}

export interface CreatorRoutineDay {
  nameKo: string;
  items: CreatorRoutineItem[];
}

export interface CreatorRoutine {
  id: string;
  topicId: CreatorTopicId;
  /** 우리가 붙인 버전 이름 — 저장 루틴 이름의 앞부분(채널명 금지) */
  labelKo: string;
  source: {
    videoId: string;
    title: string;
    channel: string;
    channelUrl: string;
    /** 설명란·기사와 대조한 날짜(YYYY-MM-DD · 영상 본편 대조 아님) — 30일 지나면 check 가 경고 */
    verifiedAt: string;
  };
  /** 루틴의 근거가 설명란이 아니라 영상을 분석한 2차 자료일 때(예: 기사) — 화면에 따로 밝힌다 */
  basis?: { labelKo: string; url: string };
  summaryKo: string;
  days: CreatorRoutineDay[];
  draft?: true;
  hidden?: true;
}

// [원본] 주제 3개(어깨깡패·3대 500·퇴근 후 짧게)
/*
export const CREATOR_TOPICS: CreatorTopic[] = [
  {
    id: 'boulder-shoulders',
    nameKo: '어깨깡패',
    nameEn: 'Boulder shoulders',
    blurbKo: '어깨 볼륨을 노리는 루틴을 운동 유튜버들의 영상에서 모았어요.',
    blurbEn: 'Shoulder-focused routines collected from Korean fitness creators (Korean content).',
  },
  {
    id: 'big3-500',
    nameKo: '3대 500',
    nameEn: 'Big-3 500',
    blurbKo: '스쿼트·벤치프레스·데드리프트 합계를 올리는 프로그램을 영상에서 모았어요.',
    blurbEn: 'Squat·bench·deadlift programs from Korean fitness creators (Korean content).',
  },
  {
    id: 'after-work',
    nameKo: '퇴근 후 짧게',
    nameEn: 'Short after-work',
    blurbKo: '시간이 없는 날 헬스장에서 짧게 끝내는 전신 루틴을 영상에서 모았어요.',
    blurbEn: 'Short full-body gym routines from Korean fitness creators (Korean content).',
  },
];
*/
// [개선] 실존 인물 이름은 주제·루틴 이름에 넣지 않는다(ADR-045) — 출처 줄에만 채널명을 인용한다
const PRO_BLURB_EN = 'Routines from pro and well-known bodybuilders, summarized from their videos (routine names in Korean).';
const BEGINNER_BLURB_EN = 'Beginner routines recommended by pros and fitness creators, summarized from their videos (routine names in Korean).';
export const CREATOR_TOPICS: CreatorTopic[] = [
  { id: 'pro-shoulders', nameKo: '프로의 어깨 루틴', nameEn: 'Pro shoulders', blurbKo: '국내외 프로 선수와 유명 보디빌더가 영상에서 보여 준 어깨 운동을 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-chest', nameKo: '프로의 가슴 루틴', nameEn: 'Pro chest', blurbKo: '국내외 프로 선수와 유명 보디빌더가 영상에서 보여 준 가슴 운동을 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-back', nameKo: '프로의 등 루틴', nameEn: 'Pro back', blurbKo: '국내외 프로 선수와 유명 보디빌더가 영상에서 보여 준 등 운동을 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-legs', nameKo: '프로의 하체 루틴', nameEn: 'Pro legs', blurbKo: '국내외 프로 선수와 유명 보디빌더가 영상에서 보여 준 하체 운동을 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-arms', nameKo: '프로의 팔 루틴', nameEn: 'Pro arms', blurbKo: '국내외 프로 선수와 유명 보디빌더가 영상에서 보여 준 팔 운동을 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-push', nameKo: '프로의 푸시데이', nameEn: 'Pro push day', blurbKo: '가슴·어깨·삼두를 하루에 묶은 푸시 운동을 프로 선수와 유명 보디빌더의 영상에서 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-pull', nameKo: '프로의 풀데이', nameEn: 'Pro pull day', blurbKo: '등·이두를 하루에 묶은 풀 운동을 프로 선수와 유명 보디빌더의 영상에서 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-full', nameKo: '프로의 전신 루틴', nameEn: 'Pro full body', blurbKo: '하루에 온몸을 도는 전신 운동을 프로 선수와 유명 보디빌더의 영상에서 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'beginner-full', nameKo: '초보자 전신 루틴', nameEn: 'Beginner full body', blurbKo: '프로 선수와 운동 유튜버가 초보자에게 권한 전신 운동을 영상에서 모았어요.', blurbEn: BEGINNER_BLURB_EN },
  { id: 'beginner-split', nameKo: '초보자 분할 루틴', nameEn: 'Beginner splits', blurbKo: '운동을 나눠서 시작하려는 초보자를 위한 분할 운동을 영상에서 모았어요. 분할의 하루만 있는 영상도 있어요.', blurbEn: BEGINNER_BLURB_EN },
  { id: 'beginner-part', nameKo: '초보자 부위별 루틴', nameEn: 'Beginner by body part', blurbKo: '프로 선수와 운동 유튜버가 초보자에게 권한 부위별 기본 운동을 영상에서 모았어요.', blurbEn: BEGINNER_BLURB_EN },
];

// biome-ignore lint/correctness/noUnusedVariables: 자리 잡기 도우미(새 버전 초안용)
const D = (sets: number, repsMin: number, repsMax: number): Pick<CreatorRoutineItem, 'sets' | 'repsMin' | 'repsMax' | 'src'> => ({
  sets,
  repsMin,
  repsMax,
  src: { sets: 'default', reps: 'default' },
});

// 내용 근거 = 공식 Data API 로 읽은 설명란(타임스탬프·요약) — 2026-10-28. 종목 순서는 설명란 그대로, 수치는 설명란에 있을 때만 'video'.
// 설명란 원문은 보관하지 않는다(qa H-3). 영상 본편과 대조한 값은 없다 — 사용자 검수(2026-10-28)는 이 표 기준.
export const CREATOR_ROUTINES: CreatorRoutine[] = [
  {
    id: 'cr-shoulders-season',
    topicId: 'pro-shoulders',
    labelKo: '어깨·승모 시즌',
    source: {
      videoId: 'ogkP-jjvu8U',
      title: '보디빌더 이장민 | 시즌 4주차 | 어깨, 승모근 운동 | 상체 운동',
      channel: 'Bodybuilder이장민',
      channelUrl: 'https://www.youtube.com/@leejangmin',
      verifiedAt: '2026-10-28',
    },
    summaryKo: '프레스 두 가지로 시작해 측면·후면 삼각근을 거쳐 승모근으로 마무리하는 시즌 중 어깨 운동이에요.',
    days: [
      {
        nameKo: '어깨·승모',
        items: [
          { exerciseId: 'seed-shoulder-press-smith', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-reverse-pec-deck', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-shrug', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-shrug', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-shoulders-5split',
    topicId: 'pro-shoulders',
    labelKo: '어깨 6종',
    source: {
      videoId: 'pkd3pPUpi-Y',
      title: '가장 고민을 많이 한 어깨루틴 | 5분할 루틴 [2025]',
      channel: '킹유진',
      channelUrl: 'https://www.youtube.com/@%ED%82%B9%EC%9C%A0%EC%A7%84',
      verifiedAt: '2026-10-28',
    },
    summaryKo: '프레스 두 가지 뒤에 케이블·덤벨로 측면을 두 번, 업라이트 로우와 벤트오버로 마무리하는 5분할 중 어깨 날이에요. 영상은 시작 전 스트레칭·월슬라이드도 다뤄요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-behind-the-neck-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-upright-row-cable', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-shoulders-olympia',
    topicId: 'pro-shoulders',
    labelKo: '올림피아 어깨',
    source: {
      videoId: 'hpvAcZtNcPY',
      title: 'ANABOLIC POST WORKOUT MEAL | BIG FAT SHOULDERS',
      channel: 'Chris Bumstead',
      channelUrl: 'https://www.youtube.com/@ChrisBumstead',
      verifiedAt: '2026-10-28',
    },
    // 공식 채널 설명란에는 루틴이 없다 — 다음 날 Fitness Volt 가 이 영상을 보고 정리한 종목·세트·횟수(추정치라고 밝힘)를 따른다.
    basis: {
      labelKo: 'Fitness Volt 영상 분석 기사(2022-06-28)',
      url: 'https://fitnessvolt.com/chris-bumstead-shoulders-workout/',
    },
    summaryKo:
      '미스터 올림피아 클래식 피지크 6연패 선수의 어깨 날이에요. 앉아서 하는 덤벨 프레스로 무겁게 시작해 머신 프레스, 측면, 후면 순으로 마무리해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 4, repsMin: 6, repsMax: 9, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서 · 워밍업 1세트 뒤' },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '워밍업 1세트 뒤' },
          { exerciseId: 'seed-side-lateral-raise', sets: 4, repsMin: 7, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서' },
          { exerciseId: 'seed-reverse-pec-deck', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-machine-lateral-raise', sets: 1, repsMin: 7, repsMax: 7, src: { sets: 'video', reps: 'video' }, noteKo: '선 채로 마무리 1세트' },
        ],
      },
    ],
  },
  {
    id: 'cr-big3-5x5',
    topicId: 'big3-500',
    hidden: true,
    labelKo: '3대 5×5',
    source: {
      videoId: 'fdpMOjGwMvU',
      title: '3대 500! 강한 메루치가 될 수 있는 5X5 프로그램!',
      channel: '메루치양식장_체중증량TV',
      channelUrl: 'https://www.youtube.com/@%EB%A9%94%EB%A3%A8%EC%B9%98%EC%96%91%EC%8B%9D%EC%9E%A5',
      verifiedAt: '2026-10-28',
    },
    summaryKo: '5대 운동을 5세트 5회로 하고 성공하면 다음에 조금씩 무게를 올리는 근력 프로그램이에요(스트롱리프트 방식). A·B 를 번갈아 해요.',
    days: [
      {
        nameKo: 'A',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 5, repsMin: 5, repsMax: 5, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-barbell-bench-press', sets: 5, repsMin: 5, repsMax: 5, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-barbell-row', sets: 5, repsMin: 5, repsMax: 5, src: { sets: 'video', reps: 'video' } },
        ],
      },
      {
        nameKo: 'B',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 5, repsMin: 5, repsMax: 5, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-overhead-press', sets: 5, repsMin: 5, repsMax: 5, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-deadlift', sets: 1, repsMin: 5, repsMax: 5, src: { sets: 'default', reps: 'video' }, noteKo: '스트롱리프트 기본은 데드리프트 1세트 5회' },
        ],
      },
    ],
  },
  {
    id: 'cr-big3-mq-5x5',
    topicId: 'big3-500',
    hidden: true,
    labelKo: '회사원 5×5',
    source: {
      videoId: '4xOfS_1bgZo',
      title: '5×5로 3대 500 가뿐히 넘기는 방법 (5x5 프로그램 공개)  | 3대 710kg 회사원의 운동 QnA | 방구석 레슨 | 메탈퀄리티 35화',
      channel: 'MQ',
      channelUrl: 'https://www.youtube.com/@Metalquality_official',
      verifiedAt: '2026-10-28',
    },
    summaryKo: '(검수 필요) 회사원이 3대 운동을 5세트 5회로 꾸준히 올리는 프로그램이에요.',
    days: [
      {
        nameKo: '3대',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 5, repsMin: 5, repsMax: 5, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-bench-press', sets: 5, repsMin: 5, repsMax: 5, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-deadlift', sets: 5, repsMin: 5, repsMax: 5, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
    draft: true,
  },
  {
    id: 'cr-afterwork-fullbody',
    topicId: 'after-work',
    hidden: true,
    labelKo: '주 1~2회 무분할',
    source: {
      videoId: 'O8D81rCN0XY',
      title: '무분할 전신루틴, 헬스장 주 1~2회만 간다면 이 6가지 순서로 하세요',
      channel: '핏블리 FITVELY',
      channelUrl: 'https://www.youtube.com/@fitvely',
      verifiedAt: '2026-10-28',
    },
    summaryKo: '가슴과 등을 번갈아 하며 미는 근육이 쉬는 동안 당기는 근육을 쓰고, 하체로 마무리하는 무분할 전신 구성이에요. 가볍게 15회씩 해요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 5, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '20kg 바가 힘들면 덤벨 프레스로' },
          { exerciseId: 'seed-assisted-pull-up', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '세 번째 세트는 언더그립' },
          { exerciseId: 'seed-chest-press-machine', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-afterwork-1hour',
    topicId: 'after-work',
    hidden: true,
    labelKo: '헬스장 1시간',
    source: {
      videoId: 'E-DCLPwZwUI',
      title: '헬스 초보 탈출 루틴!! 헬스장 1시간 완전 공략(스트레칭,근력,유산소)',
      channel: '웨이트연구소 I 덕코치',
      channelUrl: 'https://www.youtube.com/@%EC%9B%A8%EC%9D%B4%ED%8A%B8%EC%97%B0%EA%B5%AC%EC%86%8C%EB%8D%95%EC%BD%94%EC%B9%98',
      verifiedAt: '2026-10-28',
    },
    summaryKo: '유산소·스트레칭으로 몸을 데운 뒤 등·가슴·하체·어깨를 기구 하나씩으로 끝내고, 인터벌과 스트레칭으로 마무리하는 1시간 구성이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-smith-machine-bench-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
// ── 프로 루틴(2026-11-05 추가) — 설명란·공식 oEmbed·분석 기사 기준. 근거에 없는 세트·횟수는 src default 로 표시한다.
  {
    id: 'cr-pro-sh-10',
    topicId: 'pro-shoulders',
    labelKo: '어깨·승모 고볼륨',
    source: {
      videoId: 'RoRDGtH-Yac',
      title: 'Delts & Traps (with Derrione Hill) | Are Front Raises Unnecessary???',
      channel: 'Beastmode Jones',
      channelUrl: 'https://www.youtube.com/@BeastmodeJones316',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '후면으로 시작해 측면을 세 가지로 채우고, 무거운 프레스 뒤에 전면·승모까지 다루는 고볼륨 구성이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-reverse-pec-deck', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-face-pull', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-y-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 앉아서 3세트를 더 해요' },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩' },
          { exerciseId: 'seed-overhead-press', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-front-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-upright-row', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-shrug', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-sh-giant',
    topicId: 'pro-shoulders',
    labelKo: '어깨 슈퍼세트',
    source: {
      videoId: 'Kun5lBS5Psw',
      title: 'SADIK\'S SHOULDER WORKOUT',
      channel: 'Sadik Hadzovic',
      channelUrl: 'https://www.youtube.com/@SadikHadzovic1',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '업라이트 로우로 시작해 측면·전면·승모·후면을 차례로 돌고 덤벨 프레스로 끝내는 슈퍼세트 구성이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-upright-row', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 파트너 저항 레이즈와 슈퍼세트(앱 종목 없음)' },
          { exerciseId: 'seed-front-raise', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩' },
          { exerciseId: 'seed-shrug-machine', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-face-pull', sets: 4, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-rear-delt-fly', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-sh-front',
    topicId: 'pro-shoulders',
    labelKo: '전면 집중 어깨·승모',
    source: {
      videoId: 'd6raL-t5F1M',
      title: 'Hadi Choopan | Mr. Olympia Champion Shoulder & Traps Workout 💪🔥 (Build Massive Delts & Traps)',
      channel: 'Hadi Choopan',
      channelUrl: 'https://www.youtube.com/@HadiChoopanOfficial',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '케이블·덤벨 전면 레이즈 비중이 큰 어깨 날이에요. 프레스 두 가지와 승모, 허리 운동까지 이어져요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-front-raise-cable', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-front-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-upright-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-shoulder-press-smith', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-shrug', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-hyperextension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-sh-press',
    topicId: 'pro-shoulders',
    labelKo: '프레스 중심 어깨',
    source: {
      videoId: '2cfGuAUenWk',
      title: 'Hadi Choopan 🔥 Mr. Olympia Shoulder Workout 2022 | The Persian Wolf 🐺💪',
      channel: 'Hadi Choopan',
      channelUrl: 'https://www.youtube.com/@HadiChoopanOfficial',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '바벨·덤벨·머신 프레스를 모두 쓰고 전면 레이즈와 슈러그로 마무리해요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-overhead-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-front-raise-barbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-front-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-smith-upright-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-shrug', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-sh-full',
    topicId: 'pro-shoulders',
    labelKo: '클래식 어깨 풀 세션',
    source: {
      videoId: 'gBtfQoutWGo',
      title: 'FULL SHOULDER WORKOUT | RELIVING CHILDHOOD DREAMS',
      channel: 'Chris Bumstead',
      channelUrl: 'https://www.youtube.com/@ChrisBumstead',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-shoulder-day-workout' },
    summaryKo: '후면 예열 뒤 프레스와 측면 레이즈를 번갈아 하고 리버스 플라이로 마무리해요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-shoulder-press-smith', sets: 2, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 실패까지' },
          { exerciseId: 'seed-shoulder-press-machine', sets: 2, repsMin: 8, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-machine-lateral-raise', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-reverse-pec-deck', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 실패까지' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-sh-off',
    topicId: 'pro-shoulders',
    labelKo: '오프시즌 어깨',
    source: {
      videoId: 'rIX35SBA_lQ',
      title: 'BUILDING BIG DELTS | MINI RANT',
      channel: 'Chris Bumstead',
      channelUrl: 'https://www.youtube.com/@ChrisBumstead',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-performs-shoulder-workout/' },
    summaryKo: '머신과 덤벨 프레스로 시작해 측면·후면을 두 가지씩 채우는 오프시즌 어깨 날이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-reverse-pec-deck', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-sh-pump',
    topicId: 'pro-shoulders',
    labelKo: '펌핑 어깨',
    source: {
      videoId: 'tdEk3XfYzxc',
      title: 'BACK ON THE TUBE WITH A JOOCY SHOULDER PUMP',
      channel: 'Chris Bumstead',
      channelUrl: 'https://www.youtube.com/@ChrisBumstead',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-joocy-shoulder-workout' },
    summaryKo: '측면 레이즈로 먼저 자극하고 프레스로 넘어가는 순서예요. 덤벨 레이즈는 무게를 올리며 네 세트를 해요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-machine-lateral-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 4, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 20회, 15회, 10회, 실패까지' },
          { exerciseId: 'seed-front-raise-cable', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-rear-delt-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-sh-offwalker',
    topicId: 'pro-shoulders',
    labelKo: '오프시즌 어깨·승모',
    source: {
      videoId: 'Cg2SNWPSyyc',
      title: 'Nick Walker | GET MASSIVE DELTS! | TRAINING TO WIN! | ROAD TO OLYMPIA 2022!',
      channel: 'Nick Walker',
      channelUrl: 'https://www.youtube.com/@NickWalker39',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/nick-walker-shoulders-triceps-workout/' },
    summaryKo: '무거운 세트와 고반복 세트를 섞은 바벨 프레스 뒤에 측면·승모·후면을 채워요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-reverse-pec-deck', sets: 1, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 트리플 드롭 1세트' },
          { exerciseId: 'seed-overhead-press', sets: 2, repsMin: 9, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 무겁게 9회 1세트, 20회 1세트' },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 이어서 더블 드롭' },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-shrug-smith', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-sh-prep',
    topicId: 'pro-shoulders',
    labelKo: '시즌 어깨·삼두',
    source: {
      videoId: 'wyyLxew_9I0',
      title: 'Nick Walker | HEAVY SHOULDER PRESS! | BIG DELTS AND TRICEPS WORKOUT! | ROAD TO OLYMPIA 2022!',
      channel: 'Nick Walker',
      channelUrl: 'https://www.youtube.com/@NickWalker39',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/nick-walker-shoulders-triceps-workout-for-2022-olympia/' },
    summaryKo: '리버스 펙 덱으로 시작하고 스미스 프레스를 쉬어 가며 끝까지 밀어붙인 뒤 삼두로 끝내는 구성이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-reverse-pec-deck', sets: 2, repsMin: 12, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 실패 1세트, 더블 드롭 1세트' },
          { exerciseId: 'seed-shoulder-press-smith', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 레스트포즈로 10+3+2회, 이어서 가볍게 15회' },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-lateral-raise', sets: 2, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩' },
          { exerciseId: 'seed-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-overhead-triceps-extension', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 드롭 2번' },
          { exerciseId: 'seed-hanging-knee-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-prep',
    topicId: 'pro-chest',
    labelKo: '인클라인 중심 시즌 가슴',
    source: {
      videoId: 'ngDvmZ0kEl4',
      title: 'CHEST DAY W. HANY RAMBOD',
      channel: 'Chris Bumstead',
      channelUrl: 'https://www.youtube.com/@ChrisBumstead',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/cbum-chest-workout-2023-olympia-prep/' },
    summaryKo: '케이블 플라이로 시작해 인클라인 프레스를 쌓고, 삼두 머신까지 이어지는 코치 동행 가슴 날이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-seated-cable-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dip-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-triceps-extension-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-off',
    topicId: 'pro-chest',
    labelKo: '오프시즌 가슴·삼두',
    source: {
      videoId: 'CX0QJ2BWnq8',
      title: 'CHEST DAY W. HANY RAMBOD | FIRST TEXAS BBQ EXPERIENCE',
      channel: 'Chris Bumstead',
      channelUrl: 'https://www.youtube.com/@ChrisBumstead',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-off-season-chest-workout' },
    summaryKo: '케이블 크로스오버로 시작해 머신 프레스와 플라이, 딥스와 삼두 케이블로 끝내는 오프시즌 구성이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-incline-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dips', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-10w',
    topicId: 'pro-chest',
    labelKo: '대회 10주 전 가슴',
    source: {
      videoId: 'aCo1m9Azp-E',
      title: 'Chest Workout | Physique Update 10 Weeks Out 2023 Mr. Olympia',
      channel: 'Derek Lunsford',
      channelUrl: 'https://www.youtube.com/@dereklunsford_',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/derek-lunsford-chest-workout-2023-olympia-prep/' },
    summaryKo: '케이블 크로스오버로 시작해 덤벨 인클라인, 머신 프레스, 펙 덱을 하고 레그 레이즈로 끝내는 짧은 구성이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-parallel-bar-leg-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-13w',
    topicId: 'pro-chest',
    labelKo: '가슴·이두 13주 전',
    source: {
      videoId: 'fubp6Bo1hWs',
      title: '13 Weeks Out | CHEST WORKOUT | 2024 Mr. Olympia',
      channel: 'Derek Lunsford',
      channelUrl: 'https://www.youtube.com/@dereklunsford_',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/derek-lunsford-grainy-chest-arms-workout-2024-olympia/' },
    summaryKo: '인클라인 위주로 가슴을 다룬 뒤 이두 세 가지로 이어 가요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-incline-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-dumbbell-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-smith-machine-bench-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-ez-bar-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-preacher-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-3d',
    topicId: 'pro-chest',
    labelKo: '입체 가슴',
    source: {
      videoId: '2d7cw-1ed2c',
      title: 'Hadi Choopan | 3D Chest Workout 🔥 Build a Massive Chest Like a Pro',
      channel: 'Hadi Choopan',
      channelUrl: 'https://www.youtube.com/@HadiChoopanOfficial',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/hadi-choopans-3d-chest-workout-guide-2024-olympia' },
    summaryKo: '케이블 풀오버로 예열하고 케이블·머신·바벨·스미스를 섞어 여러 각도로 미는 구성이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-straight-arm-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-bench-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-incline-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-press-smith', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-tension',
    topicId: 'pro-chest',
    labelKo: '긴장 유지 가슴',
    source: {
      videoId: 'di5GPmTA-u4',
      title: 'JAY CUTLER\'S STAR SPANGLED CHEST WORKOUT.  🇺🇸',
      channel: 'JayCutlerTV',
      channelUrl: 'https://www.youtube.com/@JayCutlerTV',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/jay-cutler-crushes-brutal-chest-workout-at-52/' },
    summaryKo: '카프로 시작한 뒤 머신과 케이블로 긴장을 오래 유지하는 레전드 선수의 가슴 날이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-standing-calf-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-seated-calf-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-seated-cable-chest-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-pullover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-legends',
    topicId: 'pro-chest',
    labelKo: '레전드 가슴·삼두',
    source: {
      videoId: 'XzJsC3EmdXM',
      title: 'BROTHERS IN IRON JAY CUTLER',
      channel: 'Phil Heath',
      channelUrl: 'https://www.youtube.com/@PhilHeathTV',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Generation Iron 기사', url: 'https://generationiron.com/jay-cutler-phil-heath-chest-triceps-workout/' },
    summaryKo: '두 올림피아 챔피언이 함께한 머신 위주의 가슴·삼두 세션이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-incline-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-triceps-extension-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-classic',
    topicId: 'pro-chest',
    labelKo: '클래식 피지크 가슴',
    source: {
      videoId: 'PPXQjpxcYNA',
      title: 'SHREDDED & FULL CHEST WORKOUT | CLASSIC PHYSIQUE OLYMPIA',
      channel: 'Wesley Vissers',
      channelUrl: 'https://www.youtube.com/@VintageGenetics',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '디클라인·인클라인·플랫 프레스를 두 세트씩 하고 측면과 삼두까지 끝내는 대회 전 구성이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-decline-chest-press-machine', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 12–15회' },
          { exerciseId: 'seed-incline-press-machine', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 12–15회 + 레스트포즈 2세트' },
          { exerciseId: 'seed-chest-press-machine', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 12–15회 + 레스트포즈 2세트' },
          { exerciseId: 'seed-assisted-dip', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–10회, 12–15회' },
          { exerciseId: 'seed-pec-deck-fly', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 10–15회, 12–15회 + 더블 드롭' },
          { exerciseId: 'seed-side-lateral-raise', sets: 2, repsMin: 20, repsMax: 25, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 8, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12–15회, 8–12회, 15–20회' },
          { exerciseId: 'seed-cable-overhead-extension', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 12–15회 + 레스트포즈 2세트' },
          { exerciseId: 'seed-skull-crusher-dumbbell', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 12–15회 + 레스트포즈 2세트' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-mass',
    topicId: 'pro-chest',
    labelKo: '볼륨 가슴 5주 전',
    source: {
      videoId: 'qrnKDXDJIgk',
      title: 'MASS CHEST WORKOUT | SHAPE UPDATE 5 WEEKS OUT OLYMPIA',
      channel: 'Wesley Vissers',
      channelUrl: 'https://www.youtube.com/@VintageGenetics',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '스미스와 덤벨 인클라인을 무겁게·가볍게 한 세트씩 하고 플랫 프레스, 삼두 두 가지로 이어 가요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-incline-press-smith', sets: 2, repsMin: 8, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 15–20회' },
          { exerciseId: 'seed-incline-press-dumbbell', sets: 2, repsMin: 8, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 15–20회' },
          { exerciseId: 'seed-chest-press-machine', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '이어서 레스트포즈 1세트' },
          { exerciseId: 'seed-cable-crossover', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 2, repsMin: 15, repsMax: 25, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 25회 이상, 15회 이상' },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 12, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12–15회 2세트, 15–20회 1세트' },
          { exerciseId: 'seed-skull-crusher-dumbbell', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 10–12회, 12–15회, 15–20회' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-volume',
    topicId: 'pro-chest',
    labelKo: '고볼륨 가슴',
    source: {
      videoId: 'SRtCJZUoxlM',
      title: 'High Volume Chest Workout & Post Workout Meal',
      channel: 'Beastmode Jones',
      channelUrl: 'https://www.youtube.com/@BeastmodeJones316',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '펙 플라이로 먼저 자극하고 인클라인 6세트를 포함해 세트 수를 많이 가져가는 구성이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-incline-press', sets: 6, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 총 6세트' },
          { exerciseId: 'seed-incline-dumbbell-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-chest-press-machine', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dips', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 스탠딩 케이블 플라이 3세트를 더 해요' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-kr-partner',
    topicId: 'pro-chest',
    labelKo: '시즌 가슴 5종',
    source: {
      videoId: '6TFRl0MZKXE',
      title: '시즌 7주차 | 가슴, 삼두 운동 | 파트너십 운동',
      channel: 'Bodybuilder이장민',
      channelUrl: 'https://www.youtube.com/@leejangmin',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '벤치프레스로 시작해 머신 프레스 두 가지, 딥스, 펙 덱으로 이어 가는 시즌 중 가슴 운동이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dip-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-kr-natural',
    topicId: 'pro-chest',
    labelKo: '가슴 7종 볼륨',
    source: {
      videoId: 'WBpZEgKXaow',
      title: '"내추럴 좀비와 죽어보기"',
      channel: ' Allright24_박재훈',
      channelUrl: 'https://www.youtube.com/@Allright24_',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '벤치프레스 뒤에 인클라인 두 가지, 펙 덱, 디클라인, 딥스, 케이블까지 일곱 가지로 구성해요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-press-smith', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-decline-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-assisted-dip', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-prep',
    topicId: 'pro-back',
    labelKo: '시즌 등 7종',
    source: {
      videoId: 'dK8UR_0tZf0',
      title: 'BACK WORKOUT WITH IAIN VALLIERE',
      channel: 'Chris Bumstead',
      channelUrl: 'https://www.youtube.com/@ChrisBumstead',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-back-workout-2023-olympia-prep/' },
    summaryKo: '머신 풀오버로 시작해 바벨·덤벨·머신 로우를 고루 쓰는 대회 준비 등 운동이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-machine-pullover', sets: 3, repsMin: 5, repsMax: 9, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 5회, 9회, 6회' },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 9, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 9회, 9회, 15회' },
          { exerciseId: 'seed-dumbbell-row', sets: 2, repsMin: 4, repsMax: 8, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 양팔 번갈아 4회씩, 8회' },
          { exerciseId: 'seed-chest-supported-row', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 10회, 6회, 9회' },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 3, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 10회, 10회, 3회' },
          { exerciseId: 'seed-low-row', sets: 2, repsMin: 4, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 4회, 10회' },
          { exerciseId: 'seed-dumbbell-rear-delt-row', sets: 1, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-day1',
    topicId: 'pro-back',
    labelKo: '시즌 첫날 등',
    source: {
      videoId: '2E92msHIx-0',
      title: '2024 Olympia Prep Back Workout | Day 1',
      channel: 'Derek Lunsford',
      channelUrl: 'https://www.youtube.com/@dereklunsford_',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/derek-lunsford-back-workout-2024-mr-olympia/' },
    summaryKo: '스트레이트 암 풀다운으로 예열하고 머신 로우 세 가지, 랙 풀까지 이어지는 등 날이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-straight-arm-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-low-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-supported-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-supported-t-bar-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-rack-pull', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-blueprint',
    topicId: 'pro-back',
    labelKo: '넓은 등 7종',
    source: {
      videoId: 'gooMw3zSerQ',
      title: 'HOW TO BUILD A MASSIVE BACK | JAY CUTLER\'S BLUEPRINT',
      channel: 'JayCutlerTV',
      channelUrl: 'https://www.youtube.com/@JayCutlerTV',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/jay-cutler-massive-back-workout' },
    summaryKo: '리버스 그립 풀다운으로 시작해 세 세트씩 고르게 쌓고 데드리프트 한 세트로 끝내는 설계도 같은 구성이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '리버스 그립 · 예열 2세트 뒤' },
          { exerciseId: 'seed-machine-pullover', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-machine-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-t-bar-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-deadlift', sets: 1, repsMin: 9, repsMax: 9, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-pyramid',
    topicId: 'pro-back',
    labelKo: '피라미드 등',
    source: {
      videoId: 'dy3uLsaiPoU',
      title: 'JAY CUTLER XXL BACK ROUTINE.',
      channel: 'JayCutlerTV',
      channelUrl: 'https://www.youtube.com/@JayCutlerTV',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/jay-cutler-xxl-back-workout/' },
    summaryKo: '피라미드 세트로 무게를 올리며 당기는 동작과 늘리는 동작을 고르게 다뤄요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '리버스 그립 · 피라미드로' },
          { exerciseId: 'seed-machine-pullover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '넓은 그립' },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-hyperextension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-2005',
    topicId: 'pro-back',
    labelKo: '2005 올림피아식 등',
    source: {
      videoId: '5WMMFGjsL2k',
      title: 'I TRIED JAY CUTLER’s 2005 BACK WORKOUT | FULL TRAINING EXPLAINED',
      channel: 'Regan Grimes',
      channelUrl: 'https://www.youtube.com/@ReganGrimesifbbpro',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '풀다운부터 랙 풀까지 일곱 가지를 모두 12·10·8회로 올리는 옛 챔피언식 고볼륨 구성이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12회, 10회, 8회' },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12회, 10회, 8회' },
          { exerciseId: 'seed-t-bar-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12회, 10회, 8회' },
          { exerciseId: 'seed-machine-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12회, 10회, 8회' },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12회, 10회, 8회' },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12회, 10회, 8회' },
          { exerciseId: 'seed-rack-pull', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12회, 10회, 8회' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-superset',
    topicId: 'pro-back',
    labelKo: '슈퍼세트 등',
    source: {
      videoId: 'akaR7t0pMAU',
      title: 'Mr Olympia 2025 series | Back workout 3 weeks out | Samson Dauda',
      channel: 'SAMSON DAUDA',
      channelUrl: 'https://www.youtube.com/@Samson_Dauda',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/samson-dauda-back-superset-workout-2025-mr-olympia/' },
    summaryKo: '두 종목을 묶어 쉬는 시간을 줄이고 랙 풀로 끝내는 대회 3주 전 구성이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-high-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '랫풀다운과 슈퍼세트' },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-t-bar-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '시티드 로우와 슈퍼세트' },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-rack-pull', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-oneside',
    topicId: 'pro-back',
    labelKo: '한 팔 풀다운 등',
    source: {
      videoId: 'nxuKv2mbrqE',
      title: 'Nick Walker | TRAIN BACK LIKE THE MUTANT! | ROAD TO OLYMPIA 2022!',
      channel: 'Nick Walker',
      channelUrl: 'https://www.youtube.com/@NickWalker39',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/nick-walker-crushing-back-workout' },
    summaryKo: '한 팔 풀다운과 스미스 로우를 중심으로 머신 로우를 더하고, 15초 움직이고 15초 쉬는 풀다운으로 마무리해요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 · 마지막 세트는 가볍게' },
          { exerciseId: 'seed-row-smith', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-machine-row', sets: 1, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-low-row', sets: 2, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '그립을 바꿔 10회씩 두 바퀴' },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 1, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 15초 움직이고 15초 쉬기 2회' },
          { exerciseId: 'seed-standing-calf-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-hany',
    topicId: 'pro-back',
    labelKo: '코치 동행 등',
    source: {
      videoId: 'bCWdeK8y_cI',
      title: 'Hadi Choopan & Phil Heath | Ultimate Back Workout with Hany Rambod 💪🔥 (Mr. Olympia 2024 Prep)',
      channel: 'Hadi Choopan',
      channelUrl: 'https://www.youtube.com/@HadiChoopanOfficial',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '올림피아 챔피언 둘이 코치와 함께한 머신 로우 위주의 등 세션이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-machine-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-supported-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-shrug', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-reverse-pec-deck', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-arnold',
    topicId: 'pro-back',
    labelKo: '대회 21일 전 등',
    source: {
      videoId: 'sVwxLmEzf_I',
      title: '21 Days Out BACK DAY w/ @WesleyVissersNL  - Arnold Classic Prep',
      channel: 'Urs Kalecinski',
      channelUrl: 'https://www.youtube.com/@UrsKalecinski',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/urs-kalecinski-wesley-vissers-2024-arnold-classic-workout' },
    summaryKo: '머신으로 무겁게 당기는 대회 3주 전 등 운동이에요. 기사에 세트 수가 나온 종목으로 정리했어요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-machine-lat-pulldown', sets: 2, repsMin: 9, repsMax: 9, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 7, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-machine-row', sets: 4, repsMin: 4, repsMax: 7, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩' },
          { exerciseId: 'seed-assisted-pull-up', sets: 1, repsMin: 9, repsMax: 9, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 2, repsMin: 5, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '로프' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-kr-10',
    topicId: 'pro-back',
    labelKo: '풀업 10세트 등',
    source: {
      videoId: 'tIyfSwFNfuc',
      title: '등 운동 6가지 - 강경원 루틴',
      channel: '강경원',
      channelUrl: 'https://www.youtube.com/@kangkyungwon',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '풀업 10세트를 중심으로 로우 세 가지를 5세트씩 쌓는 등 루틴이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-pull-up', sets: 10, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 와이드 7세트, 클로즈 3세트' },
          { exerciseId: 'seed-t-bar-row', sets: 5, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-barbell-row', sets: 5, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-row', sets: 5, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 오버그립 1세트, 언더그립 3세트 · 시작 때 예열 2세트' },
          { exerciseId: 'seed-hyperextension', sets: 5, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-oldschool',
    topicId: 'pro-back',
    labelKo: '올드스쿨 등',
    source: {
      videoId: 'S8wk4hV91Xk',
      title: 'Old School Back Day | Don\'t Neglect These \'\'2\'\' Areas | Pre & Post Meals',
      channel: 'Beastmode Jones',
      channelUrl: 'https://www.youtube.com/@BeastmodeJones316',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '풀업 네 가지로 시작해 풀다운과 로우, 허리 운동으로 끝내는 옛 방식의 등 날이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-pull-up', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 클로즈·패러럴·비하인드 넥도 3세트씩 해요' },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '리버스 그립' },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩' },
          { exerciseId: 'seed-t-bar-row', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 와이드 그립 피라미드' },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-hyperextension', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-quad',
    topicId: 'pro-legs',
    labelKo: '대퇴 집중 하체',
    source: {
      videoId: 'NqGBG_mN-94',
      title: 'GROWING MY LEGS | TIME TO GET HUGE',
      channel: 'Chris Bumstead',
      channelUrl: 'https://www.youtube.com/@ChrisBumstead',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-brutal-quad-burning-leg-day/' },
    summaryKo: '5일 쉰 뒤의 하체 날이에요. 한 다리 익스텐션을 먼저 하고 스미스 스쿼트와 레그 프레스로 이어 가요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-extension', sets: 2, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '한 다리씩' },
          { exerciseId: 'seed-hip-adduction-machine', sets: 1, repsMin: 6, repsMax: 6, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-smith-machine-squat', sets: 2, repsMin: 11, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-press', sets: 2, repsMin: 7, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한 다리씩' },
          { exerciseId: 'seed-seated-calf-raise', sets: 5, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-full',
    topicId: 'pro-legs',
    labelKo: '클래식 풀 하체',
    source: {
      videoId: 'SDAVyMuPah0',
      title: 'KILLER LEG DAY | FULL WORKOUT',
      channel: 'Chris Bumstead',
      channelUrl: 'https://www.youtube.com/@ChrisBumstead',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-killer-leg-day-workout' },
    summaryKo: '한 다리 익스텐션과 레그 컬로 예열한 뒤 백 스쿼트와 불가리안 스쿼트를 하고 카프로 끝내요. 본 세트는 두 세트씩이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-extension', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 불가리안 뒤에 한 번 더 해요' },
          { exerciseId: 'seed-barbell-squat', sets: 2, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 15회, 12회' },
          { exerciseId: 'seed-bulgarian-split-squat', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-standing-calf-raise', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-8w',
    topicId: 'pro-legs',
    labelKo: '대회 8주 전 하체',
    source: {
      videoId: 'L3du0mY4uxg',
      title: '8 Weeks Out | Leg Day with Ramon | Tampa Pro',
      channel: 'Derek Lunsford',
      channelUrl: 'https://www.youtube.com/@dereklunsford_',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '펜듈럼 스쿼트 탑 세트를 중심에 두고 벨트 스쿼트, 햄스트링으로 이어 가요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-pendulum-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-belt-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-16d',
    topicId: 'pro-legs',
    labelKo: '대회 16일 전 하체',
    source: {
      videoId: 'MkcunEAaCcA',
      title: '16 Days Out | Leg Day w/Matt Greggo',
      channel: 'Derek Lunsford',
      channelUrl: 'https://www.youtube.com/@dereklunsford_',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '익스텐션 뒤에 핵 프레스와 펜듈럼 스쿼트로 탑 세트까지 올리고 햄스트링으로 끝내요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-hack-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-pendulum-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-olympia4w',
    topicId: 'pro-legs',
    labelKo: '올림피아 4주 전 하체',
    source: {
      videoId: 'AoEK1r0OGlI',
      title: 'Mr Olympia 2023 series | Legs workout and food prep at 4 weeks out | Samson Dauda',
      channel: 'SAMSON DAUDA',
      channelUrl: 'https://www.youtube.com/@Samson_Dauda',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/samson-dauda-shares-meal-workout-2023-olympia' },
    summaryKo: '햄스트링 컬로 시작해 익스텐션, 레그 프레스, 런지, 리버스 핵을 하고 힙 어브덕션으로 끝내는 구성이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-standing-leg-curl', sets: 1, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-extension', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 12, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-walking-lunge', sets: 2, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-reverse-hack-squat', sets: 1, repsMin: 9, repsMax: 9, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-hip-abduction-machine', sets: 1, repsMin: 14, repsMax: 14, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-16w',
    topicId: 'pro-legs',
    labelKo: '올림피아 16주 전 하체',
    source: {
      videoId: 'LrtFiJQ6U9M',
      title: 'Legs workout 16 weeks out from Mr Olympia 2026 | Samson Dauda',
      channel: 'SAMSON DAUDA',
      channelUrl: 'https://www.youtube.com/@Samson_Dauda',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/samson-dauda-leg-workout-16-weeks-before-2026-mr-olympia/' },
    summaryKo: '레그 프레스와 레그 컬 뒤에 스미스 스쿼트와 익스텐션을 슈퍼세트로 묶어요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-hip-abduction-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-kneeling-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-smith-machine-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '레그 익스텐션과 슈퍼세트' },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-hit',
    topicId: 'pro-legs',
    labelKo: '고강도 하체',
    source: {
      videoId: 'zLwJBUSJxCU',
      title: 'Andrew Huberman Trains Legs With 6x Mr Olympia Dorian Yates',
      channel: 'Dorian Yates Nutrition ',
      channelUrl: 'https://www.youtube.com/@DorianYatesNutrition',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '올림피아 챔피언 출신 선수가 직접 지도한 하체 날이에요. 익스텐션부터 카프까지 일곱 가지예요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-hack-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-stiff-leg-deadlift', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-standing-calf-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-seated-calf-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-volume',
    topicId: 'pro-legs',
    labelKo: '고볼륨 하체',
    source: {
      videoId: 'chsQcoOt9-s',
      title: 'High Volume Legs - Where Have I Been? Life Update',
      channel: 'Sadik Hadzovic',
      channelUrl: 'https://www.youtube.com/@SadikHadzovic1',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '반복 수를 높게 잡고 앞·뒤 허벅지를 모두 채우는 하체 날이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-extension', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-smith-machine-squat', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 30, repsMax: 30, src: { sets: 'video', reps: 'video' }, noteKo: '발 위치 3가지' },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-walking-lunge', sets: 3, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '한 다리씩' },
          { exerciseId: 'seed-stiff-leg-deadlift', sets: 3, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-15d',
    topicId: 'pro-legs',
    labelKo: '대회 15일 전 하체',
    source: {
      videoId: 'hyUpeI2fp7w',
      title: 'OLYMPIA PREP LEG WORKOUT | 15 DAYS OUT',
      channel: 'Wesley Vissers',
      channelUrl: 'https://www.youtube.com/@VintageGenetics',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '어덕터와 햄스트링으로 시작해 익스텐션, 프레스, 핵 스쿼트, 런지, 카프까지 모두 두 세트씩 해요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-hip-adduction-machine', sets: 2, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 15–20회, 10–15회' },
          { exerciseId: 'seed-seated-leg-curl', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–10회, 15회 + 레스트포즈 2세트' },
          { exerciseId: 'seed-leg-extension', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 15회 + 더블 드롭' },
          { exerciseId: 'seed-leg-press', sets: 2, repsMin: 8, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 넓은 스탠스와 일반 스탠스를 2세트씩 해요' },
          { exerciseId: 'seed-hack-squat', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 10–12회 + 레스트포즈 2세트' },
          { exerciseId: 'seed-walking-lunge', sets: 2, repsMin: 25, repsMax: 30, src: { sets: 'video', reps: 'video' }, noteKo: '걸음 수' },
          { exerciseId: 'seed-donkey-calf-raise', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12–15회, 8–12회' },
          { exerciseId: 'seed-seated-calf-raise', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12–15회, 8–12회' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-glute',
    topicId: 'pro-legs',
    labelKo: '대퇴·햄·엉덩이',
    source: {
      videoId: 'chSFhwMgxh8',
      title: 'Leg Day (with Ashley Paul) | Quads, Hams, & Glutes',
      channel: 'Beastmode Jones',
      channelUrl: 'https://www.youtube.com/@BeastmodeJones316',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '어덕터·어브덕터로 시작해 앞 허벅지, 햄스트링, 엉덩이까지 고르게 다뤄요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-hip-adduction-machine', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-hip-abduction-machine', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-hack-squat', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-reverse-hack-squat', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-romanian-deadlift', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-kickback', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩' },
          { exerciseId: 'seed-hip-thrust', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-simple',
    topicId: 'pro-legs',
    labelKo: '단순 하체 7종',
    source: {
      videoId: 'pW9Su1gxRC8',
      title: 'Simple & Effective Leg Routine | Ran Into My Online Client',
      channel: 'Beastmode Jones',
      channelUrl: 'https://www.youtube.com/@BeastmodeJones316',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '카프부터 시작해 머신 위주로 네 세트씩 채우는 단순한 구성이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-donkey-calf-raise', sets: 5, repsMin: 8, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '세트마다 무겁게' },
          { exerciseId: 'seed-hip-abduction-machine', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-leg-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-hack-squat', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-extension', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-stiff-leg-deadlift', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-kr-11w',
    topicId: 'pro-legs',
    labelKo: '시즌 11주차 하체',
    source: {
      videoId: 'FG1Qu2lxmZ8',
      title: '보디빌더 이장민 | 시즌 11주차 | 하체운동',
      channel: 'Bodybuilder이장민',
      channelUrl: 'https://www.youtube.com/@leejangmin',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '스미스 스쿼트와 파워 레그 프레스로 앞을 채우고 컬, 스티프, 카프로 마무리하는 시즌 중 하체 운동이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-smith-machine-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-smith-stiff-leg-deadlift', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-standing-calf-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-arnold',
    topicId: 'pro-legs',
    labelKo: '대회 4주 전 하체',
    source: {
      videoId: 'YOPjQUoATm4',
      title: 'Leg Day : 4 Weeks Out From The 2023 Arnold Classic Ep.6',
      channel: 'Shaun Clarida',
      channelUrl: 'https://www.youtube.com/@shaunclarida',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '카프로 시작해 햄스트링, 펜듈럼, 핵 스쿼트까지 머신을 고루 쓰는 하체 날이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-standing-calf-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-leg-press-calf-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-pendulum-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-hip-thrust-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-hack-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-standing-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-1086',
    topicId: 'pro-legs',
    labelKo: '10·8·6 하체',
    source: {
      videoId: '-TDSOVA7zcQ',
      title: 'How I’m Training to Finish the Year Strong!',
      channel: 'Steve Cook',
      channelUrl: 'https://www.youtube.com/@swoldiernation',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '주요 종목을 10회, 8회, 6회로 올리는 연말 강도 구성이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-belt-squat', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 10회, 8회, 6회' },
          { exerciseId: 'seed-cable-romanian-deadlift', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 10회, 8회, 6회' },
          { exerciseId: 'seed-lunge-barbell', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 10회, 8회, 6회 · 한 다리씩' },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 10회, 8회, 6회' },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 10회, 8회, 6회' },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 10회, 8회, 6회' },
          { exerciseId: 'seed-donkey-calf-raise', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 10회, 8회, 6회' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-brutal',
    topicId: 'pro-legs',
    labelKo: '4종 고강도 하체',
    source: {
      videoId: '7Pep2_4nhgE',
      title: 'Brutal Leg Day with The Mountain Dog... (Painful)',
      channel: 'Jeff Nippard',
      channelUrl: 'https://www.youtube.com/@JeffNippard',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '네 가지 모두 무게를 올린 네 세트 뒤에 강한 한 세트를 더하는 구성이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-lying-leg-curl', sets: 5, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 4세트 + 드롭 세트' },
          { exerciseId: 'seed-leg-extension', sets: 5, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 4세트 + 강한 세트' },
          { exerciseId: 'seed-safety-bar-squat', sets: 5, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 4세트 + 마지막 무겁게 6회' },
          { exerciseId: 'seed-bulgarian-split-squat-smith', sets: 5, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 한 다리씩 4세트 + 드롭 세트' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ar-kr-barbell',
    topicId: 'pro-arms',
    labelKo: '바벨로 두꺼운 팔',
    source: {
      videoId: 'dPDk-sa5KLQ',
      title: '바벨로 두꺼운 팔 만들기',
      channel: '설기관',
      channelUrl: 'https://www.youtube.com/@kikwan_seol',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '바벨 컬과 프리처 컬, 라잉 익스텐션과 클로즈 벤치, 전완까지 바벨 중심으로 구성해요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-preacher-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-skull-crusher', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-close-grip-bench-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-reverse-barbell-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-wrist-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ar-kr-natural',
    topicId: 'pro-arms',
    labelKo: '삼두 먼저 팔',
    source: {
      videoId: '66-ToruXeZA',
      title: '내추럴 좀비와 양치 못 하는 팔운동',
      channel: ' Allright24_박재훈',
      channelUrl: 'https://www.youtube.com/@Allright24_',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '클로즈 벤치로 시작해 삼두를 네 세트씩, 이두를 두세 세트씩 다루는 팔 날이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-close-grip-bench-press', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 원암 푸시다운도 4세트 더 해요' },
          { exerciseId: 'seed-triceps-extension-machine', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-hammer-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-machine-preacher-curl', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-concentration-curl', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ar-super12',
    topicId: 'pro-arms',
    labelKo: '슈퍼세트 팔 12주 전',
    source: {
      videoId: '4HOvQuYP0x4',
      title: 'Mr Olympia 2024 series | Arms  workout 12,5 weeks out | Samson Dauda',
      channel: 'SAMSON DAUDA',
      channelUrl: 'https://www.youtube.com/@Samson_Dauda',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/samson-dauda-superset-arms-workout' },
    summaryKo: '이두와 삼두를 한 쌍씩 묶어 세 번 도는 대회 12주 전 팔 운동이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-machine-preacher-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '푸시다운과 슈퍼세트' },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dip-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '덤벨 프리처와 슈퍼세트' },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '오버헤드 익스텐션과 슈퍼세트' },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ar-super4',
    topicId: 'pro-arms',
    labelKo: '슈퍼세트 팔 4주 전',
    source: {
      videoId: '6GyUzhl32qI',
      title: 'Mr Olympia 2024 series | Arms workout  4 weeks out | Samson Dauda',
      channel: 'SAMSON DAUDA',
      channelUrl: 'https://www.youtube.com/@Samson_Dauda',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Generation Iron 기사', url: 'https://generationiron.com/samson-dauda-arm-workout/' },
    summaryKo: '대회 4주 전의 슈퍼세트 팔 운동이에요. 머신과 케이블을 번갈아 써요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-machine-preacher-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '머신 딥스와 슈퍼세트' },
          { exerciseId: 'seed-dip-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '덤벨 프리처와 슈퍼세트' },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '크로스바디 익스텐션과 슈퍼세트' },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 크로스바디 케이블 익스텐션' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ar-bulk',
    topicId: 'pro-arms',
    labelKo: '벌크업 팔',
    source: {
      videoId: 'sectq1WaF9A',
      title: 'The Bulk Day 23 - Arms, 20 Inches Pumped',
      channel: 'Sam Sulek',
      channelUrl: 'https://www.youtube.com/@sam_sulek',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'BarBend 기사', url: 'https://barbend.com/news/sam-sulek-20-inch-arm-workout/' },
    summaryKo: '푸시다운과 덤벨 컬을 번갈아 하고 컨센트레이션 컬, 케이블 슈퍼세트로 끝내는 벌크 중 팔 운동이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 10–12회 3세트, 15–20회 3세트' },
          { exerciseId: 'seed-dumbbell-curl', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '이어서 실패까지 1세트' },
          { exerciseId: 'seed-concentration-curl', sets: 2, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-curl', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 푸시다운과 슈퍼세트, 실패까지' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ar-light',
    topicId: 'pro-arms',
    labelKo: '가벼운 날 팔',
    source: {
      videoId: 'izHXt20qflc',
      title: 'Why Light Days Are Needed? | Full Arm Workout',
      channel: 'Beastmode Jones',
      channelUrl: 'https://www.youtube.com/@BeastmodeJones316',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '삼두 먼저, 이두 나중으로 나눠 반복을 넉넉히 가져가는 팔 날이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-close-grip-bench-press', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dips', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 한 팔 리버스 푸시다운 3세트를 더 해요' },
          { exerciseId: 'seed-preacher-curl', sets: 4, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-concentration-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-hammer-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-curl', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ar-pick',
    topicId: 'pro-arms',
    labelKo: '8종 팔',
    source: {
      videoId: 'B7dffi_tJ8U',
      title: 'Arm Workout (with Derrione Hill) | Pick The Best Exercises For YOU',
      channel: 'Beastmode Jones',
      channelUrl: 'https://www.youtube.com/@BeastmodeJones316',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '모든 종목을 네 세트씩 하는 고볼륨 팔 운동이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-incline-triceps-extension', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-overhead-extension', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dips', sets: 4, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-concentration-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-reverse-curl-cable', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-preacher-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-hammer-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ar-big',
    topicId: 'pro-arms',
    labelKo: '큰 팔 4종',
    source: {
      videoId: 'zG01IbFAdXE',
      title: 'HUNTER LABRADA | BUILD BIG ARMS | The secret behind Hunter\'s arms | Ultimate Arm Workout Guide',
      channel: 'Hunter Labrada',
      channelUrl: 'https://www.youtube.com/@hunter_labrada',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '프리처 컬과 익스텐션을 번갈아 하는 네 가지 팔 운동이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-preacher-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pu-20',
    topicId: 'pro-push',
    // 영상 제목에 약물 관련 문구가 있어 앱에 내지 않는다(2026-11-05 · 추천안으로 처리)
    hidden: true,
    labelKo: '20회 푸시',
    source: {
      videoId: 'ejVQJ32X3j0',
      title: '20 Reps Push Day | KPV | Peptide Stack | 282 LB | Nick Walker | Chest Delts Triceps',
      channel: 'Nick Walker',
      channelUrl: 'https://www.youtube.com/@NickWalker39',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '플라이부터 시작해 모든 종목을 15–20회로 하고 마지막 세트는 쉬어 가며 이어 가는 높은 반복 푸시 날이에요.',
    days: [
      {
        nameKo: '푸시',
        items: [
          { exerciseId: 'seed-pec-deck-fly', sets: 5, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 레스트포즈' },
          { exerciseId: 'seed-incline-press-machine', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 레스트포즈' },
          { exerciseId: 'seed-chest-press-machine', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 레스트포즈' },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서 · 영상은 서서도 3세트 더 해요' },
          { exerciseId: 'seed-triceps-pushdown', sets: 5, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: 'EZ바 푸시다운에서 익스텐션으로 슈퍼세트' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pu-offseason',
    topicId: 'pro-push',
    labelKo: '오프시즌 푸시',
    source: {
      videoId: 'b_RFFwvfYHc',
      title: 'Push Workout | The Mental Side of Bodybuilding No One Talks About | Nick Walker ',
      channel: 'Nick Walker',
      channelUrl: 'https://www.youtube.com/@NickWalker39',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '가슴 플라이로 시작해 프레스 두 가지, 측면과 전면, 삼두, 딥스로 끝내요. 마지막 세트는 쉬어 가며 이어 가요.',
    days: [
      {
        nameKo: '푸시',
        items: [
          { exerciseId: 'seed-pec-deck-fly', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '설명란: 종목마다 2세트, 마지막 세트 레스트포즈' },
          { exerciseId: 'seed-chest-press-machine', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '설명란: 종목마다 2세트, 마지막 세트 레스트포즈' },
          { exerciseId: 'seed-incline-press-machine', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '설명란: 종목마다 2세트, 마지막 세트 레스트포즈' },
          { exerciseId: 'seed-machine-lateral-raise', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '설명란: 종목마다 2세트, 마지막 세트 레스트포즈' },
          { exerciseId: 'seed-side-lateral-raise', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '설명란: 종목마다 2세트, 마지막 세트 레스트포즈' },
          { exerciseId: 'seed-front-raise-cable', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '설명란: 종목마다 2세트, 마지막 세트 레스트포즈' },
          { exerciseId: 'seed-triceps-pushdown', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '설명란: 종목마다 2세트, 마지막 세트 레스트포즈' },
          { exerciseId: 'seed-dips', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '설명란: 종목마다 2세트, 마지막 세트 레스트포즈' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pu-angle',
    topicId: 'pro-push',
    labelKo: '각도 푸시',
    source: {
      videoId: '_-BAh-OTitw',
      title: 'Push Day Workout | Thoughts On Dumbbell Fly vs Cable Fly???',
      channel: 'Beastmode Jones',
      channelUrl: 'https://www.youtube.com/@BeastmodeJones316',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '머신과 덤벨로 여러 각도에서 가슴을 다루고 어깨, 삼두까지 끝내는 구성이에요.',
    days: [
      {
        nameKo: '푸시',
        items: [
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-incline-press-machine', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-incline-dumbbell-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dips', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 실패까지' },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pu-art',
    topicId: 'pro-push',
    labelKo: '10종 푸시',
    source: {
      videoId: 'NejFMSKXbbk',
      title: 'Push Day | \'\'Hit Those Angles. Bodybuilding Is An Art.\'\' | (feat. Shawna Cottle)',
      channel: 'Beastmode Jones',
      channelUrl: 'https://www.youtube.com/@BeastmodeJones316',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '프레스로 시작해 가슴·어깨·삼두를 모두 세 세트씩 채워요.',
    days: [
      {
        nameKo: '푸시',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-incline-press', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩' },
          { exerciseId: 'seed-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pu-update',
    topicId: 'pro-push',
    labelKo: '2023 푸시',
    source: {
      videoId: 'MQ4Riz8byU8',
      title: 'Updated PUSH Workout at Mi40 Gym with Colby Hartz',
      channel: 'Ruff Diesel',
      channelUrl: 'https://www.youtube.com/@RuffDiesel',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '프레스와 플라이, 숄더 프레스, 삼두, 측면으로 이어지는 다섯 가지 구성이에요.',
    days: [
      {
        nameKo: '푸시',
        items: [
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-lateral-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pu-epic',
    topicId: 'pro-push',
    labelKo: '선수 셋의 푸시',
    source: {
      videoId: 'R3aoMrdIMio',
      title: 'Epic PUSH Workout with @UrsKalecinski & @HypertrophyCoach',
      channel: 'Ruff Diesel',
      channelUrl: 'https://www.youtube.com/@RuffDiesel',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '인클라인 머신 프레스로 시작해 케이블 플라이, 숄더 프레스, 삼두, Y 레이즈까지 함께 하는 푸시 날이에요.',
    days: [
      {
        nameKo: '푸시',
        items: [
          { exerciseId: 'seed-incline-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-seated-cable-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-y-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pu-bulk',
    topicId: 'pro-chest',
    labelKo: '벌크업 가슴·측면',
    source: {
      videoId: 'LR40kt9iEWw',
      title: 'Winter Bulk Day 16 - Chest and Side Delts',
      channel: 'Sam Sulek',
      channelUrl: 'https://www.youtube.com/@sam_sulek',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/sam-sulek-bulking-chest-side-delts-workout/' },
    summaryKo: '스미스 인클라인을 무겁게 하고 케이블 프레스·플라이, 측면 레이즈로 마무리해요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-incline-press-smith', sets: 2, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-standing-cable-chest-press', sets: 2, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-crossover', sets: 1, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-machine-lateral-raise', sets: 1, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pl-13w',
    topicId: 'pro-pull',
    labelKo: '등·팔 대회 13주 전',
    source: {
      videoId: 'qTEHt4a6Bm4',
      title: 'Arnold 13 Weeks Out | Back & Arms Workout | Nick Walker ',
      channel: 'Nick Walker',
      channelUrl: 'https://www.youtube.com/@NickWalker39',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '로우 네 가지와 풀오버 뒤에 후면, 삼두, 이두까지 이어지는 풀 날이에요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-chest-supported-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-t-bar-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-pullover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-rear-delt-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-incline-skull-crusher', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-preacher-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pl-5w',
    topicId: 'pro-pull',
    labelKo: '등·이두 5주 전',
    source: {
      videoId: 'MCurJq1XUR8',
      title: '5 Weeks Out | Back & Bicep Workout  | 2023 Mr. Olympia',
      channel: 'Derek Lunsford',
      channelUrl: 'https://www.youtube.com/@dereklunsford_',
      verifiedAt: '2026-11-05',
    },
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/derek-lunsford-pull-day-workout/' },
    summaryKo: '풀다운으로 넓이를 잡고 로우와 랙 풀로 두께를 채운 뒤 해머 컬로 끝내요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '좁은 뉴트럴 그립과 넓은 그립' },
          { exerciseId: 'seed-low-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-rack-pull', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-supported-t-bar-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-hammer-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pl-2w',
    topicId: 'pro-pull',
    labelKo: '대회 2주 전 풀',
    source: {
      videoId: 'cuGOePsIMi0',
      title: '2 WEEKS OUT; Pull Workout + Posing',
      channel: 'Ruff Diesel',
      channelUrl: 'https://www.youtube.com/@RuffDiesel',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '세트 수를 적게 가져가고 슈퍼세트·트라이세트로 강도를 올리는 대회 직전 풀 날이에요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-chest-supported-row', sets: 2, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '풀다운과 슈퍼세트로 2세트 더 해요' },
          { exerciseId: 'seed-machine-lat-pulldown', sets: 1, repsMin: 6, repsMax: 6, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 · 영상은 양팔로도 슈퍼세트' },
          { exerciseId: 'seed-t-bar-row', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '넓은 그립 · 트라이세트' },
          { exerciseId: 'seed-pull-up', sets: 2, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '트라이세트' },
          { exerciseId: 'seed-seated-cable-row', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '넓은 그립 · 트라이세트' },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 1, repsMin: 5, repsMax: 5, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pl-heavy',
    topicId: 'pro-pull',
    labelKo: '무거운 등·이두',
    source: {
      videoId: 'oe51rsdewuE',
      title: 'HEAVY Back & Biceps with Men\'s Physique Pro @IsmaelMartinezd',
      channel: 'Ruff Diesel',
      channelUrl: 'https://www.youtube.com/@RuffDiesel',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '한 팔 풀다운과 체스트 서포티드 티바에 루마니안 데드리프트, 후면, 이두를 슈퍼세트로 더하는 구성이에요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-supported-t-bar-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-romanian-deadlift', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-hyperextension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-concentration-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-cable-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pl-9',
    topicId: 'pro-pull',
    labelKo: '9종 풀',
    source: {
      videoId: 'mXcG-w1fxpY',
      title: 'Back & Biceps Routine | Meal At Cowboy Chicken',
      channel: 'Beastmode Jones',
      channelUrl: 'https://www.youtube.com/@BeastmodeJones316',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '풀업과 로우로 등을 채우고 이두 세 가지로 끝내는 풀 날이에요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-pull-up', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-standing-row', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩' },
          { exerciseId: 'seed-t-bar-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '좁은 그립' },
          { exerciseId: 'seed-incline-dumbbell-curl', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩' },
          { exerciseId: 'seed-machine-preacher-curl', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pl-raw',
    topicId: 'pro-pull',
    labelKo: '필터 없는 풀',
    source: {
      videoId: 'OM5sofQBtqo',
      title: 'Back & Biceps Workout (feat: Angel Diaz) | Raw Footage!!!',
      channel: 'Beastmode Jones',
      channelUrl: 'https://www.youtube.com/@BeastmodeJones316',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '넓은 풀업과 스트레이트 암 풀다운을 묶어 시작하고 로우 세 가지, 이두 두 가지로 이어 가요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-pull-up', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '스트레이트 암 풀다운과 슈퍼세트' },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-t-bar-row', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-row-smith', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-chin-up', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-curl', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-hammer-curl', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pl-17d',
    topicId: 'pro-pull',
    labelKo: '대회 17일 전 풀',
    source: {
      videoId: 'mAZNhXBLO7E',
      title: 'SHREDDED BACK WORKOUT | FULL SHAPE REVEAL 17 DAYS OUT',
      channel: 'Wesley Vissers',
      channelUrl: 'https://www.youtube.com/@VintageGenetics',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '어시스트 풀업부터 머신 로우, 후면, 이두 세 가지까지 두 세트씩 다루는 대회 직전 구성이에요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-assisted-pull-up', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 12–15회' },
          { exerciseId: 'seed-high-row', sets: 2, repsMin: 8, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–10회, 15–20회' },
          { exerciseId: 'seed-low-row', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 15회 + 레스트포즈 2세트' },
          { exerciseId: 'seed-machine-row', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '한 팔 8–10회, 양팔 8–12회 + 레스트포즈' },
          { exerciseId: 'seed-machine-lat-pulldown', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8회, 15회' },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 2, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '케이블 풀오버' },
          { exerciseId: 'seed-reverse-pec-deck', sets: 2, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 15회, 15–20회 + 더블 드롭' },
          { exerciseId: 'seed-barbell-curl', sets: 2, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-machine-preacher-curl', sets: 2, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 2, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-fb-2day',
    topicId: 'pro-full',
    labelKo: '입문자 무분할 2일',
    source: {
      videoId: 'CUYm0MN9cBM',
      title: '운동하는 직장인 분들에게',
      channel: '강경원',
      channelUrl: 'https://www.youtube.com/@kangkyungwon',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '직장인 입문자에게 권하는 무분할이에요. 머신 위주로 날마다 순서만 바꿔요.',
    days: [
      {
        nameKo: 'Day 1',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '자세가 안 나오면 빼요' },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '스티프 데드리프트로 바꿔도 돼요' },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-lying-leg-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '크런치로 바꿔도 돼요' },
          { exerciseId: 'seed-superman', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '플랭크로 바꿔도 돼요' },
        ],
      },
      {
        nameKo: 'Day 2',
        items: [
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '자세가 안 나오면 빼요' },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '스티프 데드리프트로 바꿔도 돼요' },
          { exerciseId: 'seed-lying-leg-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '크런치로 바꿔도 돼요' },
          { exerciseId: 'seed-superman', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '플랭크로 바꿔도 돼요' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-fb-8',
    topicId: 'pro-full',
    labelKo: '하루 전신',
    source: {
      videoId: 'Gbtd8NUAhck',
      title: 'Full Body Workout (feat. Shawna Cottle) | With Commentary',
      channel: 'Beastmode Jones',
      channelUrl: 'https://www.youtube.com/@BeastmodeJones316',
      verifiedAt: '2026-11-05',
    },
    summaryKo: '풀업, 딥스로 시작해 하체, 가슴, 팔까지 세 세트씩 도는 하루 전신 운동이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-pull-up', sets: 3, repsMin: 5, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 패러럴·와이드 그립을 3세트씩 해요' },
          { exerciseId: 'seed-dips', sets: 3, repsMin: 5, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-curl', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  // ─── 초보자 루틴(2026-11-06 사용자 지시 · ADR-059) — 근거 = 설명란, 없으면 영상 댓글의 시청자 정리(basis 로 밝힘). 영상 본편과 대조하지 않았다.
  {
    id: 'cr-bg-fb-six',
    topicId: 'beginner-full',
    labelKo: '전신 6종',
    source: {
      videoId: 'O8D81rCN0XY',
      title: '무분할 전신루틴, 헬스장 주 1~2회만 간다면 이 6가지 순서로 하세요',
      channel: '핏블리 FITVELY',
      channelUrl: 'https://www.youtube.com/@fitvely',
      verifiedAt: '2026-11-06',
    },
    summaryKo: '가슴과 등을 번갈아 하고 하체로 마무리하는 전신 6종이에요. 헬스장에 주 1~2회만 갈 때 쓰는 구성이고, 가볍게 15회씩 해요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 5, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '20kg 바가 힘들면 덤벨 프레스로 대신해요' },
          { exerciseId: 'seed-assisted-pull-up', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-chest-press-machine', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 파워 레그프레스' },
          { exerciseId: 'seed-lying-leg-curl', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-fb-twice',
    topicId: 'beginner-full',
    labelKo: '주 2회 전신',
    source: {
      videoId: '_GPYjWqGoOE',
      title: '【전신루틴】 바쁜 사람을 위한 ‘주2회 헬스장 루틴’ 이대로만 하세요🔥 (운동순서,횟수,자세설명)',
      channel: '핏블리 FITVELY',
      channelUrl: 'https://www.youtube.com/@fitvely',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=_GPYjWqGoOE' },
    summaryKo: '바빠서 주 2회만 갈 때 쓰는 기구 위주 전신 6종이에요. 20회씩 3세트로 하고 끝에 유산소 30분을 더해요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-fb-3month',
    topicId: 'beginner-full',
    labelKo: '첫 달 3일 구성',
    source: {
      videoId: 'ixkQaZXVQjs',
      title: 'The PERFECT Beginner Workout (Sets and Reps Included)',
      channel: 'ATHLEAN-X™',
      channelUrl: 'https://www.youtube.com/@athleanx',
      verifiedAt: '2026-11-06',
    },
    summaryKo: '3개월 초보 프로그램의 첫 달이에요. 월·수·금에 전신 A와 B를 번갈아 하고, 화·목에 복근과 들고 걷기를 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '전신 A',
        items: [
          { exerciseId: 'seed-dumbbell-squat', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 한 팔씩 하는 덤벨 프레스' },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '기구는 근거에 없어 우리가 정했어요' },
          { exerciseId: 'seed-bodyweight-split-squat', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 다리마다 지칠 때까지' },
        ],
      },
      {
        nameKo: '전신 B',
        items: [
          { exerciseId: 'seed-cable-pull-through', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '기구는 근거에 없어 우리가 정했어요' },
          { exerciseId: 'seed-reverse-lunge', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '다리마다' },
          { exerciseId: 'seed-push-up', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 지칠 때까지' },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
      {
        nameKo: '복근·들고 걷기',
        items: [
          { exerciseId: 'seed-crunch', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 롤업 — 앱에 없어 크런치로 옮겼어요' },
          { exerciseId: 'seed-suitcase-carry', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 팔마다 지칠 때까지 걷기' },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-fb-six-plus',
    topicId: 'beginner-full',
    labelKo: '주 3회 전신 입문',
    source: {
      videoId: 'n_YW24F5HGc',
      title: 'The ONLY Workout You Need For 2027 (Do This 3x/Week)',
      channel: 'Jeremy Ethier',
      channelUrl: 'https://www.youtube.com/@JeremyEthier',
      verifiedAt: '2026-11-06',
    },
    summaryKo: '설명란에 입문자용으로 따로 적힌 전신 구성이에요. 주 2~3회 하고, 측면·후면 어깨는 이어서 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-goblet-squat', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-pull-up', sets: 3, repsMin: 5, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 뉴트럴 그립 · 못 하면 인버티드 로우부터' },
          { exerciseId: 'seed-romanian-deadlift-dumbbell', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '다음 종목과 이어서' },
          { exerciseId: 'seed-dumbbell-incline-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-fb-firstyear',
    topicId: 'beginner-full',
    labelKo: '첫해 전신 3일',
    source: {
      videoId: 'jJxWjUZWc3E',
      title: 'Following My First Year Diet & Training | 4,000 CALORIES + FREE Beginners Full Body Program',
      channel: 'Will Tennyson',
      channelUrl: 'https://www.youtube.com/@WillTennyson',
      verifiedAt: '2026-11-06',
    },
    summaryKo: '처음 시작한 때로 돌아간다면 하겠다는 주 3일 전신 프로그램이에요. 하루씩 쉬며 돌리고 무게를 조금씩 올려요. 영어 영상이에요.',
    days: [
      {
        nameKo: '1일',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 4, repsMin: 5, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-barbell-bench-press', sets: 4, repsMin: 5, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-pendlay-row', sets: 4, repsMin: 5, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '다음 종목과 슈퍼세트' },
          { exerciseId: 'seed-skull-crusher', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
        ],
      },
      {
        nameKo: '2일',
        items: [
          { exerciseId: 'seed-deadlift', sets: 4, repsMin: 5, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 데드리프트 변형 중 선택' },
          { exerciseId: 'seed-overhead-press', sets: 4, repsMin: 5, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-chest-supported-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '기구는 근거에 없어 우리가 정했어요' },
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-shrug', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '기구는 근거에 없어 우리가 정했어요' },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
      {
        nameKo: '3일',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 4, repsMin: 5, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-close-grip-bench-press', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-pendlay-row', sets: 4, repsMin: 5, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-reverse-pec-deck', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 뉴트럴 그립' },
          { exerciseId: 'seed-incline-dumbbell-curl', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-fb-novice',
    topicId: 'beginner-full',
    labelKo: '입문 근비대 3일',
    source: {
      videoId: '_4wWgin1dVY',
      title: 'Free novice program for hypertrophy',
      channel: 'Natural Hypertrophy',
      channelUrl: 'https://www.youtube.com/@NaturalHypertrophy',
      verifiedAt: '2026-11-06',
    },
    summaryKo: '스쿼트·벤치·데드리프트를 하루에 하나씩 무겁게 하고 보조 운동을 더하는 월·수·금 프로그램이에요. 영어 영상이에요.',
    days: [
      {
        nameKo: '월',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 4, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 무거운 1~3세트' },
          { exerciseId: 'seed-romanian-deadlift', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 데드리프트 변형' },
          { exerciseId: 'seed-pull-up', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '가능한 만큼' },
          { exerciseId: 'seed-skull-crusher', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-hammer-curl', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-push-up', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 가능한 만큼, 복근 추가' },
        ],
      },
      {
        nameKo: '수',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 6, repsMin: 4, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 무거운 1~3세트(4~8회) 뒤 3세트 이상(6~10회)' },
          { exerciseId: 'seed-overhead-press', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-chin-up', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '가능한 만큼' },
          { exerciseId: 'seed-hyperextension', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-cable-row', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-crunch', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 복근 운동을 가능한 만큼' },
        ],
      },
      {
        nameKo: '금',
        items: [
          { exerciseId: 'seed-deadlift', sets: 3, repsMin: 2, repsMax: 5, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 무거운 1~3세트' },
          { exerciseId: 'seed-front-squat', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 스쿼트 변형' },
          { exerciseId: 'seed-pull-up', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-ez-bar-curl', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-push-up', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 가능한 만큼, 복근 추가' },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-fb-afterwork',
    topicId: 'beginner-full',
    labelKo: '퇴근 후 전신 7종',
    source: {
      videoId: '92SXBcTzoco',
      title: '퇴근 후 헬스장 가면 이 전신루틴 6가지만 하세요｜직장인 초보 운동',
      channel: '제로범TV _김영범',
      channelUrl: 'https://www.youtube.com/@boom__star',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=92SXBcTzoco' },
    summaryKo: '직장인 초보를 위한 전신 구성이에요. 프레스로 시작해 등과 하체를 거쳐 측면·후면 어깨 슈퍼세트로 마무리해요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-incline-press', sets: 3, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '시청자 정리는 바벨 프레스 15회씩 3세트 이상 · 정리마다 바벨·덤벨이 달라요' },
          { exerciseId: 'seed-assisted-pull-up', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '정리에 따라 턱걸이' },
          { exerciseId: 'seed-goblet-squat', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '일자 바 추천' },
          { exerciseId: 'seed-romanian-deadlift-dumbbell', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '기구는 근거에 없어 우리가 정했어요' },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '다음 종목과 슈퍼세트' },
          { exerciseId: 'seed-dumbbell-incline-rear-delt-fly', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-fb-onehour',
    topicId: 'beginner-full',
    labelKo: '1시간 기구 전신',
    source: {
      videoId: 'o82RrvHYkJQ',
      title: '\'두쫀쿠\' 먹고 살 쪄서 헬스장 등록하는 사람들을 위한 1시간 \'전신 무분할 루틴\'',
      channel: '마선호',
      channelUrl: 'https://www.youtube.com/@Masunho',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=o82RrvHYkJQ' },
    summaryKo: '헬스장을 막 등록한 사람을 위한 1시간 기구 전신이에요. 근력 뒤에 유산소 30분을 더해요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-chest-press-machine', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-cable-row', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '정리에는 풀업도 있어요' },
          { exerciseId: 'seed-shoulder-press-machine', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-smith-machine-squat', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-fb-five',
    topicId: 'beginner-full',
    labelKo: '처음 5가지 전신',
    source: {
      videoId: 'pXzEw2D8bds',
      title: '헬스장 처음이라면 이렇게 운동 해보세요ㅣ헬스(헬린이) 초보자를 위한 5가지 전신운동루틴(가슴/등/하체/어깨)',
      channel: 'MSG훈',
      channelUrl: 'https://www.youtube.com/@msg2304',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=pXzEw2D8bds' },
    summaryKo: '헬스장이 처음일 때 가슴·등·어깨·하체를 기구 위주로 도는 5종이에요. 15~20회씩 3~4세트로 해요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트' },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트' },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트' },
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 기구는 근거에 없어 우리가 정했어요' },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 롱풀 머신 · 3~4세트' },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-fb-escape',
    topicId: 'beginner-full',
    labelKo: '초보 탈출 1시간',
    source: {
      videoId: 'E-DCLPwZwUI',
      title: '헬스 초보 탈출 루틴!! 헬스장 1시간 완전 공략(스트레칭,근력,유산소)',
      channel: '웨이트연구소 I 덕코치',
      channelUrl: 'https://www.youtube.com/@%EC%9B%A8%EC%9D%B4%ED%8A%B8%EC%97%B0%EA%B5%AC%EC%86%8C%EB%8D%95%EC%BD%94%EC%B9%98',
      verifiedAt: '2026-11-06',
    },
    summaryKo: '유산소와 스트레칭으로 시작해 등·가슴·하체·어깨 순서로 하고 인터벌로 끝내는 1시간 구성이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-smith-machine-bench-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-sp-three',
    topicId: 'beginner-split',
    labelKo: '기본 3분할',
    source: {
      videoId: 'GTGhXj6uEok',
      title: '무슨 운동을 언제, 어떻게 해야 할지 모르는 당신에게 (feat. 3분할)',
      channel: '마선호',
      channelUrl: 'https://www.youtube.com/@Masunho',
      verifiedAt: '2026-11-06',
    },
    summaryKo: '무엇을 할지 모를 때 쓰는 3분할이에요. 밀기, 당기기, 하체와 복근 순서로 나눠요. 날 구분은 설명란의 종목 순서를 보고 우리가 묶었어요.',
    days: [
      {
        nameKo: '밀기',
        items: [
          { exerciseId: 'seed-pec-deck-fly', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-press-machine', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '기구는 근거에 없어 우리가 정했어요' },
          { exerciseId: 'seed-shoulder-press-machine', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '기구는 근거에 없어 우리가 정했어요' },
          { exerciseId: 'seed-side-lateral-raise', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
      {
        nameKo: '당기기',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-low-row', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-row', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-incline-rear-delt-fly', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-curl', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
      {
        nameKo: '하체·복근',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '기구는 근거에 없어 우리가 정했어요' },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-leg-extension', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-crunch', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-reverse-crunch', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-sp-backarm',
    topicId: 'beginner-split',
    labelKo: '3분할 중 등·팔',
    source: {
      videoId: 'CbWXVgw-Q9k',
      title: '초중급자 3분할 루틴 ② 등·팔 편 (성장 보장 루틴)',
      channel: '제로범TV _김영범',
      channelUrl: 'https://www.youtube.com/@boom__star',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=CbWXVgw-Q9k' },
    summaryKo: '초중급자용 3분할의 둘째 날이에요. 등 세 가지 뒤에 이두와 삼두를 케이블로 해요. 다른 두 날은 종목을 확인하지 못해 넣지 않았어요.',
    days: [
      {
        nameKo: '등·팔',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-machine-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 언더그립 · 일자 바' },
          { exerciseId: 'seed-behind-the-back-cable-curl', sets: 3, repsMin: 12, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 한 팔씩' },
          { exerciseId: 'seed-cable-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-sp-upper',
    topicId: 'beginner-split',
    labelKo: '2분할 중 상체',
    source: {
      videoId: 'kjNQbNyc8ow',
      title: '2분할 루틴 상체편 이렇게만 하면 충분합니다',
      channel: '제로범TV _김영범',
      channelUrl: 'https://www.youtube.com/@boom__star',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=kjNQbNyc8ow' },
    summaryKo: '초중급자용 2분할의 상체 날이에요. 가슴·등·어깨를 두 종목씩 해요. 하체 날은 이 영상에 없어요.',
    days: [
      {
        nameKo: '상체',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '스미스 인클라인으로 해도 돼요' },
          { exerciseId: 'seed-dumbbell-fly', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 인클라인 덤벨 로우' },
          { exerciseId: 'seed-dumbbell-incline-rear-delt-fly', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '앞 종목 뒤에 바로' },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-sp-upper3',
    topicId: 'beginner-split',
    labelKo: '첫 상체 3종',
    source: {
      videoId: 'trQHr9Ft2cg',
      title: '헬린이 상체루틴, 헬스장 처음이면 이 순서대로만 하세요',
      channel: '핏블리 FITVELY',
      channelUrl: 'https://www.youtube.com/@fitvely',
      verifiedAt: '2026-11-06',
    },
    summaryKo: '당기고, 밀고, 머리 위로 미는 순서로 하는 상체 3종이에요. 안 쓰던 근육에 익숙해지도록 높은 횟수로 해요.',
    days: [
      {
        nameKo: '상체',
        items: [
          { exerciseId: 'seed-machine-row', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '없으면 케이블로 해요' },
          { exerciseId: 'seed-chest-press-machine', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-sp-chestsh',
    topicId: 'beginner-split',
    labelKo: '첫 가슴·어깨',
    source: {
      videoId: 'Cb0yy0yHRUg',
      title: '헬스장이 처음이라면 이대로만 따라하세요! 헬스 초보자용 가슴+어깨 상체운동 루틴',
      channel: '핏블리 FITVELY',
      channelUrl: 'https://www.youtube.com/@fitvely',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=Cb0yy0yHRUg' },
    summaryKo: '가슴 다음 어깨 순서로 두 종목만 해요. 15회로 몸을 풀고 12회를 네 번 해요.',
    days: [
      {
        nameKo: '가슴·어깨',
        items: [
          { exerciseId: 'seed-chest-press-machine', sets: 5, repsMin: 12, repsMax: 15, restSec: 40, src: { sets: 'video', reps: 'video' }, noteKo: '첫 세트 15회, 이후 12회 4세트 · 쉬는 시간 30~50초' },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 5, repsMin: 12, repsMax: 15, restSec: 40, src: { sets: 'video', reps: 'video' }, noteKo: '첫 세트 15회, 이후 12회 4세트 · 쉬는 시간 30~50초' },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-pt-chest-hcs',
    topicId: 'beginner-part',
    labelKo: '초보 가슴 6종',
    source: {
      videoId: 'UqlUZFZgczk',
      title: '초보자를 위한 황철순의 가슴운동 루틴',
      channel: 'CHUL SOON HWANG',
      channelUrl: 'https://www.youtube.com/@chulsoonofficial',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=UqlUZFZgczk' },
    summaryKo: '초보자에게 바벨·머신·덤벨로 가슴 쓰는 느낌을 잡아 주는 영상이에요. 다룬 종목을 순서대로 옮겼고, 전부 하라는 처방은 아니에요. 세트·횟수는 확인하지 못해 기본값으로 뒀어요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '기구는 근거에 없어 우리가 정했어요' },
          { exerciseId: 'seed-incline-press-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 플랫·와이드 머신을 모두 다뤄요' },
          { exerciseId: 'seed-dumbbell-bench-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-pt-back-hcs',
    topicId: 'beginner-part',
    labelKo: '등 기초 4종',
    source: {
      videoId: 'hHcdb6q9aaE',
      title: '[핏플렉스 X 프로팁] EP.02 등의 정석 기초편!ㅣ게스트 황철순 프로',
      channel: '핏플렉스(FITFLEX)',
      channelUrl: 'https://www.youtube.com/@fitflex.official',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=hHcdb6q9aaE' },
    summaryKo: '프로 선수가 등 운동의 기본을 설명하는 기초편의 종목들이에요. 세트·횟수는 확인하지 못해 기본값으로 뒀어요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-pt-sh-hcs',
    topicId: 'beginner-part',
    labelKo: '어깨 기초 4종',
    source: {
      videoId: '3OFjsL-YZvs',
      title: '[핏플렉스 X 프로팁] EP.03 어깨의 정석 기초+심화편!ㅣ게스트 황철순 프로',
      channel: '핏플렉스(FITFLEX)',
      channelUrl: 'https://www.youtube.com/@fitflex.official',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=3OFjsL-YZvs' },
    summaryKo: '프레스 두 가지 뒤에 후면과 측면 레이즈로 마무리하는 기초·심화편의 종목들이에요. 세트·횟수는 확인하지 못해 기본값으로 뒀어요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-overhead-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-rear-delt-fly', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-pt-arm-hcs',
    topicId: 'beginner-part',
    labelKo: '팔 기본 6종',
    source: {
      videoId: 'vlDbSMToyeo',
      title: '[핏플렉스 X 프로팁] EP.04 팔의 기본 루틴 핵심만 빠르게!ㅣ게스트 황철순 프로',
      channel: '핏플렉스(FITFLEX)',
      channelUrl: 'https://www.youtube.com/@fitflex.official',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=vlDbSMToyeo' },
    summaryKo: '이두 세 가지와 삼두 세 가지로 구성한 기본 팔 운동이에요. 세트·횟수는 확인하지 못해 기본값으로 뒀어요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-preacher-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '기구는 근거에 없어 우리가 정했어요' },
          { exerciseId: 'seed-hammer-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-skull-crusher', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '기구는 근거에 없어 우리가 정했어요' },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-pt-main-a',
    topicId: 'beginner-part',
    labelKo: '메인 깊게 가슴·등',
    source: {
      videoId: 'iv8reqGucYE',
      title: '제가 추천하는 부위별 운동 - 가슴, 등, 복근',
      channel: '강경원',
      channelUrl: 'https://www.youtube.com/@kangkyungwon',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=iv8reqGucYE' },
    summaryKo: '종목을 늘리기보다 메인 운동의 세트를 늘리라는 조언에 맞춰, 초보자 추천 종목만 담았어요.',
    days: [
      {
        nameKo: '가슴·등·복근',
        items: [
          { exerciseId: 'seed-chest-press-machine', sets: 5, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '댓글에 5세트·10세트가 함께 언급돼요' },
          { exerciseId: 'seed-lat-pulldown', sets: 5, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '댓글에 5세트·10세트가 함께 언급돼요' },
          { exerciseId: 'seed-lying-leg-raise', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-pt-main-b',
    topicId: 'beginner-part',
    labelKo: '메인 깊게 어깨·팔·하체',
    source: {
      videoId: 'D7iZMIy0C5E',
      title: '제가 추천하는 부위별 운동 - 어깨, 팔, 하체 (초, 중급자 이 영상으로 끝내세요, 강경원 추천 루틴 완결편)',
      channel: '강경원',
      channelUrl: 'https://www.youtube.com/@kangkyungwon',
      verifiedAt: '2026-11-06',
    },
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=D7iZMIy0C5E' },
    summaryKo: '어깨는 프레스 위주로, 팔과 하체는 기본 종목만 담았어요. 부위별 추천을 우리가 두 날로 묶었어요.',
    days: [
      {
        nameKo: '어깨·팔',
        items: [
          { exerciseId: 'seed-overhead-press', sets: 5, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '댓글에 프레스 위주로 세트를 늘리라는 언급이 있어요' },
          { exerciseId: 'seed-barbell-curl', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-extension', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-squat', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-pt-back-10',
    topicId: 'beginner-part',
    labelKo: '등 10세트',
    source: {
      videoId: '5jZ940J6w6Y',
      title: '등운동 루틴 초보, 이대로 10세트만 따라하세요',
      channel: '핏블리 FITVELY',
      channelUrl: 'https://www.youtube.com/@fitvely',
      verifiedAt: '2026-11-06',
    },
    summaryKo: '위에서 당기는 운동과 앞에서 당기는 운동을 5세트씩 해요. 12회를 못 채우면 무게를 낮춰요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 5, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '첫 세트 15회, 이후 12회 4세트 · 와이드 그립' },
          { exerciseId: 'seed-seated-cable-row', sets: 5, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '첫 세트 15회, 이후 12회 4세트 · 영상은 수평 당기기' },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-pt-legs-5',
    topicId: 'beginner-part',
    labelKo: '하체 5종 순서',
    source: {
      videoId: 'Tr9lfMZlFDA',
      title: '【하체루틴】 헬스 초보자는 하체운동 \'이 순서\' 그대로 하세요!',
      channel: '핏블리 FITVELY',
      channelUrl: 'https://www.youtube.com/@fitvely',
      verifiedAt: '2026-11-06',
    },
    summaryKo: '운동을 많이 안 해 본 사람도 할 수 있게 고른 하체 순서예요. 스미스 스쿼트로 시작해 머신으로 마무리해요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-smith-machine-squat', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-hip-thrust', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '기구는 근거에 없어 우리가 정했어요' },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  // ── 2026-11-09 보강(SPEC-047 Phase 3) — 공식 Data API 설명란 기준 · 채널 업로드 목록으로 후보를 찾음 ──
  {
    id: 'cr-pro-fb-abc',
    topicId: 'pro-full',
    labelKo: '주 3회 전신 A·B·C',
    source: {
      videoId: 'B12MXF0bSFo',
      title: 'The #1 Full Body Routine to Build Muscle & Lose Fat',
      channel: 'Jeremy Ethier',
      channelUrl: 'https://www.youtube.com/@JeremyEthier',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '한 주에 세 번, 날마다 다른 6~7종으로 온몸을 도는 전신 루틴이에요. 마지막 세트는 늘어난 자리에서 반쪽 반복 3~5회를 더해요. 영어 영상이에요.',
    days: [
      {
        nameKo: 'A',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 6, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 뒤 아래쪽 반쪽 반복 3~5회' },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 레그 컬 동작으로만 적음' },
          { exerciseId: 'seed-incline-dumbbell-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '덤벨 오버헤드 익스텐션과 슈퍼세트' },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' } },
        ],
      },
      {
        nameKo: 'B',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 3, repsMin: 4, repsMax: 6, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-romanian-deadlift', sets: 3, repsMin: 6, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 뒤 늘어난 자리 반쪽 반복 3~5회' },
          { exerciseId: 'seed-walking-lunge', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '다리마다' },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '몸 뒤로 지나가게 · 리버스 크런치와 슈퍼세트' },
          { exerciseId: 'seed-reverse-crunch', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'default' } },
        ],
      },
      {
        nameKo: 'C',
        items: [
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서' },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-hip-thrust', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '대안: 덤벨 스텝업' },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-cable-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-standing-calf-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '케이블 리어 델트 플라이와 슈퍼세트' },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-fb-pure',
    topicId: 'pro-full',
    labelKo: '보디빌딩 전신 6종',
    source: {
      videoId: 'czkGj5vJEFQ',
      title: 'My New Science-Based Full Body Workout For Pure Bodybuilding',
      channel: 'Jeff Nippard',
      channelUrl: 'https://www.youtube.com/@JeffNippard',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '보디빌딩 프로그램의 전신 버전 중 하루예요. 등·가슴·하체를 한 번씩 돌고 페이스 풀과 복근으로 끝내요. 영어 영상이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 몸을 가로질러 당기기' },
          { exerciseId: 'seed-incline-press-smith', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '낮은 각도' },
          { exerciseId: 'seed-hip-adduction-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 8, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-face-pull', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '누워서 · 당긴 자리에서 멈춤' },
          { exerciseId: 'seed-cable-crunch', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-fb-er',
    topicId: 'pro-full',
    labelKo: '유효 반복 전신 A·B',
    source: {
      videoId: 'Ag7Dui9Plys',
      title: 'The Most EFFECTIVE Total Body Workout (HIT EVERY MUSCLE)',
      channel: 'ATHLEAN-X™',
      channelUrl: 'https://www.youtube.com/@athleanx',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '주 3회 A·B를 번갈아 하는 전신 루틴이에요. 12회 한계 무게로 한 세트를 한 뒤 짧게 쉬며 유효 반복을 채우는 방식이라 세트 수는 정해져 있지 않아요. 영어 영상이에요.',
    days: [
      {
        nameKo: 'A',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: '12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: '언더핸드 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
          { exerciseId: 'seed-upright-row-dumbbell', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 덤벨 하이 풀 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
          { exerciseId: 'seed-dumbbell-pullover', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: 'PJR 풀오버 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
          { exerciseId: 'seed-goblet-squat', sets: 3, repsMin: 20, repsMax: 20, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: '20회 한계 무게 · 유효 반복 40회' },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: '선택 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
          { exerciseId: 'seed-romanian-deadlift', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: '12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
        ],
      },
      {
        nameKo: 'B',
        items: [
          { exerciseId: 'seed-dips', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: '중량 또는 맨몸 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
          { exerciseId: 'seed-cable-high-row', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: '한 팔씩 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: '한 팔씩 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: '12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
          { exerciseId: 'seed-dumbbell-reverse-lunge', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: '다리마다 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'default' }, noteKo: '12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-fb-once',
    topicId: 'pro-full',
    labelKo: '주 1회 전신 9종',
    source: {
      videoId: 'rL5FdSd1tQ4',
      title: 'The BEST Exercises For A Full Body Workout',
      channel: 'Mike Thurston',
      channelUrl: 'https://www.youtube.com/@MikeThurston',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '한 주에 한 번만 운동한다면 어떻게 할지 보여 주는 전신 루틴이에요. 9종 모두 3세트 8~12회로 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '티바 로우와 슈퍼세트' },
          { exerciseId: 'seed-t-bar-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-pendulum-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩' },
          { exerciseId: 'seed-machine-lateral-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-bulgarian-split-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 · 케이블 트라이셉스 익스텐션과 슈퍼세트' },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상 표기 케이블 트라이셉스 익스텐션' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-fb-silver',
    topicId: 'pro-full',
    labelKo: '실버 에라 전신 3일',
    source: {
      videoId: 'g-pqgciOSgE',
      title: 'Silver Era Aesthetics Program (Steve Reeves Physique Workout)',
      channel: 'Natural Hypertrophy',
      channelUrl: 'https://www.youtube.com/@NaturalHypertrophy',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '1950년대 보디빌더의 몸을 본뜬 주 3회 전신 프로그램이에요. 월·수·금마다 두 종목씩 짝지어 번갈아 해요. 설명란에 대안 종목도 있는데 첫 번째 것만 담았어요. 영어 영상이에요.',
    days: [
      {
        nameKo: '월',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 케이블 시티드 로우와 짝' },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트' },
          { exerciseId: 'seed-incline-press', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 바벨 또는 덤벨 · 리버스 컬과 짝' },
          { exerciseId: 'seed-reverse-barbell-curl', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트' },
          { exerciseId: 'seed-romanian-deadlift', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '업라이트 로우·넥 컬과 묶음' },
          { exerciseId: 'seed-upright-row', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lying-neck-curl', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-curl', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '프렌치 프레스·시티드 카프 레이즈와 묶음' },
          { exerciseId: 'seed-ez-bar-overhead-triceps-extension', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '프렌치 프레스' },
          { exerciseId: 'seed-seated-calf-raise', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' } },
        ],
      },
      {
        nameKo: '수',
        items: [
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 슈러그와 짝' },
          { exerciseId: 'seed-barbell-shrug', sets: 3, repsMin: 12, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 넓은 그립' },
          { exerciseId: 'seed-dips', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 중량 · 스플릿 스쿼트와 짝' },
          { exerciseId: 'seed-split-squat', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트' },
          { exerciseId: 'seed-chin-up', sets: 3, repsMin: 4, repsMax: 6, src: { sets: 'video', reps: 'video' }, noteKo: '중량 · 숄더 프레스·레그 컬과 묶음' },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '펠리컨 컬 · 푸시다운·레터럴 레이즈와 묶음' },
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
      {
        nameKo: '금',
        items: [
          { exerciseId: 'seed-deadlift', sets: 3, repsMin: 3, repsMax: 5, src: { sets: 'video', reps: 'video' }, noteKo: '3회 3세트 또는 5회 3세트 · 케이블 익스텐션과 짝' },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상 표기 케이블 트라이셉스 익스텐션' },
          { exerciseId: 'seed-overhead-press', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 덤벨 풀오버와 짝' },
          { exerciseId: 'seed-dumbbell-pullover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트' },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '체스트 플라이·해머 컬과 묶음' },
          { exerciseId: 'seed-dumbbell-fly', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-hammer-curl', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-pull-up', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '넓은 그립 · 하이퍼익스텐션·카프 레이즈와 묶음' },
          { exerciseId: 'seed-hyperextension', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-standing-calf-raise', sets: 4, repsMin: 12, repsMax: 20, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-sp-upper-machine',
    topicId: 'beginner-split',
    labelKo: '상체 머신 입문',
    source: {
      videoId: 'bjeCTtcSNRw',
      title: '{헬스장 초보자(헬린이)를 위한} 7분안에 상체머신 배우기 독학 무조건 가능함',
      channel: '웨이트연구소 I 덕코치',
      channelUrl: 'https://www.youtube.com/@%EC%9B%A8%EC%9D%B4%ED%8A%B8%EC%97%B0%EA%B5%AC%EC%86%8C%EB%8D%95%EC%BD%94%EC%B9%98',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '헬스장이 처음인 사람을 위해 상체 날에 쓸 머신 세 가지의 사용법을 알려 주는 영상이에요. 세트·횟수는 설명란에 없어 기본값으로 채웠어요.',
    days: [
      {
        nameKo: '상체',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-sp-upper4',
    topicId: 'beginner-split',
    labelKo: '직장인 상체 4종',
    source: {
      videoId: 'gnHnhlrENM4',
      title: '직장인 상체운동, 헬스장 가면 딱 이 4가지만 하세요',
      channel: '웨이트연구소 I 덕코치',
      channelUrl: 'https://www.youtube.com/@%EC%9B%A8%EC%9D%B4%ED%8A%B8%EC%97%B0%EA%B5%AC%EC%86%8C%EB%8D%95%EC%BD%94%EC%B9%98',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '오래 앉아 일하는 사람을 위한 상체 날이에요. 당기기로 시작해 가슴·어깨를 밀고 페이스 풀로 마무리해요. 헬스 초보자도 따라 할 수 있게 자세를 설명해요.',
    days: [
      {
        nameKo: '상체',
        items: [
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '인클라인 벤치에 엎드려' },
          { exerciseId: 'seed-dumbbell-bench-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-face-pull', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-sp-day1',
    topicId: 'beginner-full',
    labelKo: '첫날 상·하체 스트렝스',
    source: {
      videoId: 'kD7fRsVrFbQ',
      title: '【Day.1】초보자도 따라 할 수 있는 상/하체 스트렝스 루틴',
      channel: '마선호',
      channelUrl: 'https://www.youtube.com/@Masunho',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '초보자도 따라 할 수 있다고 밝힌 상·하체 스트렝스 루틴의 첫날이에요. 준비 운동 뒤 메인 종목인 스쿼트·벤치프레스를 하고 서브 종목을 더해요. 세트·횟수는 설명란에 없어 기본값으로 채웠어요.',
    days: [
      {
        nameKo: '1일차',
        items: [
          { exerciseId: 'seed-hang-clean', sets: 3, repsMin: 5, repsMax: 8, src: { sets: 'default', reps: 'default' }, noteKo: '서브 · 오버헤드 프레스와 이어서' },
          { exerciseId: 'seed-overhead-press', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'default', reps: 'default' }, noteKo: '서브' },
          { exerciseId: 'seed-barbell-squat', sets: 4, repsMin: 8, repsMax: 10, src: { sets: 'default', reps: 'default' }, noteKo: '메인' },
          { exerciseId: 'seed-barbell-bench-press', sets: 4, repsMin: 8, repsMax: 10, src: { sets: 'default', reps: 'default' }, noteKo: '메인' },
          { exerciseId: 'seed-hack-squat', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '서브' },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-fb-5x5',
    topicId: 'beginner-full',
    labelKo: '5×5 기초 전신 3일',
    source: {
      videoId: 'Umu4cxTPaC8',
      title: 'Best Beginner\'s Workout Routine',
      channel: 'Buff Dudes',
      channelUrl: 'https://www.youtube.com/@buffdudes',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '초보자에게 권하는 주 3회 전신 루틴이에요. 하루걸러 3주 동안 하고, 큰 종목은 5회 5세트, 작은 종목은 10회 3세트예요. 쉬는 시간은 큰 종목 90초·작은 종목 60초예요. 영어 영상이에요.',
    days: [
      {
        nameKo: '1일',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-barbell-row', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '벤트오버' },
          { exerciseId: 'seed-barbell-bench-press', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-push-press', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '로프' },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-calf-raise', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' } },
        ],
      },
      {
        nameKo: '2일',
        items: [
          { exerciseId: 'seed-deadlift', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-pull-up', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '필요하면 중량' },
          { exerciseId: 'seed-incline-press', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-overhead-press', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '숙여서' },
          { exerciseId: 'seed-standing-calf-raise', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' } },
        ],
      },
      {
        nameKo: '3일',
        items: [
          { exerciseId: 'seed-front-squat', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-pendlay-row', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dips', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '필요하면 중량' },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩' },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩' },
          { exerciseId: 'seed-front-raise-cable', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-calf-raise', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-fb-basic5',
    topicId: 'beginner-full',
    labelKo: '기본 동작 전신 5종',
    source: {
      videoId: 'R8X-gXpe9C0',
      title: 'The BEST Workout for Beginners',
      channel: 'ATHLEAN-X™',
      channelUrl: 'https://www.youtube.com/@athleanx',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '초보자를 위한 전신 운동이에요. 스쿼트·밀기·당기기·한 다리·복근을 한 번씩 해서 기본 움직임을 익혀요. 세트·횟수는 설명란에 없어 기본값으로 채웠어요. 영어 영상이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-dumbbell-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '드롭 스쿼트(빠르게 앉았다 일어나기)' },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '한 팔씩' },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-bodyweight-split-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '다리마다' },
          { exerciseId: 'seed-sit-up', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '롤업' },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-pt-back4',
    topicId: 'beginner-part',
    labelKo: '등 입문 4종',
    source: {
      videoId: 'DCAl5OsyUTI',
      title: '헬스 초보자가 헬스장가서 꼭 해야하는 필수 등 운동 4가지',
      channel: '웨이트연구소 I 덕코치',
      channelUrl: 'https://www.youtube.com/@%EC%9B%A8%EC%9D%B4%ED%8A%B8%EC%97%B0%EA%B5%AC%EC%86%8C%EB%8D%95%EC%BD%94%EC%B9%98',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '헬스 초보자가 등 운동을 할 때 꼭 해 볼 네 가지예요. 위에서 당기기와 엎드려 당기기 뒤에 한 팔 하이 로우, 팔 펴고 당기기로 마무리해요. 1시간 안에 끝낼 수 있어요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '인클라인 벤치에 엎드려' },
          { exerciseId: 'seed-cable-high-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '한 팔씩' },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-bg-pt-arm4',
    topicId: 'beginner-part',
    labelKo: '팔 입문 4종',
    source: {
      videoId: '-4I4B4GNjIk',
      title: '따라만 하면 팔이 두꺼워지는 운동 루틴ㅣ초보자는 이렇게 해보세요',
      channel: '웨이트연구소 I 덕코치',
      channelUrl: 'https://www.youtube.com/@%EC%9B%A8%EC%9D%B4%ED%8A%B8%EC%97%B0%EA%B5%AC%EC%86%8C%EB%8D%95%EC%BD%94%EC%B9%98',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '초보자를 위한 팔 운동이에요. 삼두와 이두를 번갈아 두 가지씩 해요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-bench-dip', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-dumbbell-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pu-science',
    topicId: 'pro-push',
    labelKo: '과학 기반 푸시',
    source: {
      videoId: 'bvwg4D9UWGI',
      title: 'Best Push Workout (Chest, Shoulders & Triceps)',
      channel: 'Jeff Nippard',
      channelUrl: 'https://www.youtube.com/@JeffNippard',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '벤치프레스로 시작해 머신 숄더 프레스, 펙 덱, 측면 어깨를 거쳐 삼두 두 가지로 끝내는 근비대용 푸시데이예요. 영어 영상이에요.',
    days: [
      {
        nameKo: '푸시',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '가슴에서 멈췄다가 밀기' },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 뒤 늘어난 자리 부분 반복 4~5회' },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '높은 도르래' },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 5, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-triceps-kickback-cable', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pu-ppl',
    topicId: 'pro-push',
    labelKo: 'PPL 중 푸시 이틀',
    source: {
      videoId: 'DA7QvIAyptw',
      title: 'The ULTIMATE PPL Program (Doom Slayer Physique)',
      channel: 'Natural Hypertrophy',
      channelUrl: 'https://www.youtube.com/@NaturalHypertrophy',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '밀기·당기기·하체를 두 번씩 도는 주 6일 프로그램의 푸시 이틀이에요. 두 종목씩 짝지어 번갈아 하고, 사이사이 팔·목·복근을 끼워 넣어요. 설명란의 대안 종목은 첫 번째 것만 담았어요. 영어 영상이에요.',
    days: [
      {
        nameKo: '푸시 1',
        items: [
          { exerciseId: 'seed-dips', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '대안: 벤치프레스 · 리어 델트 로우와 짝' },
          { exerciseId: 'seed-dumbbell-rear-delt-row', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-overhead-press', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상 표기 AD 프레스 또는 밀리터리 프레스 · 해머 컬과 짝' },
          { exerciseId: 'seed-hammer-curl', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-lateral-raise', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '크로스 익스텐션·케이블 플라이와 묶음' },
          { exerciseId: 'seed-cable-cross-triceps-extension', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-crossover', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' } },
        ],
      },
      {
        nameKo: '푸시 2',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '덤벨 또는 바벨 · 목 운동과 짝' },
          { exerciseId: 'seed-lying-neck-curl', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '목 굽히기·펴기' },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '컨버징 체스트 프레스 · 디클라인 싯업과 짝' },
          { exerciseId: 'seed-decline-sit-up', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-jm-press', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '해머 프리처 컬과 짝' },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '해머 그립 · 첫 대안 행맨 컬은 종목표에 없어 두 번째 대안으로' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-sh-3ex',
    topicId: 'pro-shoulders',
    labelKo: '어깨 3종 압축',
    source: {
      videoId: 'ufrFCjERMDc',
      title: 'The #1 Workout That BLEW UP My Shoulders (3 Exercises)',
      channel: 'Jeremy Ethier',
      channelUrl: 'https://www.youtube.com/@JeremyEthier',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '전면·측면·후면에 한 가지씩, 세 종목만으로 어깨를 채우는 루틴이에요. 영상은 이 세 종목을 한 주의 여러 날에 나눠 넣기를 권해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서 · 등받이를 1~2칸 뒤로 · 주 1회' },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 케이블이 몸 뒤로 지나가게 · 주 2~3회' },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '팔 45도 · 주 1~2회' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-sh-gvt',
    topicId: 'pro-shoulders',
    labelKo: '10×10 어깨',
    source: {
      videoId: '4Ll9T61lEMQ',
      title: 'German Volume Training - Shoulders',
      channel: 'Mike Thurston',
      channelUrl: 'https://www.youtube.com/@MikeThurston',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '오버헤드 프레스를 10회 10세트 하는 저먼 볼륨 트레이닝 어깨 날이에요. 이어서 측면·후면을 슈퍼세트로, 마지막에 덤벨 프레스 20회로 끝내요. 영어 영상이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-overhead-press', sets: 10, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 4, repsMin: 10, repsMax: 12, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '리어 델트 플라이와 슈퍼세트 · 쉬는 시간 90~120초' },
          { exerciseId: 'seed-rear-delt-fly', sets: 4, repsMin: 10, repsMax: 12, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '숙여서' },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 20, repsMax: 20, restSec: 80, src: { sets: 'video', reps: 'video' }, noteKo: '번갈아' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-kr-8set',
    topicId: 'pro-chest',
    labelKo: '인클라인 8세트 가슴',
    source: {
      videoId: 'OzpB0jHuytg',
      title: '가슴 운동 5가지 - 강경원 루틴',
      channel: '강경원',
      channelUrl: 'https://www.youtube.com/@kangkyungwon',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '인클라인 벤치프레스를 8세트로 길게 하고, 플랫 벤치·인클라인 덤벨·딥스·인클라인 푸시업을 5세트씩 이어 가는 가슴 날이에요. 횟수는 설명란에 없어 기본값으로 채웠어요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-incline-press', sets: 8, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '마지막 2세트 드롭세트' },
          { exerciseId: 'seed-barbell-bench-press', sets: 5, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '마지막 2세트 드롭세트' },
          { exerciseId: 'seed-incline-press-dumbbell', sets: 5, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-dips', sets: 5, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-incline-push-up', sets: 5, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ch-perfect',
    topicId: 'pro-chest',
    labelKo: '실패 지점 가슴',
    source: {
      videoId: 'zD266B2jk0s',
      title: 'The PERFECT Chest Workout (2025 EDITION)',
      channel: 'ATHLEAN-X™',
      channelUrl: 'https://www.youtube.com/@athleanx',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '회전근 준비 운동 뒤 위쪽·가운데·아래쪽 가슴을 차례로 하는 가슴 날이에요. 세트마다 실패한 뒤 부분 반복이나 내리기만 하는 반복을 더해요. 영상은 한 주에 두 번째 가슴 날도 따로 다뤄요. 영어 영상이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-band-external-rotation', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '준비 운동 1~2세트 · 가볍게' },
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 5, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '실패까지' },
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '실패 뒤 부분 반복' },
          { exerciseId: 'seed-dumbbell-floor-fly', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '2~3세트 · 실패 뒤 내리기만 반복' },
          { exerciseId: 'seed-deficit-push-up', sets: 1, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '1.5회 반복 · 아래에서 1초씩 늘려 버티기 · 실패까지' },
          { exerciseId: 'seed-dips', sets: 1, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '실패까지 · 이어서 부분 반복' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-machine',
    topicId: 'pro-back',
    labelKo: '머신 위주 등 6종',
    source: {
      videoId: 'vIiDL50Y6nU',
      title: 'Phil Heath Back Day',
      channel: 'Phil Heath',
      channelUrl: 'https://www.youtube.com/@PhilHeathTV',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '머신 풀업으로 시작해 후면 어깨, 스미스 로우, 한 팔 로우를 거쳐 풀다운 7세트로 끝내는 등 날이에요. 모든 세트 사이에 60~90초 쉬어요. 영어 영상이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-machine-lat-pulldown', sets: 4, repsMin: 8, repsMax: 10, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '영상 표기 머신 풀업 · 손바닥이 마주 보게 · 영상은 이어서 넓은 그립 머신 풀업 4세트도 해요(같은 종목이라 메모로)' },
          { exerciseId: 'seed-reverse-pec-deck', sets: 4, repsMin: 10, repsMax: 12, restSec: 90, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-row-smith', sets: 4, repsMin: 8, repsMax: 8, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '오버핸드 · 숙여서' },
          { exerciseId: 'seed-seated-cable-row', sets: 4, repsMin: 8, repsMax: 10, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩' },
          { exerciseId: 'seed-lat-pulldown', sets: 7, repsMin: 10, repsMax: 12, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '영상 표기 머신 풀다운' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-bk-wide',
    topicId: 'pro-back',
    labelKo: '광배 너비 등',
    source: {
      videoId: 'MdnwXG3WhwY',
      title: 'How To Get a WIDER BACK!',
      channel: 'Ryan Humiston',
      channelUrl: 'https://www.youtube.com/@RyanHumiston',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '등의 너비를 노리는 5종이에요. 케이블 풀오버로 광배를 먼저 깨우고, 한 팔 로우와 넓은 그립 풀다운, 인클라인 로우를 거쳐 드롭세트 로우로 끝내요. 영어 영상이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-straight-arm-pulldown', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '영상 표기 케이블 풀오버' },
          { exerciseId: 'seed-landmine-row', sets: 4, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '한 팔씩 · 15·10·8·8회' },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '넓은 그립 · 영상은 이어서 V바 풀다운 3세트(10·8·8회)도 해요' },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '인클라인 · 팔꿈치 높게' },
          { exerciseId: 'seed-barbell-row', sets: 2, repsMin: 6, repsMax: 6, src: { sets: 'video', reps: 'default' }, noteKo: '6회 뒤 두 번 무게를 내려 이어 가는 드롭세트' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-20rep',
    topicId: 'pro-legs',
    labelKo: '20회 고반복 하체',
    source: {
      videoId: '7uMRxo8BRkM',
      title: 'The PERFECT LEG WORKOUT (The Science LIES!)',
      channel: 'Ryan Humiston',
      channelUrl: 'https://www.youtube.com/@RyanHumiston',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '대퇴·햄스트링·엉덩이·종아리를 고반복으로 채우는 하체 날이에요. 대부분 4세트 20회이고, 종아리는 세 방향으로 50회씩 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '발 모으고 3/4만 · 대안 묶음: 레그 익스텐션 4×20 + 핵 스쿼트 드롭세트' },
          { exerciseId: 'seed-split-squat', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '다리마다 · 3/4만' },
          { exerciseId: 'seed-stiff-leg-deadlift', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3/4만 올라오기' },
          { exerciseId: 'seed-seated-leg-curl', sets: 4, repsMin: 30, repsMax: 30, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-sumo-deadlift', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-step-up', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '다리마다 · 앞으로 기울여' },
          { exerciseId: 'seed-seated-calf-raise', sets: 3, repsMin: 50, repsMax: 50, src: { sets: 'video', reps: 'video' }, noteKo: '발 방향 세 가지로 50회씩' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-lg-topset',
    topicId: 'pro-legs',
    labelKo: '탑세트 하체',
    source: {
      videoId: 'kO_SBJDkbPA',
      title: 'LOWER BODY DAY with Ruff Diesel | Difficulty is the price we pay for strength | Terrence Ruffin',
      channel: 'Ruff Diesel',
      channelUrl: 'https://www.youtube.com/@RuffDiesel',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '루마니안 데드리프트로 시작해 레그 컬, 불가리안 스플릿 스쿼트, 레그 프레스를 하고 측면 어깨로 끝내는 하체 날이에요. 종목마다 마지막에 가장 무거운 탑세트를 해요. 세트·횟수는 설명란에 없어 기본값으로 채웠어요. 영어 영상이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-romanian-deadlift', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '마지막 탑세트' },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '마지막 탑세트' },
          { exerciseId: 'seed-bulgarian-split-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '다리마다 · 마지막 탑세트' },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '마지막 탑세트' },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '마지막 탑세트' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ar-stubborn',
    topicId: 'pro-arms',
    labelKo: '안 크는 팔 6종',
    source: {
      videoId: 'KDaVyPGEidU',
      title: 'How To Grow Stubborn Arms',
      channel: 'Mike Thurston',
      channelUrl: 'https://www.youtube.com/@MikeThurston',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '삼두와 이두를 한 종목씩 번갈아 하는 팔 루틴이에요. 삼두는 3세트, 이두는 2세트로 6~10회를 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-smith-close-grip-bench-press', sets: 3, repsMin: 6, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 2, repsMin: 6, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-cross-triceps-extension', sets: 3, repsMin: 8, repsMax: 8, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-chin-up', sets: 2, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '중량 · 이두 위주' },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-hammer-curl', sets: 2, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '로프' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-ar-20rep',
    topicId: 'pro-arms',
    labelKo: '20회 슈퍼세트 팔',
    source: {
      videoId: 'lSmhIVFl8Z0',
      title: 'How To Grow 19in ARMS (Sets & Reps!)',
      channel: 'Ryan Humiston',
      channelUrl: 'https://www.youtube.com/@RyanHumiston',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '삼두와 이두를 슈퍼세트 네 쌍으로 묶어 4세트 20회씩 하는 팔 루틴이에요. 마지막 푸시업은 실패까지 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '로프 · 로프 컬과 슈퍼세트' },
          { exerciseId: 'seed-cable-hammer-curl', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '로프 컬' },
          { exerciseId: 'seed-ez-bar-skull-crusher', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '드래그 컬과 슈퍼세트' },
          { exerciseId: 'seed-drag-curl', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: 'EZ바 · 넓은 그립' },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '덤벨 프렌치 프레스 · 해머 컬과 슈퍼세트' },
          { exerciseId: 'seed-hammer-curl', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-incline-dumbbell-curl', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '트라이셉스 푸시업과 슈퍼세트' },
          { exerciseId: 'seed-diamond-push-up', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상 표기 트라이셉스 푸시업 · 실패까지' },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pl-kr-season',
    topicId: 'pro-pull',
    labelKo: '시즌 등·이두 8종',
    source: {
      videoId: 'gFUxaWYtef0',
      title: '보디빌더 이장민 | 시즌 5주차 | 등, 이두 운동 | 파트너십 운동 | 풀영상',
      channel: 'Bodybuilder이장민',
      channelUrl: 'https://www.youtube.com/@leejangmin',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '시즌 중 파트너와 함께 하는 등·이두 날이에요. 풀다운과 머신 로우 세 가지로 등을 채우고, 컬 세 가지로 이두를 마무리해요. 세트·횟수는 설명란에 없어 기본값으로 채웠어요.',
    days: [
      {
        nameKo: '등·이두',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-high-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '미드 로우' },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-dumbbell-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-machine-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' } },
        ],
      },
    ],
  },
  {
    id: 'cr-pro-pl-science',
    topicId: 'pro-pull',
    labelKo: '과학 기반 풀',
    source: {
      videoId: 'tPphF8gepd8',
      title: 'The Best Science-Based PULL Workout For Growth (Back/Biceps/Rear Delts)',
      channel: 'Jeremy Ethier',
      channelUrl: 'https://www.youtube.com/@JeremyEthier',
      verifiedAt: '2026-11-09',
    },
    summaryKo: '풀업으로 시작해 바벨 로우, 언더그립 풀다운, 후면 어깨 로우, 바벨 컬, 페이스 풀로 끝내는 풀데이예요. 영어 영상이에요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-pull-up', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 대안: 무릎 꿇고 랫풀다운 10~15회' },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트' },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 언더그립' },
          { exerciseId: 'seed-dumbbell-rear-delt-row', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 가슴 지지' },
          { exerciseId: 'seed-barbell-curl', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '2~3세트 · 좁은 그립' },
          { exerciseId: 'seed-face-pull', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '2~3세트 · 무릎 꿇고' },
        ],
      },
    ],
  },
];

/** 논란 보도 등으로 싣지 않는 채널(spec rev1 M-5) — 테스트가 데이터에 없음을 확인한다. */
// [원본] export const EXCLUDED_CHANNELS: readonly string[] = ['황철순', 'JINGMAN'];
// [개선] 2026-11-06 사용자 지시(이미지 위험을 감수하고 포함 · ADR-059) — JINGMAN(징맨)도 같은 인물이라 함께 뺐다. 지금 제외 채널은 없다
export const EXCLUDED_CHANNELS: readonly string[] = [];

/**
 * 한국에서 흔히 부르는 이름 — 채널명(oEmbed 원문)을 열쇠로 둔다. 출처 표기·저장 메모에만 쓰고 루틴 이름에는 넣지 않는다.
 * 2026-11-05 사용자 지시: 「박재훈(Allright24_박재훈)」 「크리스 범스테드(Chris Bumstead)」 형태.
 */
export const CHANNEL_NAMES_KO: Readonly<Record<string, string>> = {
  'Chris Bumstead': '크리스 범스테드',
  'Nick Walker': '닉 워커',
  'Derek Lunsford': '데릭 런스포드',
  'SAMSON DAUDA': '삼손 다우다',
  'Hadi Choopan': '하디 초판',
  'Wesley Vissers': '웨슬리 비서스',
  'Ruff Diesel': '테런스 러핀',
  JayCutlerTV: '제이 커틀러',
  'Sadik Hadzovic': '사딕 하조비치',
  'Sam Sulek': '샘 술렉',
  'Phil Heath': '필 히스',
  'Regan Grimes': '리건 그라임스',
  'Urs Kalecinski': '우르스 칼레신스키',
  'Dorian Yates Nutrition': '도리안 예이츠',
  'Shaun Clarida': '숀 클라리다',
  'Steve Cook': '스티브 쿡',
  'Jeff Nippard': '제프 니파드',
  'Hunter Labrada': '헌터 라브라다',
  'Beastmode Jones': '크리스 존스',
  Bodybuilder이장민: '이장민',
  Allright24_박재훈: '박재훈',
  강경원: '강경원',
  설기관: '설기관',
  킹유진: '킹유진',
  'CHUL SOON HWANG': '황철순',
  // 황철순이 게스트로 나온 회사 채널 — 인물 이름은 영상 제목에 있다
  '핏플렉스(FITFLEX)': '핏플렉스(FITFLEX)',
  마선호: '마선호',
  '제로범TV _김영범': '김영범',
  '핏블리 FITVELY': '핏블리',
  MSG훈: 'MSG훈',
  '웨이트연구소 I 덕코치': '덕코치',
  'ATHLEAN-X™': '제프 카발리에리',
  'Jeremy Ethier': '제러미 에시어',
  'Will Tennyson': '윌 테니슨',
  'Natural Hypertrophy': 'Natural Hypertrophy',
  // 2026-11-09 보강 루틴 채널(SPEC-047)
  'Mike Thurston': '마이크 서스턴',
  'Ryan Humiston': '라이언 휴미스턴',
  'Buff Dudes': '버프 듀즈',
  // 운동 팁 채널(SPEC-047)
  '어썸블리스 AwesomeBLISS': '어썸블리스',
  '건강의학전문채널 하이닥': '하이닥',
  '물리치료사.PT재석': 'PT재석',
  '몸쌤 - 무브어게인': '몸쌤',
  '빅씨스 Bigsis': '빅씨스',
  운동가이더: '운동가이더',
  '허리&PT : 부상 없이 헬스합시다': '허리&PT',
};

/** 「흔히 부르는 이름(채널명)」 — 두 이름이 같으면 하나만, 표에 없으면 채널명 그대로 */
export function creatorChannelLabel(channel: string): string {
  const raw = channel.trim();
  const ko = CHANNEL_NAMES_KO[raw];
  if (!ko || ko === raw) return raw;
  return `${ko}(${raw})`;
}

/** 화면에 낼 버전 — draft·hidden 제외 */
export function creatorRoutinesFor(topicId: CreatorTopicId): CreatorRoutine[] {
  return CREATOR_ROUTINES.filter((r) => r.topicId === topicId && !r.draft && !r.hidden);
}

/** 버전이 하나라도 있는 주제만 */
export function visibleCreatorTopics(): CreatorTopic[] {
  return CREATOR_TOPICS.filter((t) => creatorRoutinesFor(t.id).length > 0);
}

/** 운동 탭의 분류 — 초보자 주제는 프로 루틴과 따로 묶는다(사용자 지시 2026-11-06) */
export type CreatorTopicSection = 'pro' | 'beginner';

export function creatorTopicSection(topicId: CreatorTopicId): CreatorTopicSection {
  return topicId.startsWith('beginner-') ? 'beginner' : 'pro';
}

/** 화면 순서대로의 분류 — 보일 주제가 없는 분류는 뺀다 */
export function visibleCreatorSections(): { section: CreatorTopicSection; topics: CreatorTopic[] }[] {
  const topics = visibleCreatorTopics();
  return (['pro', 'beginner'] as const)
    .map((section) => ({ section, topics: topics.filter((t) => creatorTopicSection(t.id) === section) }))
    .filter((s) => s.topics.length > 0);
}

// [원본] export function youtubeWatchUrl(videoId: string): string {
//   return `https://www.youtube.com/watch?v=${videoId}`;
// }
// [개선] 운동 팁의 챕터 링크 — 양의 초가 있으면 그 시각부터(SPEC-047). 0·음수·NaN 이면 처음부터(기존 호출 그대로)
export function youtubeWatchUrl(videoId: string, sec?: number): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  const t = sec === undefined || !Number.isFinite(sec) ? 0 : Math.floor(sec);
  return t > 0 ? `${base}&t=${t}s` : base;
}

/** 루틴 메모 — 출처를 함께 저장(이름에는 채널명을 넣지 않는다) */
export function creatorRoutineNotes(r: CreatorRoutine): string {
  // [원본] return `출처: ${r.source.channel} 「${r.source.title}」 ${youtubeWatchUrl(r.source.videoId)}`;
  // [개선] 저장하면 「기본값」 표시가 사라지므로, 우리가 채운 값이 있으면 메모에 남긴다
  const base = `출처: ${creatorChannelLabel(r.source.channel)} 「${r.source.title}」 ${youtubeWatchUrl(r.source.videoId)}`;
  const filled = r.days.some((d) => d.items.some((i) => i.src.sets === 'default' || i.src.reps === 'default'));
  // [원본] return filled ? `${base}\n세트·횟수 일부는 출처에 없어 앱 기본값으로 채웠어요.` : base;
  // [개선] 설명란이 아닌 근거(기사·시청자 댓글)도 저장 뒤에 알 수 있게 남긴다
  const lines = [base];
  if (r.basis) lines.push(`루틴 근거: ${r.basis.labelKo}`);
  if (filled) lines.push('세트·횟수 일부는 출처에 없어 앱 기본값으로 채웠어요.');
  return lines.join('\n');
}
