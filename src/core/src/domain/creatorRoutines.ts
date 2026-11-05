// 크리에이터 루틴 — 주제(프로의 어깨·가슴·등·하체·팔·푸시·풀·전신)별로 국내외 프로 선수·유명 보디빌더의 영상 루틴을 정리한 정적 데이터. @plm SRS-091 SRS-092
// [원본] 주제: 어깨깡패·3대 500·퇴근 후(2026-10-28) → 2026-11-05 사용자 지시로 교체. 옛 영상은 hidden 으로 데이터에 남긴다(3대 500·퇴근 후) · 어깨 3개는 새 주제로 옮겼다.
//
// 규칙(ADR-045 · spec 20261028_creator-routines rev1):
//   · 출처(source)의 title·channel 은 공식 oEmbed 값 그대로 — 점검: node scripts/check-creator-routines.mjs
//   · 루틴(종목·세트·횟수)은 사실 정보만 · src 'video' = 출처(영상 설명란, 또는 basis 로 밝힌 영상 분석 자료)에 적힌 값 · 'default' = 출처에 없어 우리가 채운 값(화면에 「기본값」)
//   · 대본·설명란 원문·썸네일은 넣지 않는다. summaryKo·labelKo 는 우리 말로 — 채널명(실명)을 넣지 않는다(공유 시 이름만 퍼짐 · qa H-2)
//   · 균일하지 않은 처방(피라미드·탑셋)은 근삿값 + reps 'default' + noteKo 로 원래 방식을 적는다 · 하루 안 같은 종목 두 번 금지
//   · draft: true = 아직 사람 검수 전 — 화면에 내지 않는다(check 스크립트는 경고로 알린다)
//   · 영상이 삭제·비공개면 hidden: true
// 옛 AI 콘셉트 루틴(conceptRoutines.ts)은 사용자 결정(2026-10-28)으로 화면에서 뺐다 — 데이터는 원복용 보존.

// [원본] export type CreatorTopicId = 'boulder-shoulders' | 'big3-500' | 'after-work';
// [개선] 새 주제 8개 + 숨긴 옛 영상이 쓰는 주제 2개(화면 목록 CREATOR_TOPICS 에는 없다)
export type CreatorTopicId =
  | 'pro-shoulders'
  | 'pro-chest'
  | 'pro-back'
  | 'pro-legs'
  | 'pro-arms'
  | 'pro-push'
  | 'pro-pull'
  | 'pro-full'
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
export const CREATOR_TOPICS: CreatorTopic[] = [
  { id: 'pro-shoulders', nameKo: '프로의 어깨 루틴', nameEn: 'Pro shoulders', blurbKo: '국내외 프로 선수와 유명 보디빌더가 영상에서 보여 준 어깨 운동을 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-chest', nameKo: '프로의 가슴 루틴', nameEn: 'Pro chest', blurbKo: '국내외 프로 선수와 유명 보디빌더가 영상에서 보여 준 가슴 운동을 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-back', nameKo: '프로의 등 루틴', nameEn: 'Pro back', blurbKo: '국내외 프로 선수와 유명 보디빌더가 영상에서 보여 준 등 운동을 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-legs', nameKo: '프로의 하체 루틴', nameEn: 'Pro legs', blurbKo: '국내외 프로 선수와 유명 보디빌더가 영상에서 보여 준 하체 운동을 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-arms', nameKo: '프로의 팔 루틴', nameEn: 'Pro arms', blurbKo: '국내외 프로 선수와 유명 보디빌더가 영상에서 보여 준 팔 운동을 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-push', nameKo: '프로의 푸시데이', nameEn: 'Pro push day', blurbKo: '가슴·어깨·삼두를 하루에 묶은 푸시 운동을 프로 선수와 유명 보디빌더의 영상에서 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-pull', nameKo: '프로의 풀데이', nameEn: 'Pro pull day', blurbKo: '등·이두를 하루에 묶은 풀 운동을 프로 선수와 유명 보디빌더의 영상에서 모았어요.', blurbEn: PRO_BLURB_EN },
  { id: 'pro-full', nameKo: '프로의 전신 루틴', nameEn: 'Pro full body', blurbKo: '하루에 온몸을 도는 전신 운동을 프로 선수와 유명 보디빌더의 영상에서 모았어요.', blurbEn: PRO_BLURB_EN },
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
];

/** 논란 보도 등으로 싣지 않는 채널(spec rev1 M-5) — 테스트가 데이터에 없음을 확인한다. */
export const EXCLUDED_CHANNELS: readonly string[] = ['황철순', 'JINGMAN'];

/** 화면에 낼 버전 — draft·hidden 제외 */
export function creatorRoutinesFor(topicId: CreatorTopicId): CreatorRoutine[] {
  return CREATOR_ROUTINES.filter((r) => r.topicId === topicId && !r.draft && !r.hidden);
}

/** 버전이 하나라도 있는 주제만 */
export function visibleCreatorTopics(): CreatorTopic[] {
  return CREATOR_TOPICS.filter((t) => creatorRoutinesFor(t.id).length > 0);
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** 루틴 메모 — 출처를 함께 저장(이름에는 채널명을 넣지 않는다) */
export function creatorRoutineNotes(r: CreatorRoutine): string {
  // [원본] return `출처: ${r.source.channel} 「${r.source.title}」 ${youtubeWatchUrl(r.source.videoId)}`;
  // [개선] 저장하면 「기본값」 표시가 사라지므로, 우리가 채운 값이 있으면 메모에 남긴다
  const base = `출처: ${r.source.channel} 「${r.source.title}」 ${youtubeWatchUrl(r.source.videoId)}`;
  const filled = r.days.some((d) => d.items.some((i) => i.src.sets === 'default' || i.src.reps === 'default'));
  return filled ? `${base}
세트·횟수 일부는 출처에 없어 앱 기본값으로 채웠어요.` : base;
}
