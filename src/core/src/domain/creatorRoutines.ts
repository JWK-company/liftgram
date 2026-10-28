// 크리에이터 루틴 — 주제(어깨깡패·3대 500·퇴근 후)별로 한국 운동 유튜버·보디빌더의 영상 루틴을 정리한 정적 데이터. @plm SRS-091 SRS-092
//
// 규칙(ADR-045 · spec 20261028_creator-routines rev1):
//   · 출처(source)의 title·channel 은 공식 oEmbed 값 그대로 — 점검: node scripts/check-creator-routines.mjs
//   · 루틴(종목·세트·횟수)은 사실 정보만, 사람이 영상을 보고 확인한 칸은 src 'video', 아니면 'default'(화면에 「기본값」)
//   · 대본·설명란 원문·썸네일은 넣지 않는다. summaryKo·labelKo 는 우리 말로 — 채널명(실명)을 넣지 않는다(공유 시 이름만 퍼짐 · qa H-2)
//   · 균일하지 않은 처방(피라미드·탑셋)은 근삿값 + reps 'default' + noteKo 로 원래 방식을 적는다 · 하루 안 같은 종목 두 번 금지
//   · draft: true = 아직 사람 검수 전 — 화면에 내지 않는다(check 스크립트도 실패로 본다)
//   · 영상이 삭제·비공개면 hidden: true
// 옛 AI 콘셉트 루틴(conceptRoutines.ts)은 사용자 결정(2026-10-28)으로 화면에서 뺐다 — 데이터는 원복용 보존.

export type CreatorTopicId = 'boulder-shoulders' | 'big3-500' | 'after-work';

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
    /** 사람이 영상과 대조한 날짜(YYYY-MM-DD) — 30일 지나면 check 가 경고 */
    verifiedAt: string;
  };
  /** 세트·횟수의 근거가 설명란이 아니라 영상을 분석한 2차 자료일 때(예: 기사) — 화면에 따로 밝힌다 */
  basis?: { labelKo: string; url: string };
  summaryKo: string;
  days: CreatorRoutineDay[];
  draft?: true;
  hidden?: true;
}

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

// biome-ignore lint/correctness/noUnusedVariables: 자리 잡기 도우미(새 버전 초안용)
const D = (sets: number, repsMin: number, repsMax: number): Pick<CreatorRoutineItem, 'sets' | 'repsMin' | 'repsMax' | 'src'> => ({
  sets,
  repsMin,
  repsMax,
  src: { sets: 'default', reps: 'default' },
});

// 내용 근거 = 공식 Data API 로 읽은 설명란(타임스탬프·요약) — 2026-10-28. 종목 순서는 설명란 그대로, 수치는 설명란에 있을 때만 'video'.
// 설명란 원문은 보관하지 않는다(qa H-3). 영상만 보고 확인한 값은 없다 — 검수자가 영상을 보고 고치면 src 를 'video' 로.
export const CREATOR_ROUTINES: CreatorRoutine[] = [
  {
    id: 'cr-shoulders-season',
    topicId: 'boulder-shoulders',
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
    topicId: 'boulder-shoulders',
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
    topicId: 'boulder-shoulders',
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
  return `출처: ${r.source.channel} 「${r.source.title}」 ${youtubeWatchUrl(r.source.videoId)}`;
}
