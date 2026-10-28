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

const D = (sets: number, repsMin: number, repsMax: number): Pick<CreatorRoutineItem, 'sets' | 'repsMin' | 'repsMax' | 'src'> => ({
  sets,
  repsMin,
  repsMax,
  src: { sets: 'default', reps: 'default' },
});

// 아래 내용은 설명란(공식 Data API)·영상 확인 전의 자리 잡기다 — draft 를 걷기 전에 영상과 대조해 고친다.
export const CREATOR_ROUTINES: CreatorRoutine[] = [
  {
    id: 'cr-shoulders-minimal',
    topicId: 'boulder-shoulders',
    labelKo: '어깨 미니멀',
    source: {
      videoId: 'bZbfXY0-BhA',
      title: '최소한의 운동으로 진짜 어깨깡패 되는 어깨 루틴 요령!',
      channel: '제로범TV _김영범',
      channelUrl: 'https://www.youtube.com/@boom__star',
      verifiedAt: '2026-10-28',
    },
    summaryKo: '적은 종목으로 전면·측면·후면 삼각근을 고르게 다루는 구성이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-dumbbell-shoulder-press', ...D(4, 8, 12) },
          { exerciseId: 'seed-side-lateral-raise', ...D(4, 12, 15) },
          { exerciseId: 'seed-rear-delt-fly', ...D(4, 12, 15) },
        ],
      },
    ],
    draft: true,
  },
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
    summaryKo: '프레스 두 가지로 시작해 측면·후면을 거쳐 승모근으로 마무리하는 시즌 중 어깨 운동이에요.',
    days: [
      {
        nameKo: '어깨·승모',
        items: [
          { exerciseId: 'seed-shoulder-press-smith', ...D(4, 8, 12) },
          { exerciseId: 'seed-shoulder-press-machine', ...D(3, 10, 12) },
          { exerciseId: 'seed-side-lateral-raise', ...D(4, 12, 15) },
          { exerciseId: 'seed-reverse-pec-deck', ...D(3, 12, 15) },
          { exerciseId: 'seed-barbell-shrug', ...D(3, 10, 12) },
          { exerciseId: 'seed-dumbbell-shrug', ...D(3, 12, 15) },
        ],
      },
    ],
    draft: true,
  },
  {
    id: 'cr-shoulders-growth',
    topicId: 'boulder-shoulders',
    labelKo: '어깨 성장',
    source: {
      videoId: 'd2r9nVh-yx4',
      title: '솔직히 어깨는 이 운동루틴 하고부터 커졌어요',
      channel: '준규빌더',
      channelUrl: 'https://www.youtube.com/@junkyubd',
      verifiedAt: '2026-10-28',
    },
    summaryKo: '측면 삼각근 비중을 높인 어깨 루틴이에요.',
    days: [
      {
        nameKo: '어깨',
        items: [
          { exerciseId: 'seed-overhead-press', ...D(4, 6, 10) },
          { exerciseId: 'seed-side-lateral-raise', ...D(5, 12, 15) },
          { exerciseId: 'seed-cable-lateral-raise', ...D(3, 12, 15) },
          { exerciseId: 'seed-reverse-pec-deck', ...D(4, 12, 15) },
        ],
      },
    ],
    draft: true,
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
    summaryKo: '세 종목을 5세트 5회로 꾸준히 올리는 근력 프로그램이에요.',
    days: [
      {
        nameKo: 'A',
        items: [
          { exerciseId: 'seed-barbell-squat', ...D(5, 5, 5) },
          { exerciseId: 'seed-barbell-bench-press', ...D(5, 5, 5) },
          { exerciseId: 'seed-barbell-row', ...D(5, 5, 5) },
        ],
      },
      {
        nameKo: 'B',
        items: [
          { exerciseId: 'seed-barbell-squat', ...D(5, 5, 5) },
          { exerciseId: 'seed-overhead-press', ...D(5, 5, 5) },
          { exerciseId: 'seed-deadlift', ...D(1, 5, 5) },
        ],
      },
    ],
    draft: true,
  },
  {
    id: 'cr-big3-powerbuilding',
    topicId: 'big3-500',
    labelKo: '파워빌딩',
    source: {
      videoId: 'CgiGNRGA7aQ',
      title: '3대 500이 어려운 분들을 위한 필수 영상 | 파워빌딩 이렇게만 하세요',
      channel: '캐나디안 보디빌더 조피터',
      channelUrl: 'https://www.youtube.com/@peterfit_',
      verifiedAt: '2026-10-28',
    },
    summaryKo: '무거운 3대 운동 뒤에 보조 운동으로 근육량도 챙기는 파워빌딩 구성이에요.',
    days: [
      {
        nameKo: '하체',
        items: [
          { exerciseId: 'seed-barbell-squat', ...D(4, 3, 5) },
          { exerciseId: 'seed-leg-press', ...D(3, 8, 12) },
          { exerciseId: 'seed-lying-leg-curl', ...D(3, 10, 12) },
        ],
      },
      {
        nameKo: '상체',
        items: [
          { exerciseId: 'seed-barbell-bench-press', ...D(4, 3, 5) },
          { exerciseId: 'seed-dumbbell-bench-press', ...D(3, 8, 12) },
          { exerciseId: 'seed-lat-pulldown', ...D(3, 8, 12) },
        ],
      },
      {
        nameKo: '데드',
        items: [
          { exerciseId: 'seed-deadlift', ...D(4, 3, 5) },
          { exerciseId: 'seed-barbell-row', ...D(3, 8, 10) },
          { exerciseId: 'seed-romanian-deadlift', ...D(3, 8, 10) },
        ],
      },
    ],
    draft: true,
  },
  {
    id: 'cr-afterwork-six',
    topicId: 'after-work',
    labelKo: '퇴근 후 전신 6종',
    source: {
      videoId: '92SXBcTzoco',
      title: '퇴근 후 헬스장 가면 이 전신루틴 6가지만 하세요｜직장인 초보 운동',
      channel: '제로범TV _김영범',
      channelUrl: 'https://www.youtube.com/@boom__star',
      verifiedAt: '2026-10-28',
    },
    summaryKo: '기구 위주 6가지로 전신을 한 번에 다루는 초보용 구성이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-leg-press', ...D(3, 10, 12) },
          { exerciseId: 'seed-chest-press-machine', ...D(3, 10, 12) },
          { exerciseId: 'seed-lat-pulldown', ...D(3, 10, 12) },
          { exerciseId: 'seed-shoulder-press-machine', ...D(3, 10, 12) },
          { exerciseId: 'seed-seated-cable-row', ...D(3, 10, 12) },
          { exerciseId: 'seed-plank', ...D(3, 1, 1) },
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
    summaryKo: '자주 못 가는 주에 큰 근육부터 차례로 다루는 무분할 전신 구성이에요.',
    days: [
      {
        nameKo: '전신',
        items: [
          { exerciseId: 'seed-barbell-squat', ...D(3, 8, 12) },
          { exerciseId: 'seed-romanian-deadlift', ...D(3, 8, 12) },
          { exerciseId: 'seed-barbell-bench-press', ...D(3, 8, 12) },
          { exerciseId: 'seed-lat-pulldown', ...D(3, 8, 12) },
          { exerciseId: 'seed-dumbbell-shoulder-press', ...D(3, 10, 12) },
          { exerciseId: 'seed-seated-cable-row', ...D(3, 10, 12) },
        ],
      },
    ],
    draft: true,
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
