// 운동 팁 — 스트레칭·워밍업·자세 교정·부상 예방·회복 팁을 유튜브 영상 출처와 함께 모은 정적 데이터(SPEC-047 · SRS-112).
//
// 규칙(크리에이터 루틴과 같다 — ADR-045 · SRS-092):
//   · 출처(source)의 title·channel 은 공식 oEmbed 값 그대로 — 점검: node scripts/check-creator-routines.mjs
//   · 요점(pointsKo)·주의(cautionKo)·챕터 이름은 출처(공식 Data API 설명란·챕터, 또는 basis 로 밝힌 분석 자료)에 적힌 것만 우리 말로.
//     영상 본편·자막·음성은 수집·받아쓰기하지 않는다. 설명란에 요점이 없는 영상은 싣지 않는다.
//   · 제목·요점에 채널명·실명을 넣지 않는다(출처 줄에만). 단정·보장·의료 표현 금지(wellness 게이트).
//   · draft: true = 사람 검수 전(화면 미노출) · 영상이 삭제·비공개면 hidden: true
import { creatorChannelLabel, youtubeWatchUrl } from './creatorRoutines';
import type { MuscleGroup } from './types';

export type TipTopicId = 'stretch' | 'warmup' | 'form' | 'injury' | 'recovery';

export interface TipTopic {
  id: TipTopicId;
  nameKo: string;
  nameEn: string;
  blurbKo: string;
  blurbEn: string;
}

/** 언제 보면 좋은 팁인가 — 루틴 미리보기의 「시작 전」 한 줄은 before 만 */
export type TipMoment = 'before' | 'after' | 'anytime';

export interface TipPoint {
  text: string;
  from: 'desc' | 'chapter' | 'basis';
}

export interface TipChapter {
  /** 영상 시작부터 초 — 설명란 챕터의 시각 */
  sec: number;
  /** 챕터 이름을 우리 말로 */
  labelKo: string;
}

export interface CreatorTip {
  id: string;
  topicId: TipTopicId;
  /** 우리가 붙인 제목(채널명·실명 금지) */
  titleKo: string;
  /** 요점 2~5줄 — 출처에 적힌 것만 · 줄마다 근거(desc 설명란 본문 · chapter 설명란 챕터 · basis 분석 자료) */
  pointsKo: TipPoint[];
  /** 출처에 적힌 주의(있을 때만) */
  cautionKo?: string;
  /** 관련 부위 ≥1 — 종목 상세·시작 전 팁 고르기에 쓴다 · 'other' 금지 · 'fullBody' = 어느 운동에나 맞는 일반 팁 */
  muscles: MuscleGroup[];
  /** 관련 종목(활성 시드 id) — 종목 상세에서 맨 앞에 */
  exerciseIds?: string[];
  moment: TipMoment;
  chapters?: TipChapter[];
  source: {
    videoId: string;
    title: string;
    channel: string;
    channelUrl: string;
    /** 설명란·기사와 대조한 날짜(YYYY-MM-DD) */
    verifiedAt: string;
  };
  basis?: { labelKo: string; url: string };
  draft?: true;
  hidden?: true;
}

const TIP_BLURB_EN = 'Tips summarized from fitness videos — open the original video for details (tips in Korean).';
export const TIP_TOPICS: TipTopic[] = [
  { id: 'stretch', nameKo: '스트레칭·가동성', nameEn: 'Stretching & mobility', blurbKo: '굳은 관절과 근육을 푸는 스트레칭·가동성 팁을 영상에서 모았어요.', blurbEn: TIP_BLURB_EN },
  { id: 'warmup', nameKo: '운동 전 워밍업', nameEn: 'Warm-up', blurbKo: '본 운동 전에 몸을 데우는 워밍업 방법을 영상에서 모았어요.', blurbEn: TIP_BLURB_EN },
  { id: 'form', nameKo: '자세 바로잡기', nameEn: 'Form', blurbKo: '자주 틀리는 운동 자세를 바로잡는 팁을 영상에서 모았어요.', blurbEn: TIP_BLURB_EN },
  { id: 'injury', nameKo: '다치지 않게', nameEn: 'Injury prevention', blurbKo: '어깨·허리·무릎처럼 다치기 쉬운 곳을 지키는 팁을 영상에서 모았어요.', blurbEn: TIP_BLURB_EN },
  { id: 'recovery', nameKo: '회복·휴식', nameEn: 'Recovery & rest', blurbKo: '운동 뒤 정리 운동, 쉬는 시간, 잠처럼 회복에 관한 팁을 영상에서 모았어요.', blurbEn: TIP_BLURB_EN },
];

