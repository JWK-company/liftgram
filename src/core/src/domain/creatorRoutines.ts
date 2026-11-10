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
  /** 영상에서 이 종목을 다루는 시각(초) — 「그 장면부터 보기」 링크(2026-11-10 · ADR-063 스크립트 보완) */
  atSec?: number;
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
  /** 유튜브 「스크립트 표시」 글(영상 본편 말)과 대조한 날짜 — 있으면 화면에 「본편 기준」(ADR-063 · 원문은 저장하지 않는다) */
  scriptCheckedAt?: string;
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '프레스 두 가지 뒤에 케이블·덤벨로 측면을 두 번, 업라이트 로우와 벤트오버로 마무리하는 5분할 중 어깨 날이에요. 영상은 시작 전 스트레칭·월슬라이드도 다뤄요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '처음엔 등받이 없이, 무거워지면 기대기', atSec: 623 },
          { exerciseId: 'seed-smith-behind-the-neck-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '팔꿈치를 옆으로 열어 측면 개입', atSec: 884 },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '늘어난 하단 구간을 반동 없이', atSec: 990 },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '승모 들지 말고 옆으로만', atSec: 1144 },
          { exerciseId: 'seed-upright-row-cable', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '측·후면 사이 각도로 벌리기', atSec: 1290 },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '숙여서 케이블 벤트오버 레이즈', atSec: 1410 },
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
    scriptCheckedAt: '2026-11-10',
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
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '무겁게 2세트 + 가볍게 1세트', atSec: 515 },
          { exerciseId: 'seed-side-lateral-raise', sets: 4, repsMin: 7, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서 · 마지막은 레스트포즈', atSec: 691 },
          { exerciseId: 'seed-reverse-pec-deck', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-machine-lateral-raise', sets: 1, repsMin: 7, repsMax: 7, src: { sets: 'video', reps: 'video' }, noteKo: '선 채로 마무리 1세트 · 드롭세트', atSec: 843 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '5대 운동을 5세트 5회로 하고 성공하면 다음에 조금씩 무게를 올리는 근력 프로그램이에요(스트롱리프트 방식). 주 3회 A·B 를 번갈아 하고, 처음엔 5회 최대 무게의 절반으로 시작해요.',
    days: [
      {
        nameKo: 'A',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '매번 +2.5kg · 힘들면 3분 쉬기', atSec: 421 },
          { exerciseId: 'seed-barbell-bench-press', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '매번 +2.5kg(작으면 1kg)', atSec: 421 },
          { exerciseId: 'seed-barbell-row', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '매번 +2.5kg(작으면 1kg)', atSec: 421 },
        ],
      },
      {
        nameKo: 'B',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '매번 +2.5kg · 힘들면 3분 쉬기', atSec: 421 },
          { exerciseId: 'seed-overhead-press', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '매번 +2.5kg(작으면 1kg)', atSec: 421 },
          { exerciseId: 'seed-deadlift', sets: 1, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '스트롱리프트 기본은 데드리프트 1세트 5회 · 100kg 전까지 매번 +5kg', atSec: 362 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '3대 운동을 1RM 65%의 5세트 5회로 시작해 매번 조금씩 올리고, RPE 8을 넘길 것 같으면 4×4, 3×3, 2×2로 줄여 가는 프로그램이에요. 상체(벤치·오버헤드)와 하체(스쿼트·데드)로 나눠 처음 2주쯤은 주 3회, 그 뒤엔 주 2회 해요.',
    days: [
      {
        nameKo: '상체',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 5, repsMin: 5, repsMax: 5, src: { sets: 'video', reps: 'video' }, noteKo: '1RM 65%로 시작 · RPE 8 넘기지 않기', atSec: 211 },
          { exerciseId: 'seed-overhead-press', sets: 5, repsMin: 5, repsMax: 5, src: { sets: 'video', reps: 'video' }, noteKo: '매 세션 최소 단위(2.5kg) 증량', atSec: 361 },
        ],
      },
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 5, repsMin: 5, repsMax: 5, src: { sets: 'video', reps: 'video' }, noteKo: '1RM 65%로 시작 · RPE 8 넘기지 않기', atSec: 211 },
          { exerciseId: 'seed-deadlift', sets: 5, repsMin: 5, repsMax: 5, src: { sets: 'video', reps: 'video' }, noteKo: '1RM 60%로 시작 · RPE 0.5 낮게', atSec: 361 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '가슴과 등을 번갈아 하며 미는 근육이 쉬는 동안 당기는 근육을 쓰고, 하체로 마무리하는 무분할 전신 구성이에요. 가볍게 15회씩 해요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 5, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '20kg 바가 힘들면 덤벨 프레스로' },
          { exerciseId: 'seed-assisted-pull-up', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '세 번째 세트는 언더그립' },
          { exerciseId: 'seed-chest-press-machine', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 파워 레그프레스', atSec: 661 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '유산소·스트레칭으로 몸을 데운 뒤 등·가슴·하체·어깨를 기구 하나씩으로 끝내고, 인터벌과 스트레칭으로 마무리하는 1시간 구성이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 12, repsMax: 15, restSec: 75, src: { sets: 'video', reps: 'video' }, noteKo: '허리 꺾지 말고 윗가슴 쪽으로', atSec: 121 },
          { exerciseId: 'seed-smith-machine-bench-press', sets: 4, repsMin: 10, repsMax: 12, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '천천히 내려 가슴 살짝 터치', atSec: 180 },
          { exerciseId: 'seed-lying-leg-curl', sets: 4, repsMin: 12, repsMax: 15, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '골반 뜨지 않게 천천히', atSec: 240 },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 12, repsMax: 15, restSec: 105, src: { sets: 'video', reps: 'video' }, noteKo: '발 V자 · 무릎 끝까지 펴지 않기', atSec: 270 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 4, repsMin: 10, repsMax: 12, restSec: 75, src: { sets: 'video', reps: 'video' }, noteKo: '벤치 80도 · 팔꿈치 45도 앞으로', atSec: 302 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '후면으로 시작해 측면을 세 가지로 채우고, 무거운 프레스 뒤에 전면·승모까지 다루는 고볼륨 구성이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-reverse-pec-deck', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 90 },
          { exerciseId: 'seed-face-pull', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '견갑을 모으며 당기기', atSec: 122 },
          { exerciseId: 'seed-chest-supported-y-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '인클라인 벤치에 엎드려 Y자로', atSec: 122 },
          { exerciseId: 'seed-machine-lateral-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, atSec: 181 },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서', atSec: 211 },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩', atSec: 241 },
          { exerciseId: 'seed-overhead-press', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서', atSec: 241 },
          { exerciseId: 'seed-front-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 301 },
          { exerciseId: 'seed-upright-row', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 330 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '업라이트 로우로 시작해 측면·전면·승모·후면을 차례로 돌고 덤벨 프레스로 끝내는 슈퍼세트 구성이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-upright-row', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-side-lateral-raise', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 파트너 저항 레이즈와 슈퍼세트(앱 종목 없음)', atSec: 101 },
          { exerciseId: 'seed-front-raise', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩' },
          { exerciseId: 'seed-shrug-machine', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '앞이 아니라 위·뒤 대각선으로', atSec: 183 },
          { exerciseId: 'seed-face-pull', sets: 4, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-rear-delt-fly', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '견갑 모으고 무릎 살짝·코어 긴장', atSec: 275 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-shoulder-day-workout' },
    summaryKo: '후면 예열 뒤 프레스와 측면 레이즈를 번갈아 하고 리버스 플라이로 마무리해요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '예열 · 영상: 머신으로 후면 예열', atSec: 319 },
          { exerciseId: 'seed-shoulder-press-smith', sets: 2, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '메인 종목 · 실패 지점까지 반복', atSec: 442 },
          { exerciseId: 'seed-side-lateral-raise', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 실패까지 · 앉아서·손목 힘 빼고', atSec: 568 },
          { exerciseId: 'seed-shoulder-press-machine', sets: 2, repsMin: 8, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '둘째 세트는 무게 낮춤', atSec: 699 },
          { exerciseId: 'seed-machine-lateral-raise', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-reverse-pec-deck', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 실패까지 · 마무리 3세트', atSec: 946 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-performs-shoulder-workout/' },
    summaryKo: '머신과 덤벨 프레스로 시작해 측면·후면을 두 가지씩 채우는 오프시즌 어깨 날이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '예열 겸 무겁게 · 영상 9회', atSec: 272 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 2, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '머신 직후 쉬지 않고 · 10회 넘기기', atSec: 437 },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, atSec: 480 },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '가볍게 · 팔꿈치 펴고 천천히', atSec: 705 },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '한 팔씩', atSec: 753 },
          { exerciseId: 'seed-reverse-pec-deck', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, atSec: 753 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-joocy-shoulder-workout' },
    summaryKo: '측면 레이즈로 먼저 자극하고 프레스로 넘어가는 순서예요. 덤벨 레이즈는 무게를 올리며 네 세트를 해요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-machine-lateral-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '먼저 측면 사전 피로 · 긴장 유지', atSec: 434 },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '평소보다 넓은 그립 · 처음 5회 바닥 정지', atSec: 1062 },
          { exerciseId: 'seed-side-lateral-raise', sets: 4, repsMin: 10, repsMax: 20, restSec: 30, src: { sets: 'video', reps: 'default' }, noteKo: '20·15·10회, 마지막 실패 · 30초 휴식', atSec: 747 },
          { exerciseId: 'seed-front-raise-cable', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '로프 손잡이', atSec: 1112 },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '펙 덱 대신 케이블 손잡이로', atSec: 1324 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/nick-walker-shoulders-triceps-workout/' },
    summaryKo: '리버스 펙 덱 드롭세트로 시작해 무거운 세트와 고반복 세트를 섞은 바벨 프레스 뒤에 측면·승모·후면을 채워요. 영상은 이어서 삼두·펙 덱·복근으로 마무리하지만 여기엔 어깨 부분만 담았어요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-reverse-pec-deck', sets: 1, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '후면 먼저 · 트리플 드롭 1세트', atSec: 143 },
          { exerciseId: 'seed-overhead-press', sets: 2, repsMin: 9, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '무겁게 9회 1세트, 20회 1세트', atSec: 1028 },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '무겁게까지 올린 뒤 더블 드롭', atSec: 1053 },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩', atSec: 1079 },
          { exerciseId: 'seed-shrug-smith', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 1079 },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, atSec: 1079 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/nick-walker-shoulders-triceps-workout-for-2022-olympia/' },
    summaryKo: '리버스 펙 덱으로 시작하고 스미스 프레스를 쉬어 가며 끝까지 밀어붙인 뒤 삼두로 끝내는 구성이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-reverse-pec-deck', sets: 1, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '실패 15회→더블 드롭→부분 반복 20회', atSec: 985 },
          { exerciseId: 'seed-shoulder-press-smith', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '레스트포즈 10+3+2회, 이어서 가볍게 15회', atSec: 985 },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 12, repsMax: 12, restSec: 30, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서 · 30초 휴식', atSec: 1036 },
          { exerciseId: 'seed-cable-lateral-raise', sets: 2, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 · 위에서 1초 정지 · 실패까지', atSec: 1036 },
          { exerciseId: 'seed-rear-delt-fly', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '인클라인 엎드려 · 둘째 세트 드롭', atSec: 1062 },
          { exerciseId: 'seed-triceps-pushdown', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '로프 · 드롭 1회', atSec: 1062 },
          { exerciseId: 'seed-machine-overhead-triceps-extension', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '드롭 2번 · 마지막은 늘인 채 1~2초', atSec: 1087 },
          { exerciseId: 'seed-cable-cross-triceps-extension', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 크로스바디 케이블 푸시다운 · 부분 반복', atSec: 1087 },
          { exerciseId: 'seed-hanging-knee-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, atSec: 1087 },
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/derek-lunsford-chest-workout-2023-olympia-prep/' },
    summaryKo: '케이블 크로스오버로 시작해 덤벨 인클라인, 머신 프레스, 펙 덱을 하고 레그 레이즈로 끝내는 짧은 구성이에요. 영상은 레그 레이즈 앞에 디클라인 크런치도 해요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '워밍업 몇 세트 뒤 작업 3세트', atSec: 928 },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '워밍업 없이 바로 작업 세트', atSec: 928 },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '첫 세트 10-12회, 무게 올려 2세트', atSec: 960 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/jay-cutler-crushes-brutal-chest-workout-at-52/' },
    summaryKo: '카프로 시작한 뒤 머신과 케이블로 긴장을 오래 유지하는 레전드 선수의 가슴 날이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-standing-calf-raise', sets: 4, repsMin: 12, repsMax: 12, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '아래서 늘리고 1·2 박자로 올리기', atSec: 397 },
          { exerciseId: 'seed-seated-calf-raise', sets: 3, repsMin: 8, repsMax: 12, restSec: 60, src: { sets: 'video', reps: 'default' }, noteKo: '위에서 꽉 수축 · 휴식 45~60초', atSec: 950 },
          { exerciseId: 'seed-incline-press-machine', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '좌석 낮게 · 2세트 뒤 무게 올림', atSec: 1099 },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 스탠딩 머신 프레스 · 가운데 그립', atSec: 1477 },
          { exerciseId: 'seed-dumbbell-fly', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '위에서 맞닿지 않게 긴장 유지', atSec: 1603 },
          { exerciseId: 'seed-seated-cable-chest-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '수축 위주 마무리 프레스', atSec: 1708 },
          { exerciseId: 'seed-dumbbell-pullover', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '가슴 늘림 위주 · 가볍게', atSec: 2123 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Generation Iron 기사', url: 'https://generationiron.com/jay-cutler-phil-heath-chest-triceps-workout/' },
    summaryKo: '두 올림피아 챔피언이 함께한 머신 위주의 가슴·삼두 세션이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-incline-press-machine', sets: 3, repsMin: 8, repsMax: 12, restSec: 60, src: { sets: 'default', reps: 'default' }, noteKo: '좌석 낮게 · 무게 올려 가며', atSec: 73 },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 8, repsMax: 12, restSec: 60, src: { sets: 'default', reps: 'default' }, noteKo: '끝까지 펴지 않고 펌프 위주', atSec: 476 },
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 8, repsMax: 12, restSec: 60, src: { sets: 'default', reps: 'default' }, noteKo: '도르래 이마 높이 · 앞으로 한 발', atSec: 528 },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '로프 · 끝까지 펴기', atSec: 1079 },
          { exerciseId: 'seed-triceps-extension-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '위에서 아래까지 전 범위', atSec: 1241 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '디클라인·인클라인·플랫 프레스를 두 세트씩 하고 측면과 삼두까지 끝내는 대회 전 구성이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-decline-chest-press-machine', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '8–12회, 12–15회 · 두 세트 모두 실패까지', atSec: 211 },
          { exerciseId: 'seed-incline-press-machine', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 8–12회, 12–15회 + 레스트포즈 2세트 · 2세트째 실패 뒤 10호흡 쉬고 2번 더', atSec: 360 },
          { exerciseId: 'seed-chest-press-machine', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 8–12회, 12–15회 + 레스트포즈 2세트 · 2세트째 레스트포즈 2회 · 견갑 뒤로', atSec: 520 },
          { exerciseId: 'seed-assisted-dip', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 8–10회, 12–15회 · 2세트째 보조 늘려 15회 안팎', atSec: 600 },
          { exerciseId: 'seed-pec-deck-fly', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 10–15회, 12–15회 + 더블 드롭 · 실패 뒤 20~30% 내려 드롭 2회', atSec: 680 },
          { exerciseId: 'seed-side-lateral-raise', sets: 2, repsMin: 20, repsMax: 25, src: { sets: 'video', reps: 'video' }, atSec: 720 },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 8, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 12–15회, 8–12회, 15–20회 · 로프 · 위로 90도 넘게 늘리기', atSec: 720 },
          { exerciseId: 'seed-cable-overhead-extension', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 8–12회, 12–15회 + 레스트포즈 2세트 · 2세트째 가볍게 + 레스트포즈', atSec: 780 },
          { exerciseId: 'seed-skull-crusher-dumbbell', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 8–12회, 12–15회 + 레스트포즈 2세트 · 2세트째 레스트포즈 2회 · 위·뒤로 밀기', atSec: 890 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '스미스와 덤벨 인클라인을 무겁게·가볍게 한 세트씩 하고 플랫 프레스, 삼두 두 가지로 이어 가요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-incline-press-smith', sets: 2, repsMin: 8, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '8–12회, 15–20회 · 벤치 가장 낮은 경사', atSec: 69 },
          { exerciseId: 'seed-incline-press-dumbbell', sets: 2, repsMin: 8, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '8–12회, 15–20회 · 가장 낮은 경사', atSec: 218 },
          { exerciseId: 'seed-chest-press-machine', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '2세트째 레스트포즈: 실패 3번·10~15초 휴식', atSec: 394 },
          { exerciseId: 'seed-cable-crossover', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 672 },
          { exerciseId: 'seed-side-lateral-raise', sets: 2, repsMin: 15, repsMax: 25, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 25회 이상, 15회 이상 · 가볍게 실패까지 · 한 팔씩 번갈아', atSec: 737 },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 12, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 12–15회 2세트, 15–20회 1세트 · 로프 · 첫 세트 실패까지', atSec: 882 },
          { exerciseId: 'seed-skull-crusher-dumbbell', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 10–12회, 12–15회, 15–20회', atSec: 978 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '펙 플라이로 먼저 자극하고 인클라인 6세트를 포함해 세트 수를 많이 가져가는 구성이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '손잡이 없는 패드형 · 끌어안듯' },
          { exerciseId: 'seed-incline-press-machine', sets: 6, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '안쪽·바깥 그립 번갈아 · 무게 올려 가며' },
          { exerciseId: 'seed-incline-dumbbell-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '아래서 길게 늘리기' },
          { exerciseId: 'seed-chest-press-machine', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dips', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '바닥에서 튕기지 않고 멈췄다 올리기' },
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '매 반복 모은 곳에서 멈춤 · 뒤에 스탠딩 플라이 3세트' },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-back-workout-2023-olympia-prep/' },
    summaryKo: '머신 풀오버로 시작해 바벨·덤벨·머신 로우를 고루 쓰는 대회 준비 등 운동이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-machine-pullover', sets: 3, repsMin: 5, repsMax: 9, src: { sets: 'video', reps: 'default' }, noteKo: '광배 여는 예열 · 기사: 5회, 9회, 6회', atSec: 589 },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 9, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 9회, 9회, 15회 · 골반 쪽으로 당기기 · 1~2세트 언더그립', atSec: 607 },
          { exerciseId: 'seed-dumbbell-row', sets: 2, repsMin: 4, repsMax: 8, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 양팔 번갈아 4회씩, 8회' },
          { exerciseId: 'seed-chest-supported-row', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 10회, 6회, 9회' },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 3, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 10회, 10회, 3회' },
          { exerciseId: 'seed-low-row', sets: 2, repsMin: 4, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 4회, 10회' },
          { exerciseId: 'seed-dumbbell-rear-delt-row', sets: 1, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '등 날 끝에 후면 삼각 1~2종목', atSec: 1343 },
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
    scriptCheckedAt: '2026-11-10',
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
    labelKo: '넓은 등 6종',
    source: {
      videoId: 'gooMw3zSerQ',
      title: 'HOW TO BUILD A MASSIVE BACK | JAY CUTLER\'S BLUEPRINT',
      channel: 'JayCutlerTV',
      channelUrl: 'https://www.youtube.com/@JayCutlerTV',
      verifiedAt: '2026-11-05',
    },
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/jay-cutler-massive-back-workout' },
    summaryKo: '리버스 그립 풀다운으로 시작해 세 세트씩 고르게 쌓고 데드리프트 한 세트로 끝내는 설계도 같은 구성이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-machine-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '리버스 그립 · 예열 2세트 뒤 피라미드 · 셋째 순서에 다른 풀다운 머신 3세트', atSec: 453 },
          { exerciseId: 'seed-machine-pullover', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 674 },
          { exerciseId: 'seed-t-bar-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 810 },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 954 },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '조금 넓은 그립', atSec: 1022 },
          { exerciseId: 'seed-deadlift', sets: 1, repsMin: 9, repsMax: 9, src: { sets: 'video', reps: 'video' }, noteKo: '예열 없이 한 세트', atSec: 1275 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/jay-cutler-xxl-back-workout/' },
    summaryKo: '피라미드 세트로 무게를 올리며 당기는 동작과 늘리는 동작을 고르게 다뤄요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-machine-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '리버스 그립 · 예열 뒤 피라미드 · 이어서 넓은 그립 3세트(앞으로)', atSec: 876 },
          { exerciseId: 'seed-machine-pullover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, atSec: 1114 },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 10회', atSec: 1311 },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '손잡이 두 개', atSec: 1839 },
          { exerciseId: 'seed-hyperextension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '이번 주 데드리프트 대신', atSec: 1791 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '풀다운부터 랙 풀까지 일곱 가지를 모두 12·10·8회로 올리는 옛 챔피언식 고볼륨 구성이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '리버스 그립 · 12·10·8회 · 실패 2~3회 전', atSec: 87 },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '12·10·8회 · 빠른 템포', atSec: 203 },
          { exerciseId: 'seed-t-bar-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '12·10·8회로 무게 올리기 · 실패 2~3회 전', atSec: 337 },
          { exerciseId: 'seed-machine-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12회, 10회, 8회' },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '12·10·8회로 무게 올리기 · 실패 2~3회 전', atSec: 493 },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '12·10·8회로 무게 올리기 · 실패 2~3회 전', atSec: 501 },
          { exerciseId: 'seed-rack-pull', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '12·10·8회로 무게 올리기 · 실패 2~3회 전', atSec: 570 },
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/nick-walker-crushing-back-workout' },
    summaryKo: '한 팔 풀다운과 스미스 로우를 중심으로 머신 로우를 더하고, 15초 움직이고 15초 쉬는 풀다운으로 마무리해요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 · 마지막 세트는 가볍게', atSec: 27 },
          { exerciseId: 'seed-row-smith', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 247 },
          { exerciseId: 'seed-machine-row', sets: 1, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '한 팔씩 · 작업 세트 1개', atSec: 386 },
          { exerciseId: 'seed-low-row', sets: 2, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '두 그립 10회+10회 슈퍼세트', atSec: 532 },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 1, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 15초 움직이고 15초 쉬기 2회 · 한 세트 · 15초 쉬고 이어 하기', atSec: 740 },
          { exerciseId: 'seed-standing-calf-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, atSec: 753 },
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '풀업 네 가지로 시작해 풀다운과 로우, 허리 운동으로 끝내는 옛 방식의 등 날이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-pull-up', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 클로즈·패러럴·비하인드 넥도 3세트씩 해요', atSec: 193 },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '리버스 그립 · 매 회 멈춰 쥐어짜기', atSec: 314 },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩 · 벤치 짚고', atSec: 358 },
          { exerciseId: 'seed-t-bar-row', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 와이드 그립 피라미드 · 1~4판 피라미드 · 마지막은 3판으로 내려 좁은 그립', atSec: 415 },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '오버·언더 그립 중 골라서', atSec: 506 },
          { exerciseId: 'seed-hyperextension', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '반동 없이 천천히', atSec: 541 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-brutal-quad-burning-leg-day/' },
    summaryKo: '5일 쉰 뒤의 하체 날이에요. 한 다리 익스텐션을 먼저 하고 스미스 스쿼트와 레그 프레스로 이어 가요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-extension', sets: 2, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '한 다리씩 · 20회 이상', atSec: 183 },
          { exerciseId: 'seed-hip-adduction-machine', sets: 1, repsMin: 6, repsMax: 6, src: { sets: 'video', reps: 'video' }, noteKo: '스쿼트 전 가볍게 예열', atSec: 728 },
          { exerciseId: 'seed-smith-machine-squat', sets: 2, repsMin: 11, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '좁은 스탠스 · 무릎을 앞으로', atSec: 517 },
          { exerciseId: 'seed-leg-press', sets: 2, repsMin: 7, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한 다리씩 천천히', atSec: 555 },
          { exerciseId: 'seed-seated-calf-raise', sets: 5, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '무겁게 2세트 뒤 무게 내려 3세트', atSec: 979 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/chris-bumstead-killer-leg-day-workout' },
    summaryKo: '한 다리 익스텐션과 레그 컬로 예열한 뒤 백 스쿼트와 불가리안 스쿼트를 하고 카프로 끝내요. 본 세트는 두 세트씩, 카프는 4세트예요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-extension', sets: 2, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '한 다리씩 20회 뒤 레스트포즈 2번', atSec: 294 },
          { exerciseId: 'seed-lying-leg-curl', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 불가리안 뒤에 한 번 더 해요 · 트리플 드롭', atSec: 1259 },
          { exerciseId: 'seed-barbell-squat', sets: 2, repsMin: 8, repsMax: 14, src: { sets: 'video', reps: 'video' }, noteKo: '1세트 한계까지, 2세트 8~10회', atSec: 809 },
          { exerciseId: 'seed-bulgarian-split-squat', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, atSec: 975 },
          { exerciseId: 'seed-standing-calf-raise', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '4~6세트 · 주마다 시티드와 번갈아', atSec: 1166 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '어덕터와 레그 익스텐션으로 고관절·무릎을 데운 뒤 펜듈럼 스쿼트와 벨트 스쿼트 같은 프레스 동작에 무게를 둬요. 펜듈럼은 풀 반복과 하프 반복을 번갈아 실패 지점까지 가요. 영어 영상이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-hip-adduction-machine', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '고관절 예열', atSec: 683 },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '무릎 예열', atSec: 692 },
          { exerciseId: 'seed-pendulum-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '풀 3회+하프 3회 반복, 실패까지', atSec: 1346 },
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '올림피아 챔피언 출신 선수가 직접 지도한 하체 날이에요. 워밍업 뒤 본 세트를 실패 지점 너머까지 가는 고강도 방식이에요(익스텐션 3·프레스 2·핵 2세트, 카프는 1세트). 익스텐션부터 카프까지 일곱 가지예요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '선피로 · 수축 정지 후 천천히 내리기', atSec: 112 },
          { exerciseId: 'seed-leg-press', sets: 2, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 실패 후 레스트포즈', atSec: 606 },
          { exerciseId: 'seed-hack-squat', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '바닥에서 멈추지 않기 · 마지막 세트 실패까지', atSec: 883 },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '마지막 세트 실패 지점까지' },
          { exerciseId: 'seed-stiff-leg-deadlift', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '허리 중립 범위까지만 내리기', atSec: 1315 },
          { exerciseId: 'seed-standing-calf-raise', sets: 1, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '1세트 실패 지점까지', atSec: 1881 },
          { exerciseId: 'seed-seated-calf-raise', sets: 1, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '1세트 실패 지점까지', atSec: 1886 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '반복 수를 높게 잡고 앞·뒤 허벅지를 모두 채우는 하체 날이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-extension', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, atSec: 94 },
          { exerciseId: 'seed-smith-machine-squat', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 30, repsMax: 30, src: { sets: 'video', reps: 'video' }, noteKo: '발 위치 3가지 · 10회씩 넓게·좁게·좁고 낮게', atSec: 191 },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, atSec: 479 },
          { exerciseId: 'seed-walking-lunge', sets: 3, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '한 다리씩 · 어깨 수평 유지', atSec: 619 },
          { exerciseId: 'seed-dumbbell-stiff-leg-deadlift', sets: 3, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '덤벨을 정강이에 붙여 내리기', atSec: 693 },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '마지막에 무게 빼며 이어 가기', atSec: 770 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '어덕터와 햄스트링으로 시작해 익스텐션, 프레스, 핵 스쿼트, 런지, 카프까지 모두 두 세트씩 해요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-hip-adduction-machine', sets: 2, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 15–20회, 10–15회 · 실패까지·정지', atSec: 338 },
          { exerciseId: 'seed-seated-leg-curl', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–10회, 15회 + 레스트포즈 2세트(10~15초 쉬고)', atSec: 468 },
          { exerciseId: 'seed-leg-extension', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 15회 + 드롭(5회 이상 되게)', atSec: 615 },
          { exerciseId: 'seed-leg-press', sets: 2, repsMin: 8, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '넓은·일반 스탠스 번갈아 · 깊게 · 레스트포즈', atSec: 1005 },
          { exerciseId: 'seed-hack-squat', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 10–12회 + 레스트포즈 2세트 · 90도보다 깊게', atSec: 780 },
          { exerciseId: 'seed-walking-lunge', sets: 2, repsMin: 25, repsMax: 30, src: { sets: 'video', reps: 'video' }, noteKo: '걸음 수 · 덤벨 1세트 뒤 맨몸으로 실패까지', atSec: 1064 },
          { exerciseId: 'seed-donkey-calf-raise', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12–15회, 8–12회', atSec: 1108 },
          { exerciseId: 'seed-seated-calf-raise', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 12–15회, 8–12회 · 전 범위', atSec: 1156 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '어덕터·어브덕터로 시작해 앞 허벅지, 햄스트링, 엉덩이까지 고르게 다뤄요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-hip-adduction-machine', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '고관절 예열', atSec: 55 },
          { exerciseId: 'seed-hip-abduction-machine', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '고관절 예열', atSec: 64 },
          { exerciseId: 'seed-hack-squat', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-reverse-hack-squat', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '조금 넓은 스탠스 · 깊게', atSec: 146 },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '천천히 통제하며', atSec: 169 },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '몇 회는 수축에서 멈추기', atSec: 216 },
          { exerciseId: 'seed-romanian-deadlift', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-cable-kickback', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩', atSec: 272 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '카프부터 시작해 머신 위주로 네 세트씩 채우는 단순한 구성이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-donkey-calf-raise', sets: 5, repsMin: 8, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '세트마다 무겁게', atSec: 43 },
          { exerciseId: 'seed-hip-abduction-machine', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '엉덩이·고관절 예열', atSec: 73 },
          { exerciseId: 'seed-seated-leg-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '수축 꽉 · 짧게 멈추기', atSec: 80 },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '발은 골반 너비 · 깊게', atSec: 97 },
          { exerciseId: 'seed-hack-squat', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '무게는 두 플레이트로 깊게', atSec: 147 },
          { exerciseId: 'seed-leg-extension', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 153 },
          { exerciseId: 'seed-dumbbell-stiff-leg-deadlift', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 덤벨 · RDL과 번갈아', atSec: 168 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '카프로 시작해 햄스트링, 익스텐션 드롭세트, 펜듈럼, AFS 프레스, 핵 스쿼트를 거쳐 둔근 머신으로 끝내는 하체 날이에요. 영어 영상이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-standing-calf-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, atSec: 338 },
          { exerciseId: 'seed-leg-press-calf-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '영상: 로터리 카프(토 프레스)', atSec: 478 },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '영상: 햄 트랙터 레그 컬', atSec: 645 },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '마지막 세트 드롭 2번(130→90→60)', atSec: 927 },
          { exerciseId: 'seed-pendulum-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, atSec: 1102 },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '영상: AFS 프레스(대퇴사두 중심)', atSec: 1465 },
          { exerciseId: 'seed-hack-squat', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'video' }, noteKo: '마무리 · 바닥에서 잠깐 버티기', atSec: 1680 },
          { exerciseId: 'seed-standing-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, atSec: 1927 },
          { exerciseId: 'seed-glute-kickback-machine', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 글루티네이터 머신', atSec: 2028 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '주요 종목을 10회, 8회, 6회로 올리는 연말 강도 구성이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-belt-squat', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '10·8·6회 · 다음 두 종목과 트라이세트', atSec: 168 },
          { exerciseId: 'seed-cable-romanian-deadlift', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '10·8·6회 · 같은 기구로 · 밴드 파이어 하이드런트 이어서', atSec: 200 },
          { exerciseId: 'seed-lunge-barbell', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 10회, 8회, 6회 · 한 다리씩 · 프런트 랙 앞 런지 번갈아 · 밴드 TKE와 슈퍼세트', atSec: 371 },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 10회, 8회, 6회 · 영상: 버티컬 레그 프레스 · 익스텐션과 슈퍼세트', atSec: 480 },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '10·8·6회', atSec: 464 },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '10·8·6회 · 카프와 슈퍼세트', atSec: 585 },
          { exerciseId: 'seed-donkey-calf-raise', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '10·8·6회 · 마지막 드롭세트', atSec: 628 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '레그 컬과 익스텐션은 피라미드로 올린 뒤 실패 너머까지 가는 한 세트를, 세이프티바 스쿼트는 폭발적인 무거운 네 세트를, 스미스 불가리안은 버티기와 드롭으로 끝내는 구성이에요. 영어 영상이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-lying-leg-curl', sets: 5, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 4세트 + 드롭 세트 · 피라미드 뒤 1세트 실패·드롭·부분 반복·버티기', atSec: 133 },
          { exerciseId: 'seed-leg-extension', sets: 5, repsMin: 7, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '4세트 7~8회 뒤 1세트 드롭·부분 반복', atSec: 374 },
          { exerciseId: 'seed-safety-bar-squat', sets: 4, repsMin: 6, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '8회씩 올려 마지막 6~7회 · 폭발적으로', atSec: 740 },
          { exerciseId: 'seed-bulgarian-split-squat-smith', sets: 5, repsMin: 8, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '한 다리씩 4세트 뒤 8회+8초 버티기+드롭', atSec: 1024 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: 'EZ바 컬과 프리처 컬, 라잉 익스텐션과 클로즈 벤치, 리버스 컬과 리스트 컬로 바벨 위주로 팔 전체를 다뤄요. 종목마다 3~5세트, 12~15회를 반동 없이 하라고 해요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-ez-bar-curl', sets: 3, repsMin: 12, repsMax: 15, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '반동 없이 · 그립·팔꿈치로 장두/단두', atSec: 387 },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '90도에 가까운 패드 · 벤치로 대신해도 돼요', atSec: 484 },
          { exerciseId: 'seed-skull-crusher', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '팔꿈치 살짝 뒤로 · 천천히 버티며 내리기', atSec: 616 },
          { exerciseId: 'seed-close-grip-bench-press', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '이마로 내리기 부담되면 가슴으로', atSec: 821 },
          { exerciseId: 'seed-reverse-barbell-curl', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'video' }, noteKo: '오버그립 · 마지막 1~2회 힘들게', atSec: 901 },
          { exerciseId: 'seed-wrist-curl', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '손가락 끝까지 풀었다가 감아 올리기', atSec: 951 },
          { exerciseId: 'seed-reverse-wrist-curl', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '리스트 컬보다 가볍게', atSec: 976 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '클로즈 벤치로 시작해 삼두를 네 세트씩, 이두를 두세 세트씩 다루는 팔 날이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-smith-close-grip-bench-press', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '견갑 고정 · 손목 수직', atSec: 31 },
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '로프 · 끝까지 펴고 버티기 · 마지막 드롭 · 이어서 원암 푸시다운 4세트(팔을 살짝 뒤로)', atSec: 261 },
          { exerciseId: 'seed-triceps-extension-machine', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '팔꿈치 벌어지지 않게 모으기', atSec: 538 },
          { exerciseId: 'seed-dumbbell-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '번갈아 5회씩 끊어서', atSec: 863 },
          { exerciseId: 'seed-hammer-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' } },
          { exerciseId: 'seed-machine-preacher-curl', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '끝까지 펴지 않기 · 강제 반복', atSec: 1256 },
          { exerciseId: 'seed-concentration-curl', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, atSec: 1351 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/samson-dauda-superset-arms-workout' },
    summaryKo: '이두와 삼두를 한 쌍씩 묶어 세 번 도는 대회 12주 전 팔 운동이에요. 워밍업 2~3세트 뒤 본 세트 4개를 기준으로, 숫자보다 근육을 다 쓰는 느낌을 강조해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-machine-preacher-curl', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '푸시다운과 슈퍼세트 · 워밍업 2~3세트 먼저', atSec: 327 },
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '서서', atSec: 336 },
          { exerciseId: 'seed-dip-machine', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '덤벨 프리처와 슈퍼세트 · 한 팔 프리처 컬과 슈퍼세트 · 세트마다 무겁게', atSec: 636 },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 해머스트렝스 한 팔 컬(프리처 벤치)', atSec: 693 },
          { exerciseId: 'seed-machine-curl', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '오버헤드 익스텐션과 슈퍼세트 · 영상: 노틸러스', atSec: 1016 },
          { exerciseId: 'seed-machine-overhead-triceps-extension', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '앉아서 · 가볍게 끝까지 늘리고 수축', atSec: 1065 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'BarBend 기사', url: 'https://barbend.com/news/sam-sulek-20-inch-arm-workout/' },
    summaryKo: '푸시다운과 덤벨 컬을 번갈아 하고 컨센트레이션 컬, 케이블 슈퍼세트로 끝내는 벌크 중 팔 운동이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '기사: 10–12회 3세트, 15–20회 3세트 · 덤벨 컬과 번갈아 · 레스트포즈·드롭세트', atSec: 581 },
          { exerciseId: 'seed-dumbbell-curl', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '이어서 실패까지 1세트 · 반쯤에서 멈춤 · 끝은 반동 반복', atSec: 1182 },
          { exerciseId: 'seed-concentration-curl', sets: 2, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '벤트오버 자세 · 끝은 보조 반복', atSec: 1290 },
          { exerciseId: 'seed-cable-curl', sets: 2, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '기사: 푸시다운과 슈퍼세트, 실패까지 · 푸시다운과 쉬지 않고 번갈아 번아웃', atSec: 1505 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '삼두 먼저, 이두 나중으로 나눠 가벼운 무게로 자세와 근육 연결에 집중하는 팔 날이에요. 쉬는 시간은 줄이고 필요하면 세트를 더한다고 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-close-grip-bench-press', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '가볍게 · 아래·위에서 멈추기 · 튕기지 않기', atSec: 71 },
          { exerciseId: 'seed-dips', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '견갑을 먼저 고정하고 시작', atSec: 108 },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 한 팔 리버스 푸시다운 3세트를 더 해요' },
          { exerciseId: 'seed-preacher-curl', sets: 4, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '늘어난 자세에서 부하', atSec: 250 },
          { exerciseId: 'seed-cable-concentration-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '매 반복 꼭대기에서 멈추기', atSec: 291 },
          { exerciseId: 'seed-cable-hammer-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '로프 · 내리는 동작 천천히', atSec: 353 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '모든 종목을 네 세트씩 하는 고볼륨 팔 운동이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 시티드 푸시다운 머신', atSec: 160 },
          { exerciseId: 'seed-dumbbell-incline-triceps-extension', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '몸을 뒤로 기대서', atSec: 229 },
          { exerciseId: 'seed-cable-overhead-extension', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '로프 · 서서 팔꿈치 위·뒤로', atSec: 311 },
          { exerciseId: 'seed-dips', sets: 4, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '마무리 복합 운동', atSec: 321 },
          { exerciseId: 'seed-cable-concentration-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '무릎 꿇고 높은 케이블 · 매 회 정점 멈춤', atSec: 369 },
          { exerciseId: 'seed-reverse-curl-cable', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: 'EZ바', atSec: 416 },
          { exerciseId: 'seed-ez-bar-preacher-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '반동 없이 다룰 무게로', atSec: 429 },
          { exerciseId: 'seed-hammer-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩', atSec: 488 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '프리처 컬과 익스텐션을 번갈아 하는 네 가지 팔 운동이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 2, repsMin: 8, repsMax: 12, restSec: 60, src: { sets: 'video', reps: 'default' }, noteKo: '한쪽씩 · 약한 쪽 먼저', atSec: 35 },
          { exerciseId: 'seed-triceps-pushdown', sets: 2, repsMin: 8, repsMax: 12, restSec: 60, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 커프 트라이셉스 익스텐션 · 상체 숙이고 팔꿈치 옆구리 고정', atSec: 849 },
          { exerciseId: 'seed-cable-curl', sets: 2, repsMin: 8, repsMax: 12, restSec: 60, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 한 발 앞으로 케이블 컬 · 팔꿈치 뒤에 고정', atSec: 1326 },
          { exerciseId: 'seed-cable-overhead-extension', sets: 2, repsMin: 8, repsMax: 12, restSec: 60, src: { sets: 'video', reps: 'default' }, noteKo: '케이블 낮게 · 몸 기울여 늘이기', atSec: 1631 },
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '머신과 덤벨로 여러 각도에서 가슴을 다루고, 업라이트 로우 슈퍼세트와 프레스로 어깨, 푸시다운과 익스텐션으로 삼두까지 끝내요.',
    days: [
      {
        nameKo: '푸시',
        items: [
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 회 늘인 채 멈춤', atSec: 92 },
          { exerciseId: 'seed-incline-press-machine', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 해머 스트렝스 프레스 · 꽉 쥐어짜기', atSec: 126 },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '손 안쪽으로 모아 쥐기', atSec: 191 },
          { exerciseId: 'seed-incline-dumbbell-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 345 },
          { exerciseId: 'seed-dumbbell-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 348 },
          { exerciseId: 'seed-upright-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '넓은 그립 · 프론트 레이즈와 슈퍼세트 · 이어서 3세트(좁은 그립 · 레터럴 레이즈와 슈퍼세트)', atSec: 367 },
          { exerciseId: 'seed-front-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '앉아서 · 업라이트 로우와 슈퍼세트', atSec: 370 },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '좁은 업라이트 로우와 슈퍼세트', atSec: 428 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 502 },
          { exerciseId: 'seed-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 502 },
          { exerciseId: 'seed-dips', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 실패까지' },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 571 },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '푸시다운에 이어서', atSec: 571 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '프레스로 시작해 가슴·어깨·삼두를 모두 세 세트씩 채워요.',
    days: [
      {
        nameKo: '푸시',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '넓은 그립 · 팔꿈치 벌려서', atSec: 86 },
          { exerciseId: 'seed-incline-press', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 174 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 163 },
          { exerciseId: 'seed-dumbbell-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '먼저 가볍게 워밍업 세트', atSec: 182 },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩', atSec: 268 },
          { exerciseId: 'seed-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 276 },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '정점에서 꽉 쥐어짜기', atSec: 300 },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '정점에서 1초 멈춤', atSec: 346 },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '정점에서 1초 멈춤', atSec: 353 },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩 · 등 고정', atSec: 378 },
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/sam-sulek-bulking-chest-side-delts-workout/' },
    summaryKo: '스미스 인클라인을 무겁게 하고 케이블 프레스·플라이, 측면 레이즈로 마무리해요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-incline-press-smith', sets: 2, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '1세트 실패까지 · 2세트는 가볍게 천천히', atSec: 414 },
          { exerciseId: 'seed-standing-cable-chest-press', sets: 2, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '몸 숙여서 · 실패 뒤 부분 반복 몇 회', atSec: 690 },
          { exerciseId: 'seed-cable-crossover', sets: 1, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '케이블 프레스 마지막 세트와 슈퍼세트', atSec: 838 },
          { exerciseId: 'seed-machine-lateral-raise', sets: 1, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서 · 펌프 찰 때까지', atSec: 1135 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: 'Fitness Volt 기사', url: 'https://fitnessvolt.com/derek-lunsford-pull-day-workout/' },
    summaryKo: '풀다운으로 넓이를 잡고 로우와 랙 풀로 두께를 채운 뒤 해머 컬로 끝내요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '좁은 뉴트럴 그립과 넓은 그립 · 하부 광배 먼저 고립', atSec: 895 },
          { exerciseId: 'seed-low-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '리버스 그립 · 하부 광배 고립', atSec: 904 },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '마지막 세트는 랙 풀과 이어서', atSec: 865 },
          { exerciseId: 'seed-rack-pull', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '어깨 뒤로·아래로, 가슴 들기', atSec: 1077 },
          { exerciseId: 'seed-chest-supported-t-bar-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '상부 승모근 겨냥', atSec: 989 },
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '풀업과 로우로 등을 채우고 이두 세 가지로 끝내는 풀 날이에요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-pull-up', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 32 },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '광배 예열용', atSec: 76 },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '언더핸드 그립 · 상체 세우고 살짝 뒤로', atSec: 88 },
          { exerciseId: 'seed-cable-standing-row', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩 · 늘어남을 먼저 느끼고 천천히', atSec: 115 },
          { exerciseId: 'seed-chest-supported-t-bar-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 체스트 서포티드 로우', atSec: 169 },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '좁은 그립 · 무게보다 수축', atSec: 200 },
          { exerciseId: 'seed-incline-dumbbell-curl', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 253 },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한쪽씩', atSec: 257 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '넓은 풀업과 스트레이트 암 풀다운을 묶어 시작하고 로우 세 가지, 이두 두 가지로 이어 가요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-pull-up', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '스트레이트 암 풀다운과 슈퍼세트 · 깊이 늘리고 견갑으로 당기기', atSec: 187 },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 4, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '엉덩이 살짝 뒤로 · 수축 잠깐 버티기', atSec: 242 },
          { exerciseId: 'seed-t-bar-row', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '좁은 그립 · 바닥에서 멈추고 반동 없이 · 척추 중립', atSec: 315 },
          { exerciseId: 'seed-row-smith', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 10, repsMax: 10, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-chin-up', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 577 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '어시스트 풀업부터 머신 로우, 후면, 이두 두 가지까지 두 세트씩 다루는 대회 직전 구성이에요. 첫 세트는 8–12회 실패까지, 둘째 세트는 가볍게 15–20회를 노린다고 해요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-assisted-pull-up', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 12–15회 · 무릎 대는 머신 · 예열 겸', atSec: 298 },
          { exerciseId: 'seed-high-row', sets: 2, repsMin: 8, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–10회, 15–20회', atSec: 385 },
          { exerciseId: 'seed-low-row', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8–12회, 15회 + 레스트포즈 2세트 · 끝에서 허리 아치·팔꿈치 뒤로', atSec: 545 },
          { exerciseId: 'seed-machine-row', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '한 팔 8–10회, 양팔 8–12회 + 레스트포즈 · 약한 쪽 먼저', atSec: 642 },
          { exerciseId: 'seed-machine-lat-pulldown', sets: 2, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 8회, 15회 · 맨 위에서 끝까지 늘리기', atSec: 758 },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 2, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '케이블 풀오버 · 가볍게 높은 횟수', atSec: 808 },
          { exerciseId: 'seed-reverse-pec-deck', sets: 2, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 15회, 15–20회 + 더블 드롭 · 가볍게, 자세 유지', atSec: 934 },
          { exerciseId: 'seed-barbell-curl', sets: 2, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '반동 없이 · 꼭대기 수축', atSec: 1069 },
          { exerciseId: 'seed-machine-preacher-curl', sets: 2, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '좁은 그립 · 이어서 2세트(한 팔씩 · 같은 머신 · 끝까지 올려 수축)', atSec: 1136 },
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '풀업, 딥스로 시작해 하체, 가슴, 팔까지 세 세트씩 도는 하루 전신 운동이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-pull-up', sets: 3, repsMin: 5, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 패러럴·와이드 그립을 3세트씩 해요', atSec: 141 },
          { exerciseId: 'seed-dips', sets: 3, repsMin: 5, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '먼저 팔 펴고 몸 버티기 20–30초로 예열', atSec: 167 },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 224 },
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '보통 무게 · 바닥에서 천천히 · 위에서 둔근 조이기', atSec: 247 },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 263 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '가슴과 등을 번갈아 하고 하체로 마무리하는 전신 6종이에요. 헬스장에 주 1~2회만 갈 때 쓰는 구성이고, 가볍게 15회씩 해요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 5, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '20kg 바가 힘들면 덤벨 프레스로 대신해요' },
          { exerciseId: 'seed-assisted-pull-up', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '세 번째 세트는 언더그립', atSec: 360 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=_GPYjWqGoOE' },
    summaryKo: '바빠서 주 2회만 갈 때 쓰는 기구 위주 전신 6종이에요. 20회씩 3세트로 하고 끝에 러닝머신 빠르게 걷기 30분을 더해요. 한 번 하면 하루 이상 쉬고 다음 운동을 하라고 해요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '견갑 뒤로 모으기 · 아래쪽으로 당기기', atSec: 89 },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '견갑 모은 채 · 어깨 안 나오는 범위', atSec: 140 },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '허리 세우고 당기기', atSec: 218 },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '등받이 살짝 뒤로 · 복압으로 허리 아치 막기', atSec: 283 },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '20회 간신히 하는 무게 · 내릴 때도 힘 주기', atSec: 360 },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '천천히 내리기 · 지치면 무게 내려 20회 채우기', atSec: 460 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '3개월 초보 프로그램의 첫 달이에요. 월·수·금에 전신 A와 B를 번갈아 하고, 화·목에 복근과 들고 걷기를 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '전신 A',
        items: [
          { exerciseId: 'seed-dumbbell-squat', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 덤벨 드롭 스쿼트 · 자세 무너지기 전까지', atSec: 278 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 한 팔씩 하는 덤벨 프레스 · 자세 무너지기 전까지', atSec: 102 },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '기구는 근거에 없어 우리가 정했어요 · 자세 무너지기 전까지', atSec: 140 },
          { exerciseId: 'seed-bodyweight-split-squat', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 다리마다 지칠 때까지', atSec: 328 },
        ],
      },
      {
        nameKo: '전신 B',
        items: [
          { exerciseId: 'seed-cable-pull-through', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '기구는 근거에 없어 우리가 정했어요 · 자세 무너지기 전까지', atSec: 236 },
          { exerciseId: 'seed-reverse-lunge', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '다리마다', atSec: 368 },
          { exerciseId: 'seed-push-up', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 지칠 때까지', atSec: 61 },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '자세 무너지기 전까지', atSec: 186 },
        ],
      },
      {
        nameKo: '복근·들고 걷기',
        items: [
          { exerciseId: 'seed-crunch', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 롤업 — 앱에 없어 크런치로 옮겼어요', atSec: 411 },
          { exerciseId: 'seed-suitcase-carry', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 팔마다 지칠 때까지 걷기', atSec: 452 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '설명란에 입문자용으로 따로 적힌 전신 구성이에요. 주 2~3회 하고, 측면·후면 어깨는 이어서 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '벤치 한두 칸만 · 팔은 화살표 모양', atSec: 62 },
          { exerciseId: 'seed-goblet-squat', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '체중 50%로 10회 되면 바벨로', atSec: 184 },
          { exerciseId: 'seed-pull-up', sets: 3, repsMin: 5, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 뉴트럴 그립 · 못 하면 인버티드 로우부터 · 8회 넘으면 중량', atSec: 296 },
          { exerciseId: 'seed-romanian-deadlift-dumbbell', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '등 펴고 엉덩이 뒤로 · 내려갈 깊이는 사람마다', atSec: 384 },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '넓은 오버그립 바 · 아랫가슴 쪽으로 당기기', atSec: 465 },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '다음 종목과 이어서 · 영상: 인클라인에 등 대고 Y 레이즈 · 실패까지', atSec: 559 },
          { exerciseId: 'seed-dumbbell-incline-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '앞 종목 실패 뒤 바로 엎드려 실패까지', atSec: 573 },
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '스쿼트·벤치·데드리프트를 하루에 하나씩 무겁게 하고 보조 운동을 더하는 월·수·금 프로그램이에요. 영어 영상이에요.',
    days: [
      {
        nameKo: '월',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 4, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 무거운 1~3세트 · 빈 바로 시작해도 돼요', atSec: 69 },
          { exerciseId: 'seed-romanian-deadlift', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 데드리프트 변형 · 다음 풀업과 슈퍼세트', atSec: 108 },
          { exerciseId: 'seed-pull-up', sets: 4, repsMin: 2, repsMax: 3, src: { sets: 'video', reps: 'video' }, noteKo: '초보는 2~3회씩 여러 번 · 못 하면 네거티브', atSec: 147 },
          { exerciseId: 'seed-skull-crusher', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '다음 종목과 슈퍼세트', atSec: 158 },
          { exerciseId: 'seed-hammer-curl', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-push-up', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 가능한 만큼, 복근 추가 · 3~4회도 안 될 때까지', atSec: 278 },
        ],
      },
      {
        nameKo: '수',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 6, repsMin: 4, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '영상은 무거운 1~3세트(4~8회) 뒤 3세트 이상(6~10회) · 주 1회라 양을 조금 더', atSec: 261 },
          { exerciseId: 'seed-overhead-press', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '다음 친업과 슈퍼세트 · 엄격하게', atSec: 172 },
          { exerciseId: 'seed-chin-up', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'default' }, noteKo: '가능한 만큼' },
          { exerciseId: 'seed-hyperextension', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '친업과 슈퍼세트', atSec: 205 },
          { exerciseId: 'seed-seated-cable-row', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-crunch', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 복근 운동을 가능한 만큼' },
        ],
      },
      {
        nameKo: '금',
        items: [
          { exerciseId: 'seed-deadlift', sets: 3, repsMin: 2, repsMax: 5, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 무거운 1~3세트', atSec: 218 },
          { exerciseId: 'seed-front-squat', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 스쿼트 변형 · 다음 풀업과 슈퍼세트' },
          { exerciseId: 'seed-pull-up', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '스쿼트 변형·EZ바 컬과 각각 슈퍼세트' },
          { exerciseId: 'seed-ez-bar-curl', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '풀업과 슈퍼세트' },
          { exerciseId: 'seed-push-up', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 가능한 만큼, 복근 추가 · 3~4회도 안 될 때까지', atSec: 278 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=92SXBcTzoco' },
    summaryKo: '직장인 초보를 위한 전신 구성이에요. 프레스로 시작해 등과 하체를 거쳐 측면·후면 어깨 슈퍼세트로 마무리해요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 덤벨 · 가슴 평평하면 낮은 각도 · 시간 남으면 4세트', atSec: 45 },
          { exerciseId: 'seed-assisted-pull-up', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '정리에 따라 턱걸이 · 되면 턱걸이, 없으면 랫풀다운', atSec: 156 },
          { exerciseId: 'seed-goblet-squat', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '앞으로 쏠리면 뒤꿈치에 원판', atSec: 279 },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '일자 바 추천 · 배꼽~명치 사이로 견갑 접기', atSec: 380 },
          { exerciseId: 'seed-romanian-deadlift', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 바벨 · 어깨보다 살짝 넓게 · 위에서 어깨 젖히지 않기', atSec: 491 },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '다음 종목과 슈퍼세트 · 영상은 벤치에 앉아 멀리 밀어내듯', atSec: 582 },
          { exerciseId: 'seed-dumbbell-incline-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '앞 종목 뒤 바로 일어나 숙여서', atSec: 637 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=o82RrvHYkJQ' },
    summaryKo: '헬스장을 막 등록한 사람을 위한 1시간 기구 전신이에요. 근력 뒤에 유산소 30분을 더해요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-incline-press-machine', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 인클라인 머신 · 좋아하는 프레스로 골라도 돼요', atSec: 109 },
          { exerciseId: 'seed-seated-cable-row', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '가슴 다음엔 어깨보다 등 먼저', atSec: 260 },
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '정리에는 풀업도 있어요' },
          { exerciseId: 'seed-shoulder-press-machine', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '초보는 머신으로 무리하지 않기', atSec: 374 },
          { exerciseId: 'seed-smith-machine-squat', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '힘들면 3세트 · 상·하체 순서를 번갈아', atSec: 653 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=pXzEw2D8bds' },
    summaryKo: '헬스장이 처음일 때 가슴·등·어깨·하체를 기구 위주로 도는 5종이에요. 15~20회씩 3~4세트로 해요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 팔꿈치 90도 · 끝까지 펴지 않기', atSec: 73 },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 어깨 불편하면 언더그립', atSec: 198 },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 어깨 내리고 팔꿈치 잠그지 않기', atSec: 351 },
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 맨몸이 되면 바벨이나 덤벨', atSec: 520 },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 롱풀 머신 · 3~4세트 · 패러럴 그립 배꼽 쪽으로', atSec: 728 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '유산소와 스트레칭으로 시작해 등·가슴·하체·어깨 순서로 하고 인터벌로 끝내는 1시간 구성이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 12, repsMax: 15, restSec: 75, src: { sets: 'video', reps: 'video' }, noteKo: '허리 꺾지 말고 윗가슴 쪽으로', atSec: 121 },
          { exerciseId: 'seed-smith-machine-bench-press', sets: 4, repsMin: 10, repsMax: 12, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '천천히 내려 가슴 살짝 터치', atSec: 180 },
          { exerciseId: 'seed-lying-leg-curl', sets: 4, repsMin: 12, repsMax: 15, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '골반 뜨지 않게 천천히', atSec: 240 },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 12, repsMax: 15, restSec: 105, src: { sets: 'video', reps: 'video' }, noteKo: '발 V자 · 무릎 끝까지 펴지 않기', atSec: 270 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 4, repsMin: 10, repsMax: 12, restSec: 75, src: { sets: 'video', reps: 'video' }, noteKo: '벤치 80도 · 팔꿈치 45도 앞으로', atSec: 302 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '무엇을 할지 모를 때 쓰는 3분할이에요. 밀기, 당기기, 하체와 복근 순서로 나누고, 후면 어깨는 등 날에 넣어요.',
    days: [
      {
        nameKo: '밀기',
        items: [
          { exerciseId: 'seed-pec-deck-fly', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '가벼운 무게로 먼저 지치게', atSec: 189 },
          { exerciseId: 'seed-incline-press-machine', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 원판 끼우는 머신 · 메인이라 무겁게', atSec: 276 },
          { exerciseId: 'seed-shoulder-press-machine', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '덤벨·바벨로 해도 돼요', atSec: 395 },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '가벼운 무게로', atSec: 457 },
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'video' }, atSec: 508 },
        ],
      },
      {
        nameKo: '당기기',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '15~20회 무게로 워밍업 뒤', atSec: 568 },
          { exerciseId: 'seed-low-row', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상: 수평 당기기', atSec: 596 },
          { exerciseId: 'seed-dumbbell-row', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 벤트오버 · 불편하면 인클라인 벤치에 기대기', atSec: 672 },
          { exerciseId: 'seed-rear-delt-fly', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '덤벨 로우 자세 그대로 숙여서 · 가볍게', atSec: 813 },
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · EZ바도 돼요 · 천천히 내리기', atSec: 871 },
        ],
      },
      {
        nameKo: '하체·복근',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '기구는 근거에 없어 우리가 정했어요 · 메인 운동', atSec: 966 },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 허리 받치고 무겁게', atSec: 979 },
          { exerciseId: 'seed-leg-extension', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트', atSec: 1117 },
          { exerciseId: 'seed-lying-leg-curl', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 가볍게 자극 위주', atSec: 1146 },
          { exerciseId: 'seed-crunch', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '허리 불편하면 발을 바닥에', atSec: 1245 },
          { exerciseId: 'seed-reverse-crunch', sets: 4, repsMin: 12, repsMax: 12, src: { sets: 'default', reps: 'default' }, atSec: 1296 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=CbWXVgw-Q9k' },
    summaryKo: '초중급자용 3분할의 둘째 날이에요. 등 세 가지 뒤에 이두와 삼두를 케이블로 해요. 다른 두 날은 종목을 확인하지 못해 넣지 않았어요.',
    days: [
      {
        nameKo: '등·팔',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '목 아래로 당기고 끝에 살짝 더 아래로', atSec: 70 },
          { exerciseId: 'seed-machine-row', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '날개뼈 많이 접기 · 손잡이는 걸듯이', atSec: 287 },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 언더그립 · 일자 바 · 배꼽 쪽 · 너무 눕지 않기', atSec: 429 },
          { exerciseId: 'seed-behind-the-back-cable-curl', sets: 3, repsMin: 12, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 한 팔씩 · 팔꿈치만 접기', atSec: 621 },
          { exerciseId: 'seed-cable-curl', sets: 3, repsMin: 12, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '팔을 앞으로 뻗은 채 · 로프도 돼요', atSec: 789 },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '엄지 빼고 잡기', atSec: 862 },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '머리 위 아닌 앞으로 밀듯이 · 너무 숙이지 않기', atSec: 937 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=kjNQbNyc8ow' },
    summaryKo: '초중급자용 2분할의 상체 날이에요. 가슴·등·어깨를 두 종목씩 해요. 하체 날은 이 영상에 없어요.',
    days: [
      {
        nameKo: '상체',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '스미스 인클라인으로 해도 돼요 · 끝까지 다 밀지 않기', atSec: 119 },
          { exerciseId: 'seed-dumbbell-fly', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '11자보다 살짝 바깥까지만 모으기', atSec: 242 },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '없으면 턱걸이 · 늘릴 때 목을 어깨보다 뒤로', atSec: 330 },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 인클라인 덤벨 로우 · 손은 대각선', atSec: 444 },
          { exerciseId: 'seed-dumbbell-incline-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '앞 종목 뒤에 바로 · 손목 굳히고 옆으로 찢듯이', atSec: 619 },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '한 발 뒤로 서서 앞 대각선으로', atSec: 687 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '당기고, 밀고, 머리 위로 미는 순서로 하는 상체 3종이에요. 안 쓰던 근육에 익숙해지도록 높은 횟수로 해요.',
    days: [
      {
        nameKo: '상체',
        items: [
          { exerciseId: 'seed-machine-row', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '없으면 케이블로 해요 · 날개뼈 접어 가슴 열기', atSec: 69 },
          { exerciseId: 'seed-chest-press-machine', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '날개뼈 접은 채 · 팔꿈치 다 펴지 않기', atSec: 188 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '90도 벤치에 등 대고 · 팔꿈치 90도까지만', atSec: 314 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=Cb0yy0yHRUg' },
    summaryKo: '가슴 다음 어깨 순서로 두 종목만 해요. 15회로 몸을 풀고 12회를 네 번 해요.',
    days: [
      {
        nameKo: '가슴·어깨',
        items: [
          { exerciseId: 'seed-chest-press-machine', sets: 5, repsMin: 12, repsMax: 15, restSec: 40, src: { sets: 'video', reps: 'video' }, noteKo: '첫 세트 15회, 이후 12회 4세트 · 쉬는 시간 30~50초 · 밀 때 빠르게 내릴 때 천천히', atSec: 62 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 5, repsMin: 12, repsMax: 15, restSec: 40, src: { sets: 'video', reps: 'video' }, noteKo: '첫 세트 15회, 이후 12회 4세트 · 쉬는 시간 30~50초 · 12회 못 채우면 무게 낮추기', atSec: 327 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=UqlUZFZgczk' },
    summaryKo: '초보자에게 바벨·머신·덤벨로 가슴 쓰는 느낌을 잡아 주는 영상이에요. 다룬 종목을 순서대로 옮겼고, 전부 하라는 처방은 아니에요. 세트·횟수는 확인하지 못해 기본값으로 뒀어요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '어깨 뒤로 고정 · 엄지 안쪽으로 돌리며 밀기 · 먼저 지치게 하는 용도', atSec: 211 },
          { exerciseId: 'seed-incline-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '기구는 근거에 없어 우리가 정했어요 · 손은 이마 쪽으로', atSec: 279 },
          { exerciseId: 'seed-incline-press-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, atSec: 371 },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 플랫·와이드 머신을 모두 다뤄요 · 팔꿈치는 가슴 높이', atSec: 470 },
          { exerciseId: 'seed-dumbbell-bench-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '덤벨은 모으지 말고 앞으로 곧게 밀기', atSec: 687 },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '엉덩이 깊게 · 어깨가 앞으로 나오지 않게', atSec: 737 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=hHcdb6q9aaE' },
    summaryKo: '프로 선수가 등 운동의 기본을 설명하는 기초편의 종목들이에요. 세트·횟수는 확인하지 못해 기본값으로 뒀어요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '어깨보다 넓게 · 뒤로 눕지 말고 쇄골 쪽으로', atSec: 319 },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '가볍게 자세부터 · 배꼽 아래로 당기기', atSec: 401 },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '상체 15~45도 · 팔꿈치는 엉덩이 쪽으로', atSec: 502 },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '가볍게 끝까지 · 허리 반동 없이', atSec: 616 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=3OFjsL-YZvs' },
    summaryKo: '프레스 두 가지 뒤에 후면과 측면 레이즈로 마무리하는 기초·심화편의 종목들이에요. 세트·횟수는 확인하지 못해 기본값으로 뒀어요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-overhead-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '앉아서 살짝 기대기 · 인중까지 내리기 · 3초 내리고 1초 밀기', atSec: 265 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '바벨보다 가볍게 · 어깨선 따라 수직으로', atSec: 377 },
          { exerciseId: 'seed-dumbbell-incline-rear-delt-fly', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '인클라인 벤치에 엎드려 · 가볍게 몸에서 멀리', atSec: 564 },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '스트랩 · 팔꿈치 펴고 어깨 높이까지만', atSec: 708 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=vlDbSMToyeo' },
    summaryKo: '이두 세 가지와 삼두 세 가지로 구성한 기본 팔 운동이에요. 세트·횟수는 확인하지 못해 기본값으로 뒀어요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '일자 바 · 손목 부담되면 EZ바 · 다 펴기 직전까지만 내리기', atSec: 300 },
          { exerciseId: 'seed-preacher-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '기구는 근거에 없어 우리가 정했어요 · 깊게 내리고 끝까지 접지 않기', atSec: 385 },
          { exerciseId: 'seed-hammer-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '한쪽씩 번갈아 2회씩', atSec: 486 },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '한 걸음 물러나 엉덩이 살짝 뒤로 · 바는 손목 가까이', atSec: 591 },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '한 팔로 수직 · 힘들면 등 기대고 두 손으로', atSec: 660 },
          { exerciseId: 'seed-skull-crusher', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '기구는 근거에 없어 우리가 정했어요 · 팔꿈치 고정 · 무겁게 끝까지 펴지 않기', atSec: 789 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=iv8reqGucYE' },
    summaryKo: '종목을 늘리기보다 메인 운동의 세트를 늘리라는 조언에 맞춰, 초보자 추천 종목만 담았어요.',
    days: [
      {
        nameKo: '가슴·등·복근',
        items: [
          { exerciseId: 'seed-push-up', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '목표 20회 3세트 · 힘들면 무릎 대고', atSec: 100 },
          { exerciseId: 'seed-chest-press-machine', sets: 5, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '댓글에 5세트·10세트가 함께 언급돼요 · 3세트에서 시작해 세트 늘리기', atSec: 108 },
          { exerciseId: 'seed-lat-pulldown', sets: 5, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '댓글에 5세트·10세트가 함께 언급돼요 · 풀업이 되면 풀업도', atSec: 261 },
          { exerciseId: 'seed-lying-leg-raise', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '손등을 엉덩이 밑에 · 허리 뜨지 않게', atSec: 380 },
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
    scriptCheckedAt: '2026-11-10',
    basis: { labelKo: '시청자가 댓글에 정리한 내용', url: 'https://www.youtube.com/watch?v=D7iZMIy0C5E' },
    summaryKo: '어깨는 프레스 위주로, 팔과 하체는 기본 종목만 담았어요. 부위별 추천을 우리가 두 날로 묶었어요.',
    days: [
      {
        nameKo: '어깨·팔',
        items: [
          { exerciseId: 'seed-shoulder-press-machine', sets: 5, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '댓글에 프레스 위주로 세트를 늘리라는 언급이 있어요 · 사이드 레터럴보다 프레스', atSec: 2 },
          { exerciseId: 'seed-machine-curl', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '머신이 없으면 덤벨 컬', atSec: 256 },
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, atSec: 264 },
        ],
      },
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-extension', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '초보자 하체 메인 · 4~5세트', atSec: 336 },
          { exerciseId: 'seed-lying-leg-curl', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '초보자 하체 메인 · 4~5세트', atSec: 341 },
          { exerciseId: 'seed-barbell-squat', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '익스텐션·컬 4~5세트가 되면 맨몸부터 배우기', atSec: 343 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '위에서 당기는 운동과 앞에서 당기는 운동을 5세트씩 해요. 12회를 못 채우면 무게를 낮춰요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 5, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '첫 세트 15회, 이후 12회 4세트 · 와이드 그립 · 당길 때 빠르게 늘릴 때 천천히', atSec: 15 },
          { exerciseId: 'seed-seated-cable-row', sets: 5, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '첫 세트 15회, 이후 12회 4세트 · 영상은 수평 당기기 · 팔꿈치 벌어지지 않게', atSec: 263 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '운동을 많이 안 해 본 사람도 할 수 있게 고른 하체 순서예요. 스미스 스쿼트로 시작해 머신으로 마무리해요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-smith-machine-squat', sets: 5, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '첫 세트 워밍업 15회 · 와이드 스탠스로 깊게', atSec: 27 },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '영상: 파워 레그 프레스 · 무릎 모이지 않게', atSec: 299 },
          { exerciseId: 'seed-hip-thrust-machine', sets: 4, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '꼬리뼈가 천장 보게 최대한 높이', atSec: 486 },
          { exerciseId: 'seed-lying-leg-curl', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'default' }, atSec: 612 },
          { exerciseId: 'seed-leg-extension', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'default' }, atSec: 705 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '한 주에 세 번, 날마다 다른 6~7종으로 온몸을 도는 전신 루틴이에요. 마지막 세트는 늘어난 자리에서 반쪽 반복 3~5회를 더해요. 영어 영상이에요.',
    days: [
      {
        nameKo: 'A',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '벤치는 한두 칸만 · 팔꿈치 화살표 모양', atSec: 44 },
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 6, repsMax: 8, src: { sets: 'video', reps: 'video' }, atSec: 132 },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 뒤 아래쪽 반쪽 반복 3~5회', atSec: 214 },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '영상은 레그 컬 동작으로만 적음 · 시티드도 좋다고 함 · 무릎 살짝 굽힌 채 시작', atSec: 297 },
          { exerciseId: 'seed-incline-dumbbell-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '덤벨 오버헤드 익스텐션과 슈퍼세트', atSec: 439 },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'default' }, atSec: 446 },
        ],
      },
      {
        nameKo: 'B',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 3, repsMin: 4, repsMax: 6, src: { sets: 'video', reps: 'video' }, noteKo: '어깨가 불편하면 덤벨 프레스로', atSec: 501 },
          { exerciseId: 'seed-romanian-deadlift', sets: 3, repsMin: 6, repsMax: 8, src: { sets: 'video', reps: 'video' }, atSec: 547 },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 뒤 늘어난 자리 반쪽 반복 3~5회', atSec: 614 },
          { exerciseId: 'seed-walking-lunge', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '다리마다', atSec: 649 },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '몸 뒤로 지나가게 · 리버스 크런치와 슈퍼세트', atSec: 678 },
          { exerciseId: 'seed-reverse-crunch', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'default' }, atSec: 696 },
        ],
      },
      {
        nameKo: 'C',
        items: [
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서', atSec: 776 },
          { exerciseId: 'seed-dumbbell-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 뒤 아래쪽 반쪽 반복', atSec: 813 },
          { exerciseId: 'seed-hip-thrust', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '대안: 덤벨 스텝업', atSec: 861 },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 921 },
          { exerciseId: 'seed-seated-cable-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 뒤 늘어난 자리 반쪽 반복', atSec: 956 },
          { exerciseId: 'seed-standing-calf-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '케이블 리어 델트 플라이와 슈퍼세트 · 아래에서 멈춰 늘리기', atSec: 987 },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'default' }, atSec: 1035 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '보디빌딩 프로그램의 전신 버전 중 하루예요. 등·가슴·하체를 한 번씩 돌고 페이스 풀과 복근으로 끝내요. 영어 영상이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 몸을 가로질러 당기기 · 늘어나는 자리 크게', atSec: 3 },
          { exerciseId: 'seed-incline-press-smith', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '낮은 각도 · 실패 지점까지', atSec: 7 },
          { exerciseId: 'seed-hip-adduction-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 15 },
          { exerciseId: 'seed-leg-press', sets: 3, repsMin: 8, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '강하게 밀기', atSec: 21 },
          { exerciseId: 'seed-face-pull', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '누워서 · 당긴 자리에서 멈춤', atSec: 27 },
          { exerciseId: 'seed-cable-crunch', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 29 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '주 3회 A·B를 번갈아 하는 전신 루틴이에요. 12회 한계 무게로 한 세트를 한 뒤 짧게 쉬며 유효 반복을 채우는 방식이라 세트 수는 정해져 있지 않아요. 영어 영상이에요.',
    days: [
      {
        nameKo: 'A',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: '12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기', atSec: 119 },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: '언더핸드 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기', atSec: 180 },
          { exerciseId: 'seed-upright-row-dumbbell', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: '영상은 덤벨 하이 풀 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기', atSec: 226 },
          { exerciseId: 'seed-dumbbell-pullover', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: 'PJR 풀오버 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
          { exerciseId: 'seed-goblet-squat', sets: 3, repsMin: 20, repsMax: 20, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: '20회 한계 무게 · 유효 반복 40회', atSec: 338 },
          { exerciseId: 'seed-leg-extension', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: '선택 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기', atSec: 388 },
          { exerciseId: 'seed-romanian-deadlift', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: '12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기' },
        ],
      },
      {
        nameKo: 'B',
        items: [
          { exerciseId: 'seed-dips', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: '중량 또는 맨몸 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기', atSec: 509 },
          { exerciseId: 'seed-cable-high-row', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: '한 팔씩 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기', atSec: 557 },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: '한 팔씩 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기', atSec: 612 },
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: '12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기', atSec: 630 },
          { exerciseId: 'seed-dumbbell-reverse-lunge', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: '다리마다 · 12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기', atSec: 669 },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 12, repsMax: 12, restSec: 180, src: { sets: 'default', reps: 'video' }, noteKo: '12회 한계 무게로 1세트 → 15~30초 쉬고 실패까지를 되풀이해 유효 반복 20회 채우기', atSec: 705 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '한 주에 한 번만 운동한다면 어떻게 할지 보여 주는 전신 루틴이에요. 9종 모두 3세트 8~12회로 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '티바 로우와 슈퍼세트', atSec: 39 },
          { exerciseId: 'seed-t-bar-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '실패 지점까지', atSec: 118 },
          { exerciseId: 'seed-seated-leg-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 388 },
          { exerciseId: 'seed-pendulum-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 278 },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 · 중립·언더 그립', atSec: 146 },
          { exerciseId: 'seed-machine-lateral-raise', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 200 },
          { exerciseId: 'seed-bulgarian-split-squat-smith', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상은 스미스 · 상체 숙여 엉덩이 집중 · 실패까지', atSec: 580 },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 · 케이블 트라이셉스 익스텐션과 슈퍼세트 · 마지막 세트 스스로 보조해 실패 넘기기', atSec: 644 },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '영상 표기 케이블 트라이셉스 익스텐션', atSec: 724 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '1950년대 보디빌더의 몸을 본뜬 주 3회 전신 프로그램이에요. 월·수·금마다 두 종목씩 짝지어 번갈아 해요. 설명란에 대안 종목도 있는데 첫 번째 것만 담았어요. 영어 영상이에요.',
    days: [
      {
        nameKo: '월',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 케이블 시티드 로우와 짝 · 바벨 또는 핵', atSec: 578 },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트', atSec: 589 },
          { exerciseId: 'seed-incline-press', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 바벨 또는 덤벨 · 리버스 컬과 짝', atSec: 632 },
          { exerciseId: 'seed-reverse-barbell-curl', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트', atSec: 652 },
          { exerciseId: 'seed-romanian-deadlift', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '업라이트 로우·넥 컬과 묶음 · 또는 덤벨 벤치프레스', atSec: 691 },
          { exerciseId: 'seed-upright-row', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '또는 랫풀다운', atSec: 729 },
          { exerciseId: 'seed-lying-neck-curl', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, atSec: 754 },
          { exerciseId: 'seed-cable-curl', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '프렌치 프레스·시티드 카프 레이즈와 묶음 · 선택(체력 부족하면 생략)', atSec: 781 },
          { exerciseId: 'seed-ez-bar-overhead-triceps-extension', sets: 4, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '프렌치 프레스', atSec: 781 },
          { exerciseId: 'seed-seated-calf-raise', sets: 4, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, atSec: 786 },
        ],
      },
      {
        nameKo: '수',
        items: [
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 슈러그와 짝 · 반동 적게 · 또는 굿모닝', atSec: 822 },
          { exerciseId: 'seed-barbell-shrug', sets: 3, repsMin: 12, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 넓은 그립', atSec: 856 },
          { exerciseId: 'seed-dips', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 중량 · 스플릿 스쿼트와 짝 · 또는 클로즈 그립 벤치', atSec: 870 },
          { exerciseId: 'seed-split-squat', sets: 4, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상 말 4세트', atSec: 897 },
          { exerciseId: 'seed-chin-up', sets: 3, repsMin: 4, repsMax: 6, src: { sets: 'video', reps: 'video' }, noteKo: '중량 · 숄더 프레스·레그 컬과 묶음', atSec: 932 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '또는 페이스 풀', atSec: 951 },
          { exerciseId: 'seed-lying-leg-curl', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 985 },
          { exerciseId: 'seed-cable-curl', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '펠리컨 컬 · 푸시다운·레터럴 레이즈와 묶음 · 선택(체력 부족하면 생략)', atSec: 1005 },
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 1027 },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 1041 },
        ],
      },
      {
        nameKo: '금',
        items: [
          { exerciseId: 'seed-deadlift', sets: 3, repsMin: 3, repsMax: 5, src: { sets: 'video', reps: 'video' }, noteKo: '3회 3세트 또는 5회 3세트 · 케이블 익스텐션과 짝', atSec: 1128 },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '영상 표기 케이블 트라이셉스 익스텐션 · 또는 케이블 드래그 컬', atSec: 1140 },
          { exerciseId: 'seed-overhead-press', sets: 3, repsMin: 6, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 덤벨 풀오버와 짝 · 또는 비하인드 넥 프레스', atSec: 1150 },
          { exerciseId: 'seed-dumbbell-pullover', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 깊게 내리기', atSec: 1173 },
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '체스트 플라이·해머 컬과 묶음', atSec: 1207 },
          { exerciseId: 'seed-dumbbell-fly', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '또는 길로틴 프레스', atSec: 1215 },
          { exerciseId: 'seed-hammer-curl', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, atSec: 1263 },
          { exerciseId: 'seed-pull-up', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '넓은 그립 · 하이퍼익스텐션·카프 레이즈와 묶음 · 중량 없이 · 썸리스·두꺼운 그립 · 선택(체력 부족하면 생략)', atSec: 1275 },
          { exerciseId: 'seed-hyperextension', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, atSec: 1303 },
          { exerciseId: 'seed-standing-calf-raise', sets: 4, repsMin: 12, repsMax: 20, src: { sets: 'video', reps: 'video' }, atSec: 1311 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '헬스장이 처음인 사람을 위해 상체 날에 쓸 머신 세 가지의 사용법을 알려 주는 영상이에요. 세트·횟수는 설명란에 없어 기본값으로 채웠어요.',
    days: [
      {
        nameKo: '상체',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '어깨보다 살짝 넓게 · 팔꿈치를 바닥 쪽으로', atSec: 30 },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '손잡이는 턱 높이 · 팔꿈치는 손목 아래', atSec: 154 },
          { exerciseId: 'seed-chest-press-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '내릴 때 팔꿈치 90도 넓이 · 천천히', atSec: 280 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '오래 앉아 일하는 사람을 위한 상체 날이에요. 당기기로 시작해 가슴·어깨를 밀고 페이스 풀로 마무리해요. 헬스 초보자도 따라 할 수 있게 자세를 설명해요.',
    days: [
      {
        nameKo: '상체',
        items: [
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 12, repsMax: 15, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '인클라인 벤치에 엎드려 · 벤치 30~45도 · 팔꿈치를 골반 쪽으로', atSec: 135 },
          { exerciseId: 'seed-dumbbell-bench-press', sets: 3, repsMin: 10, repsMax: 12, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '천천히 내리기 · 튕기지 않기', atSec: 192 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 10, repsMax: 12, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '허리 꺾지 않기', atSec: 243 },
          { exerciseId: 'seed-face-pull', sets: 3, repsMin: 15, repsMax: 20, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '가벼운 무게 · 반동 없이', atSec: 284 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '초보자도 따라 할 수 있다고 밝힌 상·하체 스트렝스 루틴의 첫날이에요. 준비 운동 뒤 행 클린+오버헤드 프레스, 스쿼트, 벤치프레스, 핵 스쿼트 순으로 해요. 행 클린+프레스는 5회 이하로 2~3회 남기고 3세트, 세트 사이 2~3분 쉬고 스쿼트·벤치도 같은 원칙을 따르라고 해요.',
    days: [
      {
        nameKo: '1일차',
        items: [
          { exerciseId: 'seed-hang-clean', sets: 3, repsMin: 3, repsMax: 5, restSec: 150, src: { sets: 'video', reps: 'video' }, noteKo: '서브 · 오버헤드 프레스와 이어서 · 5회 이하 · 2~3회 남기기', atSec: 560 },
          { exerciseId: 'seed-overhead-press', sets: 3, repsMin: 3, repsMax: 5, restSec: 150, src: { sets: 'video', reps: 'video' }, noteKo: '서브 · 행 클린에 이어 · 2~3회 남기기', atSec: 560 },
          { exerciseId: 'seed-barbell-squat', sets: 3, repsMin: 3, repsMax: 5, restSec: 150, src: { sets: 'default', reps: 'default' }, noteKo: '메인 · 2~3회 남기기 · 워밍업은 가벼운 무게로', atSec: 883 },
          { exerciseId: 'seed-barbell-bench-press', sets: 3, repsMin: 3, repsMax: 5, restSec: 150, src: { sets: 'default', reps: 'default' }, noteKo: '메인 · 2~3회 남기기', atSec: 1335 },
          { exerciseId: 'seed-hack-squat', sets: 3, repsMin: 6, repsMax: 8, src: { sets: 'default', reps: 'video' }, noteKo: '서브 · 3회 남기기 · 무겁지 않게', atSec: 1568 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '초보자에게 권하는 주 3회 전신 루틴이에요. 하루걸러 3주 동안 하고, 큰 종목은 5회 5세트, 작은 종목은 10회 3세트예요. 쉬는 시간은 큰 종목 90초·작은 종목 60초예요. 영어 영상이에요.',
    days: [
      {
        nameKo: '1일',
        items: [
          { exerciseId: 'seed-barbell-squat', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '5번째 회에 거의 실패', atSec: 196 },
          { exerciseId: 'seed-barbell-row', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '벤트오버 · 5번째 회에 거의 실패', atSec: 196 },
          { exerciseId: 'seed-barbell-bench-press', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '5번째 회에 거의 실패', atSec: 196 },
          { exerciseId: 'seed-push-press', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '5번째 회에 거의 실패', atSec: 196 },
          { exerciseId: 'seed-triceps-pushdown', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '로프' },
          { exerciseId: 'seed-side-lateral-raise', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-seated-calf-raise', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' } },
        ],
      },
      {
        nameKo: '2일',
        items: [
          { exerciseId: 'seed-deadlift', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '5번째 회에 거의 실패', atSec: 196 },
          { exerciseId: 'seed-pull-up', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '필요하면 중량 · 5번째 회에 거의 실패', atSec: 196 },
          { exerciseId: 'seed-incline-press', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '5번째 회에 거의 실패', atSec: 196 },
          { exerciseId: 'seed-overhead-press', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '5번째 회에 거의 실패', atSec: 196 },
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '숙여서' },
          { exerciseId: 'seed-standing-calf-raise', sets: 3, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' } },
        ],
      },
      {
        nameKo: '3일',
        items: [
          { exerciseId: 'seed-front-squat', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '5번째 회에 거의 실패', atSec: 196 },
          { exerciseId: 'seed-pendlay-row', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '5번째 회에 거의 실패', atSec: 196 },
          { exerciseId: 'seed-dips', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '필요하면 중량 · 5번째 회에 거의 실패', atSec: 196 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 5, repsMin: 5, repsMax: 5, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 · 5번째 회에 거의 실패', atSec: 196 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '초보자를 위한 전신 운동 A·B 중 A예요. 스쿼트·밀기·당기기·한 다리·복근을 한 번씩 해서 기본 움직임을 익히고, A·B를 각각 주 2회 해요. 세트·횟수는 영상에서 말하지 않아 기본값으로 채웠어요. 영어 영상이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-dumbbell-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '드롭 스쿼트(빠르게 앉았다 일어나기)', atSec: 24 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '한 팔씩 · 손목·팔꿈치·어깨 일직선', atSec: 39 },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, atSec: 57 },
          { exerciseId: 'seed-bodyweight-split-squat', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '다리마다 · 덤벨 또는 맨몸', atSec: 74 },
          { exerciseId: 'seed-sit-up', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '롤업 · 천천히 내려가기', atSec: 87 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '헬스 초보자가 등 운동을 할 때 꼭 해 볼 네 가지예요. 위에서 당기기와 엎드려 당기기 뒤에 한 팔 하이 로우, 팔 펴고 당기기로 마무리해요. 1시간 안에 끝나고 주 2회 하라고 해요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 12, repsMax: 15, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '어깨보다 한 뼘 넓게 · 반동 없이', atSec: 109 },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 4, repsMin: 10, repsMax: 12, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '인클라인 벤치에 엎드려 · 30~45도 · 천천히 내리기', atSec: 203 },
          { exerciseId: 'seed-cable-high-row', sets: 3, repsMin: 12, repsMax: 15, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 · 앉아서 · 반대손으로 몸 고정', atSec: 290 },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 3, repsMin: 15, repsMax: 20, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '팔꿈치 각도 고정', atSec: 355 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '초보자를 위한 팔 운동이에요. 삼두와 이두를 번갈아 두 가지씩, 모두 3세트로 해요. 주 2~3회 하며 조금씩 무게를 늘리라고 해요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-bench-dip', sets: 3, repsMin: 12, repsMax: 15, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '팔꿈치 90도까지만 · 위에서 다 펴지 않기', atSec: 107 },
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '반동 없이 · 천천히 내리기', atSec: 167 },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '팔꿈치 모으고 머리 뒤로 늘리기', atSec: 221 },
          { exerciseId: 'seed-incline-dumbbell-curl', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '벤치 45~60도 · 끝까지 펴며 천천히', atSec: 269 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '벤치프레스로 시작해 머신 숄더 프레스, 펙 덱, 측면 어깨를 거쳐 삼두 두 가지로 끝내는 근비대용 푸시데이예요. 영어 영상이에요.',
    days: [
      {
        nameKo: '푸시',
        items: [
          { exerciseId: 'seed-barbell-bench-press', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '가슴에서 멈췄다가 밀기 · 아치 작게', atSec: 0 },
          { exerciseId: 'seed-shoulder-press-machine', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 실패 지점까지', atSec: 15 },
          { exerciseId: 'seed-pec-deck-fly', sets: 3, repsMin: 15, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '마지막 세트 뒤 늘어난 자리 부분 반복 4~5회 · 최대한 깊게', atSec: 22 },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '높은 도르래 · 몸에서 밀어 내듯', atSec: 31 },
          { exerciseId: 'seed-cable-overhead-extension', sets: 3, repsMin: 5, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '무겁게', atSec: 39 },
          { exerciseId: 'seed-triceps-kickback-cable', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '가볍게', atSec: 48 },
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '전면·측면·후면에 한 가지씩, 세 종목만으로 어깨를 채우는 루틴이에요. 영상은 이 세 종목을 한 주의 여러 날에 나눠 넣기를 권해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서 · 등받이를 1~2칸 뒤로 · 주 1회 · 팔꿈치 살짝 안으로', atSec: 416 },
          { exerciseId: 'seed-cable-lateral-raise', sets: 3, repsMin: 10, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 케이블이 몸 뒤로 지나가게 · 주 2~3회 · 도르래 2~3칸 위 · 15~20회 되면 무게 올리기', atSec: 110 },
          { exerciseId: 'seed-cable-rear-delt-fly', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '팔 45도 · 주 1~2회 · 몇 걸음 물러서기 · 날개뼈 모으지 않기', atSec: 277 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '오버헤드 프레스를 10회 10세트 하는 저먼 볼륨 트레이닝 어깨 날이에요. 이어서 측면·후면을 슈퍼세트로, 마지막에 덤벨 프레스 20회로 끝내요. 영어 영상이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-overhead-press', sets: 10, repsMin: 10, repsMax: 10, restSec: 60, src: { sets: 'video', reps: 'video' }, noteKo: '앉아서 · 랙 안에서 바로 밀기', atSec: 7 },
          { exerciseId: 'seed-side-lateral-raise', sets: 4, repsMin: 12, repsMax: 12, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '리어 델트 플라이와 슈퍼세트 · 쉬는 시간 90~120초 · 앉아서', atSec: 25 },
          { exerciseId: 'seed-rear-delt-fly', sets: 4, repsMin: 12, repsMax: 12, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '숙여서', atSec: 31 },
          { exerciseId: 'seed-dumbbell-shoulder-press', sets: 3, repsMin: 20, repsMax: 20, restSec: 80, src: { sets: 'video', reps: 'video' }, noteKo: '번갈아 · 앉아서 · 팔마다 20회', atSec: 40 },
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
    scriptCheckedAt: '2026-11-10',
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '회전근 준비 운동 뒤 위쪽·가운데·아래쪽 가슴을 차례로 하는 가슴 날이에요. 세트마다 실패한 뒤 부분 반복이나 내리기만 하는 반복을 더해요. 영상은 한 주에 두 번째 가슴 날도 따로 다뤄요. 영어 영상이에요.',
    days: [
      {
        nameKo: '가슴',
        items: [
          { exerciseId: 'seed-band-external-rotation', sets: 2, repsMin: 10, repsMax: 15, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '준비 운동 1~2세트 · 가볍게 · 휴식 90초 이하', atSec: 267 },
          { exerciseId: 'seed-incline-press-dumbbell', sets: 3, repsMin: 5, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '실패까지 · 30도 낮게 · 엄지가 위로 향하게', atSec: 288 },
          { exerciseId: 'seed-cable-crossover', sets: 3, repsMin: 10, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '실패 뒤 부분 반복 · 몸을 뒤로 기울여', atSec: 386 },
          { exerciseId: 'seed-dumbbell-floor-fly', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '2~3세트 · 실패 뒤 내리기만 반복 · 팔꿈치 접어 밀어 올린 뒤', atSec: 511 },
          { exerciseId: 'seed-deficit-push-up', sets: 1, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '1.5회 반복 · 아래에서 1초씩 늘려 버티기 · 실패까지', atSec: 588 },
          { exerciseId: 'seed-dips', sets: 1, repsMin: 10, repsMax: 15, src: { sets: 'default', reps: 'default' }, noteKo: '실패까지 · 이어서 부분 반복 · 어깨를 내린 채로', atSec: 607 },
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
          { exerciseId: 'seed-machine-lat-pulldown', sets: 4, repsMin: 8, repsMax: 10, restSec: 90, src: { sets: 'video', reps: 'video' }, noteKo: '영상 표기 머신 풀업 · 손바닥이 마주 보게 · 영상은 이어서 넓은 그립 머신 풀업 4세트도 해요' },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '등의 너비를 노리는 5종이에요. 케이블 풀오버로 광배를 먼저 깨우고, 한 팔 로우와 넓은 그립 풀다운, 인클라인 로우를 거쳐 드롭세트 로우로 끝내요. 영어 영상이에요.',
    days: [
      {
        nameKo: '등',
        items: [
          { exerciseId: 'seed-straight-arm-pulldown', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '영상 표기 케이블 풀오버 · 서서 거의 곧게 · 실패까지', atSec: 110 },
          { exerciseId: 'seed-landmine-row', sets: 4, repsMin: 8, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '한 팔씩 · 15·10·8·8회 · 늘어난 자리 위주', atSec: 288 },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '넓은 그립 · 영상은 이어서 V바 풀다운 3세트(10·8·8회)도 해요 · 어깨 내린 채로', atSec: 429 },
          { exerciseId: 'seed-chest-supported-row-dumbbell', sets: 4, repsMin: 15, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '인클라인 · 팔꿈치 높게', atSec: 655 },
          { exerciseId: 'seed-barbell-row', sets: 2, repsMin: 6, repsMax: 6, src: { sets: 'video', reps: 'default' }, noteKo: '6회 뒤 두 번 무게를 내려 이어 가는 드롭세트 · 무겁게 올려 가며', atSec: 859 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '대퇴·햄스트링·엉덩이·종아리를 고반복으로 채우는 하체 날이에요. 대부분 4세트 20회이고, 종아리는 세 방향으로 50회씩 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-leg-press', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '발 모으고 3/4만 · 대안 묶음: 레그 익스텐션 4×20 + 핵 스쿼트 드롭세트', atSec: 571 },
          { exerciseId: 'seed-split-squat', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '다리마다 · 3/4만 · 레그 프레스 뒤 바로 · 앞발은 몸 가운데', atSec: 571 },
          { exerciseId: 'seed-stiff-leg-deadlift', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '3/4만 올라오기', atSec: 604 },
          { exerciseId: 'seed-seated-leg-curl', sets: 4, repsMin: 30, repsMax: 30, src: { sets: 'video', reps: 'video' }, noteKo: '발끝 펴서 시작 · 지치면 발끝 당겨 이어 가기', atSec: 612 },
          { exerciseId: 'seed-sumo-deadlift', sets: 3, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' } },
          { exerciseId: 'seed-step-up', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '다리마다 · 앞으로 기울여 · 내릴 때 손잡이 잡고 늘리기', atSec: 620 },
          { exerciseId: 'seed-seated-calf-raise', sets: 3, repsMin: 50, repsMax: 50, src: { sets: 'video', reps: 'video' }, noteKo: '발 방향 세 가지로 50회씩', atSec: 628 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '루마니안 데드리프트로 시작해 레그 컬, 불가리안 스플릿 스쿼트, 레그 프레스를 하고 측면 어깨로 끝내는 하체 날이에요. 워밍업 세트로 자세를 맞춘 뒤 종목마다 워킹 세트 1~2개를 아주 힘들게 해요. 상하체 분할로 72시간 뒤 다시 하체를 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-romanian-deadlift', sets: 1, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '마지막 탑세트 · 워밍업 세트로 자세 맞춘 뒤 1세트', atSec: 698 },
          { exerciseId: 'seed-lying-leg-curl', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '마지막 탑세트', atSec: 1568 },
          { exerciseId: 'seed-bulgarian-split-squat', sets: 1, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '다리마다 · 마지막 탑세트', atSec: 879 },
          { exerciseId: 'seed-leg-press', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'video' }, noteKo: '마지막 탑세트 · 1세트 12회 → 같은 무게 8~10회 · 발 전체로 밀기', atSec: 1471 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '삼두와 이두를 한 종목씩 번갈아 하는 팔 루틴이에요. 삼두는 3세트, 이두는 2세트로 6~10회를 하고, 세션이 갈수록 횟수를 조금씩 올려요. 팔은 일주일에 최소 두 번 하라고 해요. 영어 영상이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-smith-close-grip-bench-press', sets: 3, repsMin: 6, repsMax: 8, restSec: 120, src: { sets: 'video', reps: 'video' }, noteKo: '팔꿈치 몸쪽 · 마지막 세트 10kg 줄여 8회', atSec: 216 },
          { exerciseId: 'seed-preacher-curl-dumbbell', sets: 2, repsMin: 6, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 · 약한 팔 먼저 · 1회 남기고', atSec: 532 },
          { exerciseId: 'seed-cable-cross-triceps-extension', sets: 3, repsMin: 8, repsMax: 8, src: { sets: 'video', reps: 'video' }, noteKo: '살짝 숙여 늘이기 · 세트 모두 같은 무게', atSec: 935 },
          { exerciseId: 'seed-chin-up', sets: 2, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '중량 · 이두 위주 · 마지막 세트 중량 빼고 실패 근처까지', atSec: 1150 },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 3, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '한 팔씩 · 약한 팔 먼저 · 마지막 세트 무게 줄이기', atSec: 1320 },
          { exerciseId: 'seed-cable-hammer-curl', sets: 2, repsMin: 8, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '로프 · 아주 힘들게 2세트', atSec: 1563 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '삼두와 이두를 슈퍼세트 네 쌍으로 묶어 4세트 20회 이상씩 하는 팔 루틴이에요. 모든 세트를 실패까지 하고, 20회를 넘겨도 멈추지 말라고 해요. 팔은 따로 하루를 잡고 쉬는 시간은 짧게 가져가요. 영어 영상이에요.',
    days: [
      {
        nameKo: '팔',
        items: [
          { exerciseId: 'seed-triceps-pushdown', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '로프 · 로프 컬과 슈퍼세트 · 20회 넘어도 실패까지', atSec: 161 },
          { exerciseId: 'seed-cable-hammer-curl', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '로프 컬 · 실패까지', atSec: 161 },
          { exerciseId: 'seed-ez-bar-skull-crusher', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '드래그 컬과 슈퍼세트 · 실패까지', atSec: 170 },
          { exerciseId: 'seed-drag-curl', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: 'EZ바 · 넓은 그립 · 천천히 · 실패까지', atSec: 170 },
          { exerciseId: 'seed-overhead-triceps-extension', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '덤벨 프렌치 프레스 · 해머 컬과 슈퍼세트 · 실패까지', atSec: 181 },
          { exerciseId: 'seed-hammer-curl', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '실패까지', atSec: 181 },
          { exerciseId: 'seed-incline-dumbbell-curl', sets: 4, repsMin: 20, repsMax: 20, src: { sets: 'video', reps: 'video' }, noteKo: '트라이셉스 푸시업과 슈퍼세트 · 실패까지', atSec: 181 },
          { exerciseId: 'seed-diamond-push-up', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'default' }, noteKo: '영상 표기 트라이셉스 푸시업 · 실패까지', atSec: 190 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '시즌 중 파트너와 함께 하는 등·이두 날이에요. 풀다운과 머신 로우 세 가지로 등을 채우고, 컬 세 가지로 이두를 마무리해요. 세트·횟수는 설명란에 없어 기본값으로 채웠어요.',
    days: [
      {
        nameKo: '등·이두',
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 4, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '흉추 돌려 끝까지 늘리기 · 마지막 드롭세트', atSec: 19 },
          { exerciseId: 'seed-high-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'default' }, noteKo: '가슴을 패드에 밀며 끝까지 늘리기', atSec: 424 },
          { exerciseId: 'seed-machine-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '미드 로우 · 한 팔씩', atSec: 629 },
          { exerciseId: 'seed-seated-cable-row', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' } },
          { exerciseId: 'seed-straight-arm-pulldown', sets: 3, repsMin: 12, repsMax: 15, src: { sets: 'default', reps: 'default' }, atSec: 635 },
          { exerciseId: 'seed-dumbbell-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '끝까지 늘리고 수축은 빠르게 · 어깨 고정', atSec: 2909 },
          { exerciseId: 'seed-barbell-curl', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'default', reps: 'default' }, noteKo: '팔꿈치 앞으로 나가지 않게', atSec: 3260 },
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
    scriptCheckedAt: '2026-11-10',
    summaryKo: '풀업으로 시작해 바벨 로우, 언더그립 풀다운, 후면 어깨 로우, 바벨 컬, 페이스 풀로 끝내는 풀데이예요. 영어 영상이에요.',
    days: [
      {
        nameKo: '풀',
        items: [
          { exerciseId: 'seed-pull-up', sets: 3, repsMin: 6, repsMax: 10, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 대안: 무릎 꿇고 랫풀다운 10~15회', atSec: 89 },
          { exerciseId: 'seed-barbell-row', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 약 45도 숙이고 팔꿈치 45도로 윗배까지', atSec: 217 },
          { exerciseId: 'seed-lat-pulldown', sets: 3, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 좁은 언더그립 · 살짝 뒤로 · 팔꿈치 옆구리', atSec: 254 },
          { exerciseId: 'seed-dumbbell-rear-delt-row', sets: 3, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '3~4세트 · 가슴 지지 · 넓게 잡고 팔꿈치 벌리기', atSec: 332 },
          { exerciseId: 'seed-barbell-curl', sets: 2, repsMin: 8, repsMax: 12, src: { sets: 'video', reps: 'video' }, noteKo: '2~3세트 · 좁은 그립 · 새끼손가락으로 들기', atSec: 414 },
          { exerciseId: 'seed-face-pull', sets: 4, repsMin: 10, repsMax: 15, src: { sets: 'video', reps: 'video' }, noteKo: '앞 2세트 무릎 꿇고 바깥 회전 · 뒤 2세트 누워서', atSec: 465 },
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