export const CREATOR_TIPS: CreatorTip[] = [
  {
    id: 'tip-neck-strength',
    topicId: 'injury',
    titleKo: '목 근육도 따로 단련하기 — 3단계',
    pointsKo: [
      { text: '승모근 운동과 별개로, 머리를 받치는 목 근육도 따로 단련하자고 해요.', from: 'desc' },
      { text: '1단계 버티기(등척성) → 2단계 넥컬·넥 익스텐션 → 3단계 옆으로 기울이기·돌리기 순서예요.', from: 'chapter' },
      { text: '무거운 무게보다 낮은 강도에서 시작해 조금씩 올리는 게 핵심이에요.', from: 'desc' },
    ],
    cautionKo: '목디스크 같은 목 질환이 있거나 통증·저림·어지럼이 있으면 따라 하지 말고 전문가에게 먼저 확인받으라고 안내해요.',
    muscles: ['traps'],
    moment: 'anytime',
    chapters: [
      { sec: 0, labelKo: '승모근을 해도 목 운동이 필요한 이유' },
      { sec: 220, labelKo: '목 운동은 위험할까? 목디스크가 있다면' },
      { sec: 455, labelKo: '1단계 — 버티기로 목 근육 깨우기' },
      { sec: 600, labelKo: '2단계 — 넥컬·넥 익스텐션' },
      { sec: 790, labelKo: '3단계 — 옆으로 기울이기·돌리기' },
    ],
    source: {
      videoId: 'zJgwAAM_tNY',
      title: '아무도 운동하지 않는 이 근육',
      channel: '어썸블리스 AwesomeBLISS',
      channelUrl: 'https://www.youtube.com/@%EC%96%B4%EC%8D%B8%EB%B8%94%EB%A6%AC%EC%8A%A4',
      verifiedAt: '2026-11-09',
    },
  },
  // ── 첫판(2026-11-09) — 공식 Data API 설명란·챕터 기준(본편·자막 대조 아님) ──
  {
    id: 'tip-hip-stretch-8min',
    topicId: 'stretch',
    titleKo: '고관절 풀어 주는 8분 스트레칭',
    pointsKo: [
      { text: '뒤로 흔들기(백워드 락킹)로 시작해 내전근·장요근 순서로 풀어요.', from: 'chapter' },
      { text: '피존 → 소머리 → 나비 자세 순서로 이어 가요.', from: 'chapter' },
      { text: '동작마다 천천히 늘리며 다음 자세로 이어 가요.', from: 'chapter' },
    ],
    muscles: ['glutes', 'hamstrings'],
    moment: 'anytime',
    chapters: [
      { sec: 18, labelKo: '뒤로 흔들기(백워드 락킹)' },
      { sec: 113, labelKo: '내전근 스트레칭' },
      { sec: 188, labelKo: '장요근 스트레칭' },
      { sec: 253, labelKo: '피존 자세' },
      { sec: 384, labelKo: '소머리 자세' },
      { sec: 458, labelKo: '나비 자세' },
    ],
    source: {
      videoId: 'q2jEHE7Ir3A',
      title: '골반, 허리, 무릎 통증을 없애는 8분 고관절 스트레칭!',
      channel: '건강의학전문채널 하이닥',
      channelUrl: 'https://www.youtube.com/@HidocTV',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-hip-stretch-10min',
    topicId: 'stretch',
    titleKo: '고관절 10분 스트레칭 루틴',
    pointsKo: [
      { text: '와이퍼 동작으로 고관절을 먼저 풀고 내전근·장요근 스트레칭으로 넘어가요.', from: 'chapter' },
      { text: '햄스트링·종아리, 비둘기 자세 변형, 나비 자세 순서로 마무리해요.', from: 'chapter' },
      { text: '무리하지 말고 조금씩, 살살 자주 하라고 해요.', from: 'desc' },
    ],
    muscles: ['glutes', 'hamstrings', 'calves'],
    moment: 'anytime',
    chapters: [
      { sec: 16, labelKo: '와이퍼 동작으로 고관절 풀기' },
      { sec: 79, labelKo: '내전근 스트레칭' },
      { sec: 199, labelKo: '장요근 스트레칭(런지 변형)' },
      { sec: 321, labelKo: '햄스트링·종아리 스트레칭' },
      { sec: 384, labelKo: '비둘기 자세 변형' },
      { sec: 506, labelKo: '나비 자세로 마무리' },
    ],
    source: {
      videoId: '0GEx801-mD4',
      title: '고관절 스트레칭, 허리/무릎 통증의 근본 원인!  물리치료사가 추천하는 10분 고관절 스트레칭',
      channel: '물리치료사.PT재석',
      channelUrl: 'https://www.youtube.com/@PTjaeseok',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-daily-mobility-5min',
    topicId: 'stretch',
    titleKo: '하루 5분 전신 가동성 루틴',
    pointsKo: [
      { text: '끝까지 움직여 쓰지 않는 관절은 가동 범위가 줄어든다는 점에서 출발해요.', from: 'desc' },
      { text: '짧은 루틴일수록 꾸준히 하기 쉬워서 고관절·등 위쪽·발목에 집중해요.', from: 'desc' },
      { text: '캣카우 → 월드 그레이티스트 스트레칭 → 쪼그려 앉기 → 흉추 돌리기 → 벽 슬라이드 순서예요.', from: 'desc' },
      { text: '동작마다 1분 동안 질 좋은 반복을 하고, 매일 하라고 권해요.', from: 'desc' },
    ],
    muscles: ['fullBody'],
    moment: 'anytime',
    source: {
      videoId: 'sOuKeVuej9E',
      title: 'How To Unlock Your Mobility in 5 Minutes (DAILY STRETCH)',
      channel: 'Jeremy Ethier',
      channelUrl: 'https://www.youtube.com/@JeremyEthier',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-chest-stretch-shoulder',
    topicId: 'stretch',
    titleKo: '어깨 아끼는 가슴 스트레칭',
    pointsKo: [
      { text: '소흉근이 굳으면 어깨가 앞으로 말리고 팔을 머리 위로 올리기 어려워진다고 해요.', from: 'desc' },
      { text: '팔을 편 채 몸을 돌려 늘리는 방식은 어깨 앞쪽에 부담이 가서 피하라고 해요.', from: 'desc' },
      { text: '문틀에 팔을 대고 위로 밀어 올리며 늘려요.', from: 'desc' },
      { text: '운동 중에는 케이블 플라이처럼 어깨를 안정시킨 채 늘리는 동작을 권해요.', from: 'desc' },
    ],
    muscles: ['chest', 'shoulders'],
    moment: 'anytime',
    source: {
      videoId: 'LB4CxC7Ckbw',
      title: 'The Best and Worst Stretches For Your Chest',
      channel: 'ATHLEAN-X™',
      channelUrl: 'https://www.youtube.com/@athleanx',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-foam-roller-upper-back',
    topicId: 'stretch',
    titleKo: '폼롤러로 굽은 등 풀기',
    pointsKo: [
      { text: '폼롤러 하나만 있으면 집에서도 할 수 있는 등 스트레칭이에요.', from: 'desc' },
      { text: '자주, 꾸준히 해 주면 뻐근한 등이 시원하게 열린다고 해요.', from: 'desc' },
    ],
    muscles: ['back'],
    moment: 'anytime',
    source: {
      videoId: 'dFGtIsIsRec',
      title: '굽은등 폼롤러 셀프 스트레칭(일자목/전방경사)체형교정',
      channel: 'MSG훈',
      channelUrl: 'https://www.youtube.com/@msg2304',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-treadmill-warmup',
    topicId: 'warmup',
    titleKo: '트레드밀 10분 + 스트레칭 5분 웜업',
    pointsKo: [
      { text: '트레드밀 10분으로 심박수를 올리고, 전신 스트레칭 5분으로 마무리해요.', from: 'desc' },
      { text: '체온을 올리고 관절을 부드럽게 푸는 준비 과정으로 소개해요.', from: 'desc' },
    ],
    muscles: ['fullBody'],
    moment: 'before',
    chapters: [
      { sec: 60, labelKo: '트레드밀 10분 워밍업' },
      { sec: 675, labelKo: '전신 스트레칭 5분' },
      { sec: 857, labelKo: '마무리 안내' },
    ],
    source: {
      videoId: 'A49RQ9H-QeI',
      title: '[PT 11] 운동효과 2배!운동전 \'런닝머신+스트레칭 웜업루틴 딱 15분',
      channel: '몸쌤 - 무브어게인',
      channelUrl: 'https://www.youtube.com/@moveagain',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-dynamic-warmup-6min',
    topicId: 'warmup',
    titleKo: '6분 동적 스트레칭 웜업',
    pointsKo: [
      { text: '본 운동 전에 움직이면서 하는 동적 스트레칭으로 몸을 살짝 데워요.', from: 'desc' },
      { text: '쉬운 동작이라도 몸이 굳은 줄 모르고 바로 시작하면 다칠 수 있다고 해요.', from: 'desc' },
      { text: '웜업을 건너뛰고 런지를 하다 다쳐 2주 넘게 하체 운동을 쉬었던 경험을 들려줘요.', from: 'desc' },
    ],
    cautionKo: '루틴을 시작하기 전에 의사와 상의하고, 따라 하는 건 각자 책임이라고 안내해요.',
    muscles: ['fullBody'],
    moment: 'before',
    source: {
      videoId: '7gR50n00rQ4',
      title: '6분 운동 전 웜업 잊지 마세요! - 운동 전 스트레칭 - 부상방지 하고 운동효과 올려주는 6분 동적 스트레칭',
      channel: '빅씨스 Bigsis',
      channelUrl: 'https://www.youtube.com/@BIGSIS',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-upper-dynamic-warmup',
    topicId: 'warmup',
    titleKo: '상체 운동 전 동적 스트레칭',
    pointsKo: [
      { text: '근력 운동 전에 60초 넘게 정적 스트레칭을 하면 근력이 떨어진다는 연구를 소개해요.', from: 'desc' },
      { text: '동적 스트레칭은 할 운동과 관련된 동작으로, 체온이 오르게 하라고 해요.', from: 'desc' },
      { text: '시간보다 강도가 중요해서 숨이 조금 찰 정도까지 하라고 해요.', from: 'desc' },
      { text: '코어 깨우기 → 흉추 회전 → 어깨 굴곡·회전 → T·Y 레이즈 순서예요.', from: 'chapter' },
    ],
    muscles: ['chest', 'back', 'shoulders'],
    moment: 'before',
    chapters: [
      { sec: 50, labelKo: '코어 깨우기' },
      { sec: 150, labelKo: '흉추 회전' },
      { sec: 310, labelKo: '어깨 수평으로 모으기·벌리기' },
      { sec: 390, labelKo: '어깨 굴곡' },
      { sec: 470, labelKo: 'T·Y 레이즈' },
      { sec: 515, labelKo: '어깨 회전' },
    ],
    source: {
      videoId: '9NcG2PAUkfg',
      title: '[논문 근거] 운동전, 부상 방지 및 수행능력 향상을 위한 상체 동적 스트레칭 루틴',
      channel: '어썸블리스 AwesomeBLISS',
      channelUrl: 'https://www.youtube.com/@%EC%96%B4%EC%8D%B8%EB%B8%94%EB%A6%AC%EC%8A%A4',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-squat-prep-warmup',
    topicId: 'warmup',
    titleKo: '스쿼트 전 고관절 준비운동',
    pointsKo: [
      { text: '고관절 가동 범위가 나와야 스쿼트가 잘 되고, 등·허리 관절도 잘 움직여야 덜 다친다고 해요.', from: 'desc' },
      { text: '내전근 스트레칭과 버티기 뒤 풀어 주기를 번갈아 하며 풀스쿼트 자세로 이어 가요.', from: 'chapter' },
      { text: '대둔근·장요근·대퇴사두근을 늘린 뒤 캣앤카우와 누워서 하는 관절 운동으로 마무리해요.', from: 'chapter' },
    ],
    muscles: ['quads', 'glutes', 'hamstrings'],
    exerciseIds: ['seed-barbell-squat'],
    moment: 'before',
    chapters: [
      { sec: 59, labelKo: '내전근 스트레칭' },
      { sec: 127, labelKo: '풀스쿼트 자세로 내전근 풀기' },
      { sec: 196, labelKo: '무릎 꿇고 고관절 주변 스트레칭' },
      { sec: 312, labelKo: '대둔근·장요근 스트레칭' },
      { sec: 536, labelKo: '캣 앤 카우' },
      { sec: 580, labelKo: '누워서 하는 골반·허리·등 관절 운동' },
    ],
    source: {
      videoId: 'JbWcqjz36qw',
      title: '스쿼트 안다치고 중량을 잘하기 위한 준비운동',
      channel: '운동가이더',
      channelUrl: 'https://www.youtube.com/@user-FETC',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-shoulder-warmup',
    topicId: 'warmup',
    titleKo: '어깨 운동 전 워밍업과 순서',
    pointsKo: [
      { text: '어깨 운동은 워밍업 → 프레스 → 측면 → 후면 안정성까지 고르게 짜라고 해요.', from: 'desc' },
      { text: '사이드 레터럴 레이즈만 반복하는 건 피하라고 해요.', from: 'desc' },
      { text: '오버헤드 프레스·사이드 레터럴 레이즈·페이스풀과 어깨 워밍업 2가지를 다뤄요.', from: 'chapter' },
    ],
    muscles: ['shoulders'],
    exerciseIds: ['seed-overhead-press', 'seed-side-lateral-raise', 'seed-face-pull'],
    moment: 'before',
    chapters: [
      { sec: 36, labelKo: '오버헤드 프레스' },
      { sec: 96, labelKo: '사이드 레터럴 레이즈' },
      { sec: 151, labelKo: '페이스풀' },
      { sec: 224, labelKo: '어깨 워밍업 2가지' },
      { sec: 302, labelKo: '어깨를 키우려면 알아 둘 것' },
    ],
    source: {
      videoId: '1_g0QmsmvjM',
      title: '헬스 초보 어깨 운동 루틴 | 워밍업부터 운동 방법까지 총 정리',
      channel: '웨이트연구소 I 덕코치',
      channelUrl: 'https://www.youtube.com/@%EC%9B%A8%EC%9D%B4%ED%8A%B8%EC%97%B0%EA%B5%AC%EC%86%8C%EB%8D%95%EC%BD%94%EC%B9%98',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-squat-form',
    topicId: 'form',
    titleKo: '백 스쿼트 자세 기본',
    pointsKo: [
      { text: '발은 고관절이 편한 보폭으로, 발끝은 10~30도 벌리고 무릎은 발끝 방향으로 둬요.', from: 'desc' },
      { text: '바는 견갑골 위에 얹고 손으로 앞으로 눌러 몸에 붙여 고정해요.', from: 'desc' },
      { text: '숨을 들이마셔 몸통을 단단히 한 뒤, 허리가 말리지 않는 깊이까지만 앉아요.', from: 'desc' },
      { text: '일어날 땐 발로 바닥을 밀고, 엉덩이가 무릎보다 높아지면 골반을 앞으로 밀어요.', from: 'desc' },
    ],
    cautionKo: '계속 숨을 참으면 혈압이 오를 수 있어 올라올 때 숨을 내쉬고, 초보자는 빈 바나 15회 넘게 드는 무게로 시작하라고 해요.',
    muscles: ['quads', 'glutes'],
    exerciseIds: ['seed-barbell-squat'],
    moment: 'before',
    chapters: [
      { sec: 0, labelKo: '자주 하는 실수 4가지' },
      { sec: 65, labelKo: '스탠스와 바벨 위치' },
      { sec: 146, labelKo: '척추 정렬과 힙드라이브' },
      { sec: 193, labelKo: '복압과 수준별 무게' },
    ],
    source: {
      videoId: '50f62PSGY7k',
      title: '스쿼트 자세, 발 위치·힙드라이브·척추정렬 3번만 보면 이해됩니다',
      channel: '핏블리 FITVELY',
      channelUrl: 'https://www.youtube.com/@fitvely',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-deadlift-two-ways',
    topicId: 'form',
    titleKo: '하체 날·등 날 데드리프트 차이',
    pointsKo: [
      { text: '무게 중심이 어디에 실리느냐에 따라 같은 데드리프트도 하체·등 운동이 된다고 해요.', from: 'desc' },
      { text: '하체 날엔 고관절을 뒤로 빼며 엉덩이로 들고, 발은 어깨너비 이상으로 둬요.', from: 'desc' },
      { text: '하체 날엔 다리를 먼저 굽혀 바가 정강이를 스치게 든다고 해요.', from: 'desc' },
      { text: '등 날엔 견갑을 모으고 광배를 펼친 채 무릎 밑까지만 내려요.', from: 'desc' },
    ],
    muscles: ['hamstrings', 'glutes', 'back'],
    exerciseIds: ['seed-deadlift'],
    moment: 'before',
    chapters: [
      { sec: 0, labelKo: '등 운동일까, 하체 운동일까' },
      { sec: 40, labelKo: '하체 날 컨벤셔널 데드리프트' },
      { sec: 134, labelKo: '등 하는 날 데드리프트' },
      { sec: 228, labelKo: '두 가지 차이 정리' },
    ],
    source: {
      videoId: 'xqhNbasgTtU',
      title: '데드리프트 자세, 등운동일까 하체운동일까? 컨벤셔널·루마니안 차이',
      channel: '핏블리 FITVELY',
      channelUrl: 'https://www.youtube.com/@fitvely',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-bench-press-fixes',
    topicId: 'form',
    titleKo: '벤치프레스 흔한 실수 바로잡기',
    pointsKo: [
      { text: '팔꿈치를 너무 벌리면 어깨에 부담이 간다며 바를 가슴 아래쪽에 내리라고 해요.', from: 'desc' },
      { text: '바를 가슴에 댔을 때 손목·팔뚝·팔꿈치가 바 바로 밑에 일직선이 되는 너비로 잡아요.', from: 'desc' },
      { text: '가슴을 들고 등으로 바를 당겨 내리듯 견갑을 모으면 어깨가 덜 끼어든다고 해요.', from: 'desc' },
      { text: '발은 넓게 딛고 광배에 힘을 준 뒤 배에 숨을 채워 몸통을 단단히 해요.', from: 'desc' },
    ],
    muscles: ['chest', 'shoulders'],
    exerciseIds: ['seed-barbell-bench-press'],
    moment: 'before',
    source: {
      videoId: 'JizeVA3Ba3A',
      title: 'The Worst Bench Press Mistakes Everyone Makes (Avoid These)',
      channel: 'Jeremy Ethier',
      channelUrl: 'https://www.youtube.com/@JeremyEthier',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-lat-pulldown-form',
    topicId: 'form',
    titleKo: '팔 말고 등으로 랫풀다운',
    pointsKo: [
      { text: '다음 날 광배근 대신 승모근·팔만 뻐근하다면 자세 세팅부터 다시 보라고 해요.', from: 'desc' },
      { text: '그립·각도·팔꿈치 궤도로 팔 힘을 빼고 광배근에 집중하는 법을 다뤄요.', from: 'desc' },
      { text: '1초 당기고 3초 천천히 풀어 주는 템포와 호흡·가동 범위도 짚어요.', from: 'desc' },
      { text: '흉추 가동성을 보강하는 운동 2가지도 함께 알려 줘요.', from: 'chapter' },
    ],
    muscles: ['back'],
    exerciseIds: ['seed-lat-pulldown'],
    moment: 'before',
    chapters: [
      { sec: 38, labelKo: '원리와 자극 부위' },
      { sec: 82, labelKo: '자세 세팅법' },
      { sec: 118, labelKo: '하는 방법' },
      { sec: 187, labelKo: '가장 많이 하는 실수 3가지' },
      { sec: 233, labelKo: '흉추 가동성 보강 운동 2가지' },
      { sec: 282, labelKo: '핵심 요약' },
    ],
    source: {
      videoId: 'PLK4xl7x9FY',
      title: '랫풀다운, \'이 3가지만\' 기억하세요. 팔 힘 하나도 안 쓰고 등으로만 당기는 비법',
      channel: '웨이트연구소 I 덕코치',
      channelUrl: 'https://www.youtube.com/@%EC%9B%A8%EC%9D%B4%ED%8A%B8%EC%97%B0%EA%B5%AC%EC%86%8C%EB%8D%95%EC%BD%94%EC%B9%98',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-bicep-curl-mistakes',
    topicId: 'form',
    titleKo: '바이셉스 컬 실수 5가지',
    pointsKo: [
      { text: '반동으로 시작하면 무게가 허리로 간다고 해서, 몸을 흔들지 않고 들어요.', from: 'desc' },
      { text: '팔을 다 편 아래쪽 구간을 줄이지 말라고 해요 — 늘어난 구간의 자극이 크다고 해요.', from: 'desc' },
      { text: '손목을 안으로 굽히면 팔뚝이 대신 일해서, 손목을 팔뚝과 일자로 둬요.', from: 'desc' },
      { text: '팔꿈치가 앞으로 밀리면 앞 어깨가 거들어서, 팔꿈치를 고정해요.', from: 'desc' },
    ],
    muscles: ['biceps'],
    exerciseIds: ['seed-barbell-curl', 'seed-dumbbell-curl'],
    moment: 'before',
    source: {
      videoId: 'jjnJHhzZUUM',
      title: 'STOP Doing Bicep Curls Like This (5 Mistakes Slowing Your Gains)',
      channel: 'Jeremy Ethier',
      channelUrl: 'https://www.youtube.com/@JeremyEthier',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-deadlift-steps-back',
    topicId: 'injury',
    titleKo: '허리 부담 줄이는 데드리프트 4단계',
    pointsKo: [
      { text: '데드리프트는 허리로만 버티는 게 아니라 하체·상체가 함께 힘을 쓰는 운동이라고 해요.', from: 'desc' },
      { text: '바벨 위치·힙 힌지 → 복압·횡격막 호흡 → 바닥 누르기 → 가볍게 들어 올리기 순서예요.', from: 'chapter' },
      { text: '초보자도 하체를 써서 허리에 무리가 덜 가게 배우도록 단계를 나눴다고 해요.', from: 'desc' },
    ],
    muscles: ['back', 'hamstrings', 'glutes'],
    exerciseIds: ['seed-deadlift'],
    moment: 'before',
    chapters: [
      { sec: 58, labelKo: '1단계 — 바벨 위치와 힙 힌지' },
      { sec: 164, labelKo: '2단계 — 복압과 횡격막 호흡' },
      { sec: 322, labelKo: '3단계 — 바닥 누르기와 텐션' },
      { sec: 413, labelKo: '4단계 — 가볍게 들어 올리기' },
      { sec: 508, labelKo: '실전 — 중량과 가동 범위' },
      { sec: 751, labelKo: '혼자서도 다치지 않게 운동하기' },
    ],
    source: {
      videoId: 'Se9as2opl0I',
      title: '데드리프트 “단계적 운동방법” 모르고하면 허리 큰일납니다! 허리 안아프게 데드리프트 하는 방법',
      channel: '허리&PT : 부상 없이 헬스합시다',
      channelUrl: 'https://www.youtube.com/@%ED%94%BC%ED%8B%B0%ED%8C%8C%EC%BB%A4',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-bench-shoulder-grip',
    topicId: 'injury',
    titleKo: '벤치프레스 그립과 어깨 내회전 점검',
    pointsKo: [
      { text: '바벨을 잡기 어려운 이유와 벤치프레스 그립을 먼저 짚어요.', from: 'chapter' },
      { text: '어깨 안쪽 돌림(내회전)이 걸림돌이 되는지 간단한 테스트로 확인해요.', from: 'chapter' },
      { text: '주동근인 가슴을 쓰는 법과 연습 방법으로 마무리해요.', from: 'chapter' },
    ],
    muscles: ['chest', 'shoulders'],
    exerciseIds: ['seed-barbell-bench-press'],
    moment: 'before',
    chapters: [
      { sec: 32, labelKo: '바벨 잡기가 어려운 이유' },
      { sec: 87, labelKo: '벤치프레스 그립' },
      { sec: 110, labelKo: '어깨의 내회전' },
      { sec: 210, labelKo: '내회전 테스트' },
      { sec: 299, labelKo: '주동근은 가슴' },
      { sec: 418, labelKo: '연습 방법' },
    ],
    source: {
      videoId: 'YDJePzgPulQ',
      title: '벤치프레스가 당신의 \'어깨\'를 박살내는 진짜 이유!? (feat. 통증없는 벤치프레스 자세)',
      channel: '어썸블리스 AwesomeBLISS',
      channelUrl: 'https://www.youtube.com/@%EC%96%B4%EC%8D%B8%EB%B8%94%EB%A6%AC%EC%8A%A4',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-hip-hinge-sit-stand',
    topicId: 'injury',
    titleKo: '힙힌지로 앉았다 일어나기',
    pointsKo: [
      { text: '허리를 구부정하게 한 채 일어나면 허리를 다칠 수 있고 무릎이 대신 버티게 된다고 해요.', from: 'desc' },
      { text: '고관절을 접는 힙힌지로 앉았다 일어나는 연습을 해요.', from: 'desc' },
      { text: '운동하는 사람에게도 힙힌지가 아주 중요하다고 해요.', from: 'desc' },
    ],
    muscles: ['glutes', 'hamstrings'],
    moment: 'anytime',
    source: {
      videoId: 'kf1J77kUEAo',
      title: '관절이 상하지 않게 힙힌지를 이용해서 제대로 앉았다 일어나는 방법 알려드립니다',
      channel: '운동가이더',
      channelUrl: 'https://www.youtube.com/@user-FETC',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-wall-squat-knee',
    topicId: 'injury',
    titleKo: '무릎 부담되면 벽 스쿼트부터',
    pointsKo: [
      { text: '하체 근력이 부족하면 무릎 연골·인대가 대신 버티게 된다고 해요.', from: 'desc' },
      { text: '일반 스쿼트가 부담되면 브릿지나 벽에 기대는 스쿼트로 먼저 시작하라고 해요.', from: 'desc' },
      { text: '벽 스쿼트로도 허벅지 앞쪽과 엉덩이 근육을 쓸 수 있다고 해요.', from: 'desc' },
    ],
    muscles: ['quads', 'glutes'],
    moment: 'anytime',
    source: {
      videoId: '3eykonrgEu4',
      title: '스쿼트를 무리되지 않고 쉽게 하는 방법 wall squat 벽 대고 스쿼트 하기',
      channel: '운동가이더',
      channelUrl: 'https://www.youtube.com/@user-FETC',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-bracing-breath',
    topicId: 'injury',
    titleKo: '복압 잡는 호흡 연습',
    pointsKo: [
      // [원본] { text: '운동하는 동안 복압을 유지하면 척추를 단단하게 안정시킬 수 있다고 해요.', from: 'desc' },
      // [원본] { text: '운동할 때 허리가 불편한 분들께 특히 권한다고 해요.', from: 'desc' },
      // [개선 2026-11-09 · 공개 전 리뷰] 증상→권유 문장은 효능 주장으로 읽혀 주의 칸의 상담 안내로 옮겼다
      { text: '운동하는 동안 복압을 유지하는 것이 척추 안정에 중요하다고 설명해요.', from: 'desc' },
      { text: '무게를 들기 전에 호흡으로 복압을 잡는 연습을 보여 줘요.', from: 'desc' },
    ],
    cautionKo: '허리가 불편하다면 따라 하기 전에 전문가와 먼저 상의하세요.',
    muscles: ['abs', 'back'],
    moment: 'before',
    // [원본] 설명란 근거가 약해 화면에서 뺐다(코드 리뷰 REV-089 — 설명란 두 문장뿐 / 챕터 이름뿐)
    // [원본] draft: true,
    // [개선 2026-11-09] 사용자 검수로 공개(v0.84.2)
    source: {
      videoId: 'fNwYSc4lSog',
      title: '중량 높여주는 호흡 훈련 복압 잡기 / 운동할 때 허리 아프면 호흡부터 잡아보세요',
      channel: 'MSG훈',
      channelUrl: 'https://www.youtube.com/@msg2304',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-rest-between-sets',
    topicId: 'recovery',
    titleKo: '세트 사이 몇 분 쉴까',
    pointsKo: [
      { text: '짧게 쉬어야 근육이 큰다는 흔한 상식을 다시 짚어요.', from: 'chapter' },
      { text: '근력과 근육 크기를 함께 챙기는 휴식법을 다뤄요.', from: 'chapter' },
      { text: '훈련 경력에 따라 알맞은 휴식 시간이 다르다고 해요.', from: 'chapter' },
    ],
    muscles: ['fullBody'],
    moment: 'anytime',
    chapters: [
      { sec: 70, labelKo: '짧게 쉬어야 큰다는 상식의 함정' },
      { sec: 172, labelKo: '근력과 근육 크기를 함께 잡는 휴식법' },
      { sec: 359, labelKo: '훈련 경력별 휴식 시간' },
      { sec: 425, labelKo: '실전 휴식 가이드' },
    ],
    // [원본] 설명란 근거가 약해 화면에서 뺐다(코드 리뷰 REV-089 — 설명란 두 문장뿐 / 챕터 이름뿐)
    // [원본] draft: true,
    // [개선 2026-11-09] 사용자 검수로 공개(v0.84.2)
    source: {
      videoId: 'X6ZiFEQmYIY',
      title: '헬스 휴식시간 몇 분이 정답일까? 연구결과 보고 루틴 다 바꿨습니다 (근성장 2배, 근력운동)',
      channel: '핏블리 FITVELY',
      channelUrl: 'https://www.youtube.com/@fitvely',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-recovery-beginners',
    topicId: 'recovery',
    titleKo: '초보일수록 회복이 먼저',
    pointsKo: [
      { text: '매일 고강도, 잠 부족, 회복을 무시한 무리한 루틴을 초보자의 흔한 실수로 꼽아요.', from: 'desc' },
      { text: '근육통이 계속 남고 힘이 안 난다면 몸이 보내는 신호일 수 있다고 해요.', from: 'desc' },
      { text: '근육통이 심할수록 좋은 운동인지도 짚어요.', from: 'chapter' },
      { text: '회복에 중요한 것으로 수면·단백질·탄수화물 등을 함께 정리해요.', from: 'desc' },
    ],
    muscles: ['fullBody'],
    moment: 'after',
    chapters: [
      { sec: 25, labelKo: '운동하면 왜 피곤할까' },
      { sec: 83, labelKo: '근육통이 심할수록 좋은 운동일까' },
      { sec: 139, labelKo: '운동을 많이 하면 면역력이 떨어질까' },
      { sec: 192, labelKo: '회복을 돕는 3가지' },
    ],
    source: {
      videoId: '6x4RXY8mAn8',
      title: '초보자들에게 운동 후 회복이 더 중요한 이유',
      channel: '웨이트연구소 I 덕코치',
      channelUrl: 'https://www.youtube.com/@%EC%9B%A8%EC%9D%B4%ED%8A%B8%EC%97%B0%EA%B5%AC%EC%86%8C%EB%8D%95%EC%BD%94%EC%B9%98',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-cooldown-8min',
    topicId: 'recovery',
    titleKo: '운동 뒤 8분 쿨다운 스트레칭',
    pointsKo: [
      { text: '운동을 마친 뒤 전신을 늘려 주는 8분 쿨다운 스트레칭이에요.', from: 'desc' },
      { text: '다른 운동을 마친 뒤 마무리로 넣어 보라고 해요.', from: 'desc' },
    ],
    cautionKo: '루틴을 시작하기 전에 의사와 상의하고, 따라 하는 건 각자 책임이라고 안내해요.',
    muscles: ['fullBody'],
    moment: 'after',
    source: {
      videoId: 'zDcOqeLGymE',
      title: '8분 루틴 꼭 해주세요! 운동 후 전신 스트레칭  - 8분 쿨다운 스트레칭',
      channel: '빅씨스 Bigsis',
      channelUrl: 'https://www.youtube.com/@BIGSIS',
      verifiedAt: '2026-11-09',
    },
  },
  {
    id: 'tip-foam-roller-full',
    topicId: 'recovery',
    titleKo: '폼롤러로 하체·상체 풀기',
    pointsKo: [
      { text: '하체편과 상체편 폼롤러 마사지·스트레칭을 한 영상에 담았어요.', from: 'desc' },
      { text: '너무 아프지 않은 강도로 하라고 해요.', from: 'desc' },
      { text: '근육을 먼저 풀어 준 다음 강화 운동을 이어 가길 권해요.', from: 'desc' },
    ],
    muscles: ['fullBody'],
    moment: 'after',
    source: {
      videoId: 'plrLB3EnO1g',
      title: '폼롤러 스트레칭, 운동(하체+상체=전신)',
      channel: '물리치료사.PT재석',
      channelUrl: 'https://www.youtube.com/@PTjaeseok',
      verifiedAt: '2026-11-09',
    },
  },
];

/** 화면에 낼 팁 — draft·hidden 제외 */
function shown(): CreatorTip[] {
  return CREATOR_TIPS.filter((t) => !t.draft && !t.hidden);
}

export function tipsFor(topicId: TipTopicId): CreatorTip[] {
  return shown().filter((t) => t.topicId === topicId);
}

/** 팁이 하나라도 있는 주제만 */
export function visibleTipTopics(): TipTopic[] {
  return TIP_TOPICS.filter((t) => tipsFor(t.id).length > 0);
}

export function tipById(id: string): CreatorTip | null {
  return shown().find((t) => t.id === id) ?? null;
}

/** 원본 영상 주소 — 챕터 시각이 있으면 그 시각부터 */
export function tipWatchUrl(tip: CreatorTip, sec?: number): string {
  return youtubeWatchUrl(tip.source.videoId, sec);
}

/** mm:ss(한 시간 넘으면 h:mm:ss) */
export function chapterTimeLabel(sec: number): string {
  const s = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** 부위가 겹치는 수 — fullBody·other 는 세지 않는다(fullBody 일반 팁은 preWorkoutTip 이 따로 약하게 센다) */
function muscleOverlap(tip: CreatorTip, muscles: ReadonlySet<MuscleGroup>): number {
  let n = 0;
  for (const m of tip.muscles) if (m !== 'fullBody' && m !== 'other' && muscles.has(m)) n += 1;
  return n;
}

/**
 * 종목 상세의 「관련 팁」 — 순위 = (그 종목을 지목했나, 겹친 부위 수) 내림차순 → 데이터 순서.
 * fullBody 일반 팁은 지목하지 않은 한 넣지 않는다(모든 종목에 같은 팁이 붙는다). 아무것도 겹치지 않으면 빈 배열.
 */
export function tipsForExercise(exerciseId: string, primaryMuscles: readonly MuscleGroup[], limit = 3): CreatorTip[] {
  const set = new Set(primaryMuscles);
  return shown()
    .map((t, i) => ({ t, i, named: t.exerciseIds?.includes(exerciseId) ? 1 : 0, overlap: muscleOverlap(t, set) }))
    .filter((x) => x.named > 0 || x.overlap > 0)
    .sort((a, b) => b.named - a.named || b.overlap - a.overlap || a.i - b.i)
    .slice(0, Math.max(0, limit))
    .map((x) => x.t);
}

/**
 * 루틴 미리보기의 「시작 전」 한 줄 — 운동 전(before) 팁 중 루틴과 가장 많이 겹치는 후보들에서 하나.
 * 점수 = 지목한 종목 수 × 2 + 겹친 부위 수 + (fullBody 일반 팁이면 0.5 — 루틴에 종목이 있을 때만).
 * 최고점 후보(데이터 순서)[dayNum mod n] — dayNum 은 로컬 달력일 번호(streak.ts dayNumber(Date.now())).
 * 같은 날·같은 루틴이면 늘 같은 팁, 날이 바뀌면 다음 후보. 점수가 0 이면 null.
 * fullBody 일반 before 팁이 있는 한 종목이 하나라도 있으면 0.5점 후보가 생긴다 — null 은 빈 루틴(또는 일반 팁이 없을 때)뿐이다.
 */
export function preWorkoutTip(
  exerciseIds: readonly string[],
  muscles: readonly MuscleGroup[],
  dayNum: number,
): CreatorTip | null {
  if (!exerciseIds.length) return null;
  const ids = new Set(exerciseIds);
  const set = new Set(muscles);
  const scored = shown()
    .filter((t) => t.moment === 'before')
    .map((t) => ({
      t,
      score:
        (t.exerciseIds ?? []).filter((id) => ids.has(id)).length * 2 +
        muscleOverlap(t, set) +
        (t.muscles.includes('fullBody') ? 0.5 : 0),
    }))
    .filter((x) => x.score > 0);
  if (!scored.length) return null;
  const best = Math.max(...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === best);
  const d = Number.isFinite(dayNum) ? Math.floor(dayNum) : 0;
  const i = ((d % top.length) + top.length) % top.length;
  return top[i].t;
}

/** 출처 한 줄에 쓰는 채널 이름(루틴과 같은 표) */
export function tipChannelLabel(tip: CreatorTip): string {
  return creatorChannelLabel(tip.source.channel);
}
