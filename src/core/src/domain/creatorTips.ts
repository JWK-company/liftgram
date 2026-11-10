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
  // [원본] from: 'desc' | 'chapter' | 'basis';
  // [개선 2026-11-10 · ADR-063] script = 유튜브 「스크립트 표시」에 보이는 글을 사람이 읽고 요약(원문은 저장하지 않는다)
  from: 'desc' | 'chapter' | 'basis' | 'script';
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
  /** 유튜브 「스크립트 표시」 글과 대조한 날짜(ADR-063) — 있으면 「본편 기준」 */
  scriptCheckedAt?: string;
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
      { text: '모든 목 운동에서 몸 자세를 먼저 바로 하고, 혀를 입천장에 계속 붙이고 하라고 해요.', from: 'script' },
      { text: '1단계는 손으로 앞·뒤·옆에서 밀고 목은 움직이지 않고 30초쯤 버티는 거예요. 쉬우면 침대 끝에 누워 머리 무게로 버텨요.', from: 'script' },
      { text: '2단계 넥컬·넥 익스텐션은 턱을 먼저 당긴 뒤 움직이고, 3단계 옆으로 기울이기·좌우 돌리기까지 모두 10~20회 3세트를 권해요.', from: 'script' },
      { text: '단계를 건너뛰지 말고 한 단계를 최소 일주일 해 본 뒤 다음으로 넘어가라고 해요.', from: 'script' },
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
    scriptCheckedAt: '2026-11-10',
  },
  // ── 첫판(2026-11-09) — 공식 Data API 설명란·챕터 기준(본편·자막 대조 아님) ──
  {
    id: 'tip-hip-stretch-8min',
    topicId: 'stretch',
    titleKo: '고관절 풀어 주는 8분 스트레칭',
    pointsKo: [
      { text: '네발 자세로 다리를 어깨보다 넓게 벌리고 엉덩이를 뒤로 보내는 뒤로 흔들기를 10회 반복하며 시작해요.', from: 'script' },
      { text: '내전근 → 장요근 → 피존 → 돌진(런지) → 소머리 → 나비 자세 순서로, 자세마다 한쪽씩 20초 버텨요.', from: 'script' },
      { text: '턱이 들리지 않게, 배꼽을 살짝 당기고 허리가 꺾이지 않게 유지하라고 해요.', from: 'script' },
      { text: '피존 자세에서는 체중이 한쪽으로 쏠리지 않게 몸을 가운데로 두라고 해요.', from: 'script' },
    ],
    cautionKo: '허리·골반·무릎에 통증이 있다면 따라 하기 전에 전문가와 먼저 상의하세요.',
    muscles: ['glutes', 'hamstrings'],
    moment: 'anytime',
    chapters: [
      { sec: 18, labelKo: '뒤로 흔들기(백워드 락킹)' },
      { sec: 113, labelKo: '내전근 스트레칭' },
      { sec: 188, labelKo: '장요근 스트레칭' },
      { sec: 253, labelKo: '피존 자세' },
      { sec: 320, labelKo: '돌진(런지) 자세' },
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
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-hip-stretch-10min',
    topicId: 'stretch',
    titleKo: '고관절 10분 스트레칭 루틴',
    pointsKo: [
      { text: '무릎을 90도로 세우고 와이퍼처럼 좌우로 넘기며 고관절 안팎 회전으로 먼저 풀어요.', from: 'script' },
      { text: '내전근 → 런지 자세 고관절 앞 → 다운독(햄스트링·종아리) → 비둘기 변형 → 나비 자세 순서예요.', from: 'script' },
      { text: '힘으로 누르지 말고 머리·상체 무게로 기울이며, 숨을 편히 쉴 수 있는 강도로만 하라고 해요.', from: 'script' },
      { text: '자세가 완벽하지 않아도 되니 천천히 맞춰 가고, 아침보다 자기 전에 하길 권해요.', from: 'script' },
    ],
    cautionKo: '런지 자세에서 무릎이 불편하면 수건을 깔라고 해요. 허리·무릎에 통증이 있다면 전문가와 먼저 상의하세요.',
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
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-daily-mobility-5min',
    topicId: 'stretch',
    titleKo: '하루 5분 전신 가동성 루틴',
    pointsKo: [
      { text: '끝까지 움직여 쓰지 않는 관절은 가동 범위가 줄어든다는 점에서 출발해요.', from: 'desc' },
      { text: '짧은 루틴일수록 꾸준히 하기 쉬워서 고관절·등 위쪽·발목에 집중해요.', from: 'desc' },
      { text: '캣카우는 천천히 7~8번, 월드 그레이티스트 스트레칭은 한쪽 5회(약 30초)씩 해요.', from: 'script' },
      { text: '쪼그려 앉기는 발뒤꿈치에 수건을 받치고 30초 버틴 뒤 30초 좌우로 옮기며, 발끝은 30~45도까지만 벌려요.', from: 'script' },
      { text: '흉추 돌리기는 골반은 고정하고 상체만, 벽 슬라이드는 허리를 벽에 붙인 채 해요. 동작마다 1분, 매일 하라고 권해요.', from: 'script' },
    ],
    muscles: ['fullBody'],
    moment: 'anytime',
    chapters: [
      { sec: 0, labelKo: '가동 범위가 줄어드는 이유' },
      { sec: 150, labelKo: '캣카우' },
      { sec: 218, labelKo: '월드 그레이티스트 스트레칭' },
      { sec: 319, labelKo: '쪼그려 앉기' },
      { sec: 426, labelKo: '흉추 돌리기(벽)' },
      { sec: 513, labelKo: '벽 슬라이드' },
    ],
    source: {
      videoId: 'sOuKeVuej9E',
      title: 'How To Unlock Your Mobility in 5 Minutes (DAILY STRETCH)',
      channel: 'Jeremy Ethier',
      channelUrl: 'https://www.youtube.com/@JeremyEthier',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-chest-stretch-shoulder',
    topicId: 'stretch',
    titleKo: '어깨 아끼는 가슴 스트레칭',
    pointsKo: [
      { text: '소흉근이 굳으면 어깨가 앞으로 말리고 날개뼈가 앞·아래로 끌려간다고 해요.', from: 'script' },
      { text: '소흉근은 문틀·랙 모서리에 어깨 앞을 대고 날개뼈를 모은 채 팔을 머리 위로 올려 30~60초씩 두 번 늘려요.', from: 'script' },
      { text: '가슴 운동한 날 밤과 다음 날 아침에 한 번씩 더 하라고 권해요.', from: 'script' },
      { text: '대흉근은 팔을 살짝 굽혀 문틀에 고정하고 몸만 돌려 30~60초 늘려요. 팔 높이로 위·아래 가슴을 나눈다고 해요.', from: 'script' },
      { text: '운동 중에는 덤벨 플라이 대신 팔을 몸 가까이 두는 케이블 크로스오버·머신으로 늘리는 걸 권해요.', from: 'script' },
    ],
    cautionKo: '팔을 편 채 몸을 돌리는 스트레칭과 너무 벌리는 덤벨 플라이는 어깨 앞쪽에 부담이 된다고 해요. 어깨가 불편하다면 전문가와 먼저 상의하세요.',
    muscles: ['chest', 'shoulders'],
    moment: 'anytime',
    chapters: [
      { sec: 0, labelKo: '흔한 가슴 스트레칭 실수' },
      { sec: 40, labelKo: '소흉근이 굳으면 생기는 일' },
      { sec: 118, labelKo: '소흉근 스트레칭(문틀)' },
      { sec: 217, labelKo: '대흉근 — 피해야 할 스트레칭' },
      { sec: 296, labelKo: '대흉근 스트레칭(팔 굽혀 돌기)' },
      { sec: 383, labelKo: '운동 중 늘이기 — 플라이 대신 케이블' },
    ],
    source: {
      videoId: 'LB4CxC7Ckbw',
      title: 'The Best and Worst Stretches For Your Chest',
      channel: 'ATHLEAN-X™',
      channelUrl: 'https://www.youtube.com/@athleanx',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-foam-roller-upper-back',
    topicId: 'stretch',
    titleKo: '폼롤러로 굽은 등 풀기',
    pointsKo: [
      { text: '허리는 바닥에 붙이고 턱을 당긴 채 등 윗부분만 폼롤러 위로 젖히라고 해요.', from: 'script' },
      { text: '두껍고 큰 롤러보다 작은 것이나 반원(하프) 롤러로 시작하라고 해요.', from: 'script' },
      { text: '다리를 들거나 의자에 올리면 허리가 바닥에 더 잘 붙는다고 보여 줘요.', from: 'script' },
      { text: '낮은 단계부터 시작해 점차 늘려 가고, 운동 전후나 집에서 자주 하라고 해요.', from: 'script' },
    ],
    cautionKo: '허리가 같이 꺾이거나 목이 과하게 젖혀지면 낮은 롤러로 바꾸라고 해요. 통증이 있다면 전문가와 먼저 상의하세요.',
    muscles: ['back'],
    moment: 'anytime',
    chapters: [
      { sec: 0, labelKo: '준비물과 소개' },
      { sec: 34, labelKo: '흔한 보상 동작' },
      { sec: 125, labelKo: '기본 자세' },
      { sec: 168, labelKo: '다리 올려 강도 높이기' },
      { sec: 262, labelKo: '단계별로 늘리기' },
    ],
    source: {
      videoId: 'dFGtIsIsRec',
      title: '굽은등 폼롤러 셀프 스트레칭(일자목/전방경사)체형교정',
      channel: 'MSG훈',
      channelUrl: 'https://www.youtube.com/@msg2304',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-treadmill-warmup',
    topicId: 'warmup',
    titleKo: '트레드밀 10분 + 스트레칭 5분 웜업',
    pointsKo: [
      { text: '트레드밀 10분은 걷기 5~6km/h로 시작해 조깅 6~9km/h까지 올렸다 내리는 순서라고 해요.', from: 'script' },
      { text: '조깅 사이사이 1분씩 걸으며 호흡과 심박을 가라앉히고, 마지막 1분은 5km/h 아래로 쿨다운해요.', from: 'script' },
      { text: '스트레칭은 종아리 → 엉덩이·허벅지 뒤 → 허벅지 앞 → 전신 기지개를 10초씩 해요.', from: 'script' },
      { text: '힘들면 낮은 속도를 유지해도 된다고 해요.', from: 'script' },
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
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-dynamic-warmup-6min',
    topicId: 'warmup',
    titleKo: '6분 동적 스트레칭 웜업',
    pointsKo: [
      { text: '본 운동 전에 움직이면서 하는 동적 스트레칭으로 몸을 살짝 데워요.', from: 'desc' },
      { text: '쉬운 동작이라도 몸이 굳은 줄 모르고 바로 시작하면 다칠 수 있다고 해요.', from: 'desc' },
      { text: '서서 팔 돌리기·크로스 터치·사이드 런지로 시작해 몸통 회전과 어깨 풀기로 이어 가요.', from: 'script' },
      { text: '런지 자세와 깊은 스쿼트로 고관절·발목을 풀고, 앉아서 90도 무릎 돌리기·손목·가슴 펴기를 해요.', from: 'script' },
      { text: '마지막엔 서서 무릎 들기, 어깨 돌리기, 목 풀기로 마무리해요.', from: 'script' },
    ],
    cautionKo: '루틴을 시작하기 전에 의사와 상의하고, 따라 하는 건 각자 책임이라고 안내해요.',
    muscles: ['fullBody'],
    moment: 'before',
    chapters: [
      { sec: 10, labelKo: '서서 팔·다리 풀기' },
      { sec: 79, labelKo: '몸통 회전·어깨' },
      { sec: 127, labelKo: '런지 자세 고관절' },
      { sec: 198, labelKo: '깊은 스쿼트' },
      { sec: 228, labelKo: '앉아서 고관절·손목·가슴' },
      { sec: 337, labelKo: '서서 마무리·목 풀기' },
    ],
    source: {
      videoId: '7gR50n00rQ4',
      title: '6분 운동 전 웜업 잊지 마세요! - 운동 전 스트레칭 - 부상방지 하고 운동효과 올려주는 6분 동적 스트레칭',
      channel: '빅씨스 Bigsis',
      channelUrl: 'https://www.youtube.com/@BIGSIS',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-upper-dynamic-warmup',
    topicId: 'warmup',
    titleKo: '상체 운동 전 동적 스트레칭',
    pointsKo: [
      { text: '근력 운동 전에 60초 넘게 정적 스트레칭을 하면 근력이 떨어진다는 연구를 소개해요.', from: 'script' },
      { text: '동적 스트레칭은 할 운동과 관련된 동작으로, 체온이 오르게 하라고 해요.', from: 'script' },
      { text: '시간보다 강도가 중요해서 숨이 조금 찰 정도까지 하라고 해요.', from: 'script' },
      { text: '플랭크·사이드 플랭크로 코어를 가볍게 깨운 뒤 흉추 회전 5회, 가벼운 덤벨 플라이 10회로 이어 가요.', from: 'script' },
      { text: '무게는 생수병 정도면 충분하고, 전체를 1~2세트 돌린 뒤 본 운동에 들어간다고 해요.', from: 'script' },
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
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-squat-prep-warmup',
    topicId: 'warmup',
    titleKo: '스쿼트 전 고관절 준비운동',
    pointsKo: [
      { text: '고관절 가동 범위가 나와야 스쿼트가 잘 되고, 등·허리 관절도 잘 움직여야 덜 다친다고 해요.', from: 'desc' },
      { text: '스트레칭마다 잠깐 힘주며 버틴 뒤 풀어 주는 방식(등척성 수축 후 이완)을 섞어 보라고 해요.', from: 'script' },
      { text: '풀스쿼트 자세에선 허리를 편 채 팔꿈치로 무릎을 바깥으로 밀어 내전근을 늘려요.', from: 'script' },
      { text: '대둔근·장요근·대퇴사두근을 늘린 뒤 캣앤카우와 누워서 하는 흉추·허리 운동으로 이어 가요.', from: 'chapter' },
      { text: '마지막엔 네발 자세로 무릎을 벌리고 앞뒤로 움직이며 내전근을 다시 풀어 줘요.', from: 'script' },
    ],
    cautionKo: '어느 동작이든 허리가 말리거나 아프지 않은 범위까지만 하라고 해요. 통증이 있다면 전문가와 먼저 상의하세요.',
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
      { sec: 687, labelKo: '네발 자세 내전근 스트레칭' },
    ],
    source: {
      videoId: 'JbWcqjz36qw',
      title: '스쿼트 안다치고 중량을 잘하기 위한 준비운동',
      channel: '운동가이더',
      channelUrl: 'https://www.youtube.com/@user-FETC',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-shoulder-warmup',
    topicId: 'warmup',
    titleKo: '어깨 운동 전 워밍업과 순서',
    pointsKo: [
      { text: '워밍업으로 밴드 어깨 바깥 돌리기 15회 2세트, 케틀벨 헤일로 좌우 10회를 권해요.', from: 'script' },
      { text: '오버헤드 프레스는 턱을 살짝 당기고 바를 수직으로 밀며, 10~12회 가능한 무게로 3세트라고 해요.', from: 'script' },
      { text: '사이드 레터럴 레이즈는 가볍게, 팔을 30도쯤 앞으로 들어 15~20회 3세트를 해요.', from: 'script' },
      { text: '페이스풀은 케이블을 눈높이에 두고 팔꿈치를 옆으로 벌린 채 15~20회 3세트를 해요.', from: 'script' },
      { text: '프레스로 전체 볼륨, 레이즈로 측면, 후면 운동으로 균형을 나눠 맡기라고 해요.', from: 'script' },
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
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-squat-form',
    topicId: 'form',
    titleKo: '백 스쿼트 자세 기본',
    pointsKo: [
      { text: '발은 고관절이 편한 보폭으로, 발끝은 10~30도 벌리고 무릎은 발끝 방향으로 둬요. 뒤꿈치·엄지·새끼발가락으로 바닥을 지지해요.', from: 'script' },
      { text: '바는 견갑골 위에 얹고 손으로 앞으로 눌러 몸에 붙여 고정해요.', from: 'script' },
      { text: '숨을 들이마셔 몸통을 단단히 한 뒤, 허리가 말리지 않는 깊이까지만 앉아요.', from: 'script' },
      { text: '일어날 땐 발로 바닥을 밀고, 엉덩이가 무릎보다 높아지면 골반을 앞으로 밀어요.', from: 'script' },
      { text: '중급자는 8~12회, 상급자는 6회 미만 무게를 예로 들고, 런지·스플릿 스쿼트 병행도 권해요.', from: 'script' },
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
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-deadlift-two-ways',
    topicId: 'form',
    titleKo: '하체 날·등 날 데드리프트 차이',
    pointsKo: [
      { text: '무게 중심이 어디에 실리느냐에 따라 같은 데드리프트도 하체·등 운동이 된다고 해요.', from: 'script' },
      { text: '하체 날엔 고관절을 뒤로 빼며 엉덩이로 들고, 발은 어깨너비 이상으로 둬요.', from: 'script' },
      { text: '하체 날엔 다리를 먼저 굽혀 바가 정강이를 스치게 든다고 해요.', from: 'script' },
      { text: '등 날엔 견갑을 모으고 광배를 펼친 채 무릎 밑까지만 내려요.', from: 'script' },
      { text: '등 날엔 다 일어선 뒤 허리를 더 젖히면 힘이 기립근으로 넘어간다며 광배 긴장으로 끝내라고 해요.', from: 'script' },
    ],
    cautionKo: '무릎을 너무 편 채 무게 중심이 앞에 남으면 허리에 부담이 크다고 하고, 등 날엔 너무 깊이 내려가지 말라고 해요.',
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
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-bench-press-fixes',
    topicId: 'form',
    titleKo: '벤치프레스 흔한 실수 바로잡기',
    pointsKo: [
      { text: '팔꿈치를 너무 벌리면 어깨에 부담이 간다며 바를 가슴 아래쪽(유두 높이)에 내리라고 해요.', from: 'script' },
      { text: '바를 가슴에 댔을 때 손목·팔뚝·팔꿈치가 바 바로 밑에 일직선이 되는 너비로 잡아요.', from: 'script' },
      { text: '가슴을 들고 등으로 바를 당겨 내리듯 견갑을 모으면 어깨가 덜 끼어든다고 해요.', from: 'script' },
      { text: '올릴 땐 밀어 내기보다 위팔을 가슴 안쪽으로 모으는 느낌으로, 필요하면 무게를 줄이라고 해요.', from: 'script' },
      { text: '발은 넓게 딛고 광배에 힘을 준 뒤 배에 숨을 채워 몸통을 단단히 해요.', from: 'script' },
    ],
    cautionKo: '자세를 고쳐도 바닥까지 내릴 때 어깨가 불편하면 조금 덜 내리거나 덤벨·머신으로 바꿔도 된다고 해요. 통증이 계속된다면 전문가와 먼저 상의하세요.',
    muscles: ['chest', 'shoulders'],
    exerciseIds: ['seed-barbell-bench-press'],
    moment: 'before',
    chapters: [
      { sec: 24, labelKo: '팔꿈치 각도와 바 경로' },
      { sec: 97, labelKo: '스미스 머신에서는' },
      { sec: 136, labelKo: '몸에 맞는 그립 너비' },
      { sec: 225, labelKo: '올릴 때 가슴 모으기' },
      { sec: 314, labelKo: '온몸 긴장 세팅' },
      { sec: 389, labelKo: '프리웨이트 대신 머신·덤벨' },
    ],
    source: {
      videoId: 'JizeVA3Ba3A',
      title: 'The Worst Bench Press Mistakes Everyone Makes (Avoid These)',
      channel: 'Jeremy Ethier',
      channelUrl: 'https://www.youtube.com/@JeremyEthier',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-lat-pulldown-form',
    topicId: 'form',
    titleKo: '팔 말고 등으로 랫풀다운',
    pointsKo: [
      { text: '무릎 패드는 무릎보다 1~2칸 높게, 케이블이 정수리·골반과 일직선이 되게 앉으라고 해요.', from: 'script' },
      { text: '그립은 어깨너비보다 주먹 하나 넓게 잡고, 가슴을 살짝 든 채 상체는 세워 둬요.', from: 'script' },
      { text: '팔꿈치를 바닥 쪽으로 찍듯 옆구리를 스치며 당기고, 1초 수축 뒤 3초 동안 90%까지만 펴요.', from: 'script' },
      { text: '상체를 뒤로 눕히기, 팔꿈치가 뒤로 빠지기, 너무 넓은 그립을 흔한 실수로 꼽아요.', from: 'script' },
      { text: '12~15회 가능한 무게로 4세트, 세트 사이 1분~1분 30초 쉬라고 해요.', from: 'script' },
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
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-bicep-curl-mistakes',
    topicId: 'form',
    titleKo: '바이셉스 컬 실수 5가지',
    pointsKo: [
      { text: '아래쪽에서 살짝 반동을 주면 무게가 허리로 간다고 해요 — 무게를 줄이고 특히 세트 끝 무렵 흔들림을 줄이라고 해요.', from: 'script' },
      { text: '아래쪽 늘어난 구간이 이두 아랫부분 성장에 큰 자극이라고 해요 — 삼두에 힘을 줘 팔을 끝까지 펴고 다음 반복으로 가요.', from: 'script' },
      { text: '손목을 굽히면 팔뚝이 먼저 지친다고 해서, 손목을 굽히지 말고 팔뚝과 일자로 맞춘 채 들어요.', from: 'script' },
      { text: '팔꿈치가 앞으로 많이 밀리면 앞 어깨가 대신 일한다고 해서, 팔꿈치를 거의 고정해요.', from: 'script' },
      { text: '이두에 집중해 짜내듯 들라고 해요 — 몸 쪽으로 끌어당기고 새끼손가락을 위로 돌리는 느낌이라고 해요.', from: 'script' },
    ],
    muscles: ['biceps'],
    exerciseIds: ['seed-barbell-curl', 'seed-dumbbell-curl'],
    moment: 'before',
    chapters: [
      { sec: 18, labelKo: '실수 1 — 반동으로 시작' },
      { sec: 39, labelKo: '실수 2 — 아래 구간 줄이기' },
      { sec: 216, labelKo: '실수 3 — 손목 굽힘' },
      { sec: 262, labelKo: '실수 4 — 팔꿈치 밀림' },
      { sec: 326, labelKo: '실수 5 — 이두에 집중하지 않기' },
    ],
    source: {
      videoId: 'jjnJHhzZUUM',
      title: 'STOP Doing Bicep Curls Like This (5 Mistakes Slowing Your Gains)',
      channel: 'Jeremy Ethier',
      channelUrl: 'https://www.youtube.com/@JeremyEthier',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-deadlift-steps-back',
    topicId: 'injury',
    titleKo: '허리 부담 줄이는 데드리프트 4단계',
    pointsKo: [
      { text: '처음엔 바를 무릎 높이에 두고 2~3cm 떨어져 선 뒤, 엉덩이를 뒤로 빼 손이 바에 닿는 동작만 3번 연습하라고 해요.', from: 'script' },
      { text: '바를 잡은 채 코로 마시며 어깨는 들썩이지 않고 갈비뼈 앞·옆·뒤가 부풀게 하는 횡격막 호흡을 연습해요.', from: 'script' },
      { text: '발로 바닥을 누르며 바 무게만큼만 힘을 줘 버티면 뒷다리·엉덩이·등에 긴장이 쌓인다고 해요 — 줄다리기처럼 팽팽하게요.', from: 'script' },
      { text: '그다음 아주 조금만 힘을 더 줘 바가 저절로 뜨게 하고, 처음엔 1회씩 끊어 하다 3·5·10회로 늘리라고 해요.', from: 'script' },
      { text: '무릎 높이에서 익숙해지면 그때 더 낮은 위치로 내려가 보라고 해요.', from: 'script' },
    ],
    cautionKo: '허리 통증이나 디스크가 있다면 따라 하기 전에 전문가와 먼저 상의하세요.',
    muscles: ['back', 'hamstrings', 'glutes'],
    exerciseIds: ['seed-deadlift'],
    moment: 'before',
    chapters: [
      { sec: 17, labelKo: '1단계 — 바벨 위치와 힙 힌지' },
      { sec: 123, labelKo: '2단계 — 복압과 횡격막 호흡' },
      { sec: 279, labelKo: '3단계 — 바닥 누르기와 텐션' },
      { sec: 373, labelKo: '4단계 — 가볍게 들어 올리기' },
      { sec: 465, labelKo: '실전 — 중량과 가동 범위' },
      { sec: 563, labelKo: '정리 — 몸 숙이는 법 배우기' },
    ],
    source: {
      videoId: 'Se9as2opl0I',
      title: '데드리프트 “단계적 운동방법” 모르고하면 허리 큰일납니다! 허리 안아프게 데드리프트 하는 방법',
      channel: '허리&PT : 부상 없이 헬스합시다',
      channelUrl: 'https://www.youtube.com/@%ED%94%BC%ED%8B%B0%ED%8C%8C%EC%BB%A4',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-bench-shoulder-grip',
    topicId: 'injury',
    titleKo: '벤치프레스 그립과 어깨 내회전 점검',
    pointsKo: [
      { text: '손을 삼각형으로 벌려 바벨을 손바닥 아래쪽에 얹고, 손목은 세우지 않는 그립을 보여 줘요.', from: 'script' },
      { text: '일자 바벨을 잡으려면 어깨가 살짝 안으로 도는(내회전) 게 자연스럽다고 해요 — 어깨를 비틀어 바깥으로 돌릴 필요가 없다고 해요.', from: 'script' },
      { text: '팔꿈치는 억지로 조이지 말고 덤벨 플라이처럼 옆으로 자연스럽게 벌어지며 내리라고 해요.', from: 'script' },
      { text: '다만 팔을 몸통에서 너무 벌리지 말고 바벨은 가슴 젖꼭지 부근으로 내리라고 해요.', from: 'script' },
      { text: '밴드를 바벨처럼 잡고 옆으로 벌리는 연습 20번 뒤 같은 느낌으로 바벨을 잡아 보라고 해요 — 그립 너비도 바꿔 가며 편한 곳을 찾으라고 해요.', from: 'script' },
    ],
    cautionKo: '벤치프레스 중 어깨가 아프다면 따라 하기 전에 전문가와 먼저 상의하세요.',
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
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-hip-hinge-sit-stand',
    topicId: 'injury',
    titleKo: '힙힌지로 앉았다 일어나기',
    pointsKo: [
      { text: '힙힌지는 허리를 편 채 고관절만 접는 움직임이라고 해요 — 허리를 구부정하게 쓰며 일어나면 허리에 부담이 간다고 해요.', from: 'script' },
      { text: '앉을 때는 가슴을 내밀고 엉덩이를 뒤로 45도 방향으로 빼며 살포시 앉으라고 해요.', from: 'script' },
      { text: '일어날 때는 몸통을 앞으로 기울여 체중이 발바닥에 실리는 게 느껴지면 바닥을 쭉 밀며 일어나요.', from: 'script' },
      { text: '발은 어깨너비, 무릎은 안으로 모이지 않게 두 번째 발가락 방향으로 두라고 해요.', from: 'script' },
      { text: '같은 원리를 스쿼트에도 쓴다고 하며, 함께 3번 연습해 보여 줘요.', from: 'script' },
    ],
    muscles: ['glutes', 'hamstrings'],
    moment: 'anytime',
    chapters: [
      { sec: 59, labelKo: '힙힌지란' },
      { sec: 135, labelKo: '옆에서 본 앉고 일어서기' },
      { sec: 212, labelKo: '앞에서 본 발·무릎 위치' },
      { sec: 269, labelKo: '함께 3번 연습' },
    ],
    source: {
      videoId: 'kf1J77kUEAo',
      title: '관절이 상하지 않게 힙힌지를 이용해서 제대로 앉았다 일어나는 방법 알려드립니다',
      channel: '운동가이더',
      channelUrl: 'https://www.youtube.com/@user-FETC',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-wall-squat-knee',
    topicId: 'injury',
    titleKo: '벽에 기대 스쿼트 익히기',
    pointsKo: [
      { text: '벽에 등을 붙이고 발을 골반~어깨너비 11자로 둔 뒤 한 발짝 앞으로 내딛고 무릎을 살짝 굽히는 방법을 보여 줘요.', from: 'script' },
      { text: '무릎이 안으로 모이지 않게 엄지·둘째 발가락 사이 방향과 맞추라고 해요.', from: 'script' },
      { text: '그 자세로 30초~1분 버티고, 익숙해지면 허리를 편 채 인사하듯 상체를 숙여 허벅지·엉덩이에 힘을 싣는다고 해요.', from: 'script' },
      { text: '앉는 깊이와 발을 앞으로 내미는 거리로 난이도를 단계별로 조절할 수 있다고 해요.', from: 'script' },
    ],
    cautionKo: '스쿼트할 때 무릎이 아프다면 따라 하기 전에 전문가와 먼저 상의하세요.',
    muscles: ['quads', 'glutes'],
    moment: 'anytime',
    chapters: [
      { sec: 41, labelKo: '벽에 기대 발 위치 잡기' },
      { sec: 101, labelKo: '무릎 방향 맞추기' },
      { sec: 151, labelKo: '버티기와 힙힌지 더하기' },
      { sec: 185, labelKo: '옆에서 보기' },
      { sec: 254, labelKo: '함께 10회 따라 하기' },
    ],
    source: {
      videoId: '3eykonrgEu4',
      title: '스쿼트를 무리되지 않고 쉽게 하는 방법 wall squat 벽 대고 스쿼트 하기',
      channel: '운동가이더',
      channelUrl: 'https://www.youtube.com/@user-FETC',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-bracing-breath',
    topicId: 'injury',
    titleKo: '복압 잡는 호흡 연습',
    pointsKo: [
      { text: '몸을 건물에 비유해 가운데(몸통)가 단단히 받쳐야 스쿼트·데드리프트를 안정적으로 할 수 있다고 설명해요.', from: 'script' },
      { text: '엎드려 배로 숨 쉬는 연습부터 시작해, 짧게 내쉬며 배에 힘을 잡는 단계로 넘어가요.', from: 'script' },
      { text: '그다음 플랭크 자세에서 그 힘을 유지하는 연습을 보여 줘요.', from: 'script' },
      { text: '그 감각을 적당한 무게의 스쿼트·데드리프트·벤치프레스에 옮기라고 해요.', from: 'script' },
    ],
    cautionKo: '허리가 불편하다면 따라 하기 전에 전문가와 먼저 상의하세요.',
    muscles: ['abs', 'back'],
    moment: 'before',
    // [원본] 설명란 근거가 약해 화면에서 뺐다(코드 리뷰 REV-089 — 설명란 두 문장뿐 / 챕터 이름뿐)
    // [원본] draft: true,
    // [개선 2026-11-09] 사용자 검수로 공개(v0.84.2)
    chapters: [
      { sec: 0, labelKo: '복압이 왜 필요한가' },
      { sec: 138, labelKo: '엎드려 배로 숨쉬기' },
      { sec: 252, labelKo: '짧게 내쉬며 복압 잡기' },
      { sec: 329, labelKo: '플랭크로 복압 유지' },
      { sec: 468, labelKo: '운동에 적용하기' },
    ],
    source: {
      videoId: 'fNwYSc4lSog',
      title: '중량 높여주는 호흡 훈련 복압 잡기 / 운동할 때 허리 아프면 호흡부터 잡아보세요',
      channel: 'MSG훈',
      channelUrl: 'https://www.youtube.com/@msg2304',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-rest-between-sets',
    topicId: 'recovery',
    titleKo: '세트 사이 몇 분 쉴까',
    pointsKo: [
      { text: '세트 사이 1분보다 3분 쉰 쪽이 근력·근육 크기가 더 늘었다는 연구를 소개해요 — 짧은 휴식은 총 작업량을 깎는대요.', from: 'script' },
      { text: '큰 운동은 최소 2분, 무겁게 할 땐 3분까지, 고립 운동은 60~90초면 충분하다고 해요.', from: 'script' },
      { text: '짧게 쉬는 고립 운동은 루틴 뒤쪽에 두라고 해요 — 앞에 몰면 피로가 쌓여 큰 운동을 망친다고 해요.', from: 'script' },
      { text: '숨이 아니라 횟수로 판단하라고 해요 — 다음 세트 횟수가 크게 떨어지면 30~60초 더 쉬고, 휴대폰은 보지 않는다고 해요.', from: 'script' },
      { text: '시간이 없으면 가슴·등처럼 반대 근육을 번갈아 하는 방법을 들고, 체력·칼로리 소모가 목적이면 짧은 휴식도 괜찮다고 해요.', from: 'script' },
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
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-recovery-beginners',
    topicId: 'recovery',
    titleKo: '초보일수록 회복이 먼저',
    pointsKo: [
      { text: '근육은 운동할 때가 아니라 쉬며 회복할 때 커진다고 하며, 매일 고강도·잠 부족을 초보자의 흔한 실수로 꼽아요.', from: 'script' },
      { text: '근육통이 심하다고 좋은 운동은 아니라고 해요 — 익숙하지 않은 자극 때문일 때가 많다고 해요.', from: 'script' },
      { text: '회복 방법으로 완전히 쉬기보다 가벼운 걷기·스트레칭·폼롤러로 몸을 움직이는 것을 소개해요.', from: 'script' },
      { text: '회복의 세 가지로 수면(7~8시간), 단백질과 탄수화물 챙기기, 쉬는 날과 강도 조절을 들어요.', from: 'script' },
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
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-cooldown-8min',
    topicId: 'recovery',
    titleKo: '운동 뒤 8분 쿨다운 스트레칭',
    pointsKo: [
      { text: '운동을 마친 뒤 전신을 늘려 주는 8분 쿨다운 스트레칭이에요.', from: 'desc' },
      { text: '네발 자세의 캣카우·아기 자세·코브라로 등과 가슴을 풀고, 팔을 반대 겨드랑이 아래로 넣어 어깨를 늘려요.', from: 'script' },
      { text: '누워서 무릎 당기기·다리 넘겨 몸통 비틀기, 앉아서 옆구리·나비 자세·다리 꼬아 숙이기로 하체를 풀어요.', from: 'script' },
      { text: '마지막엔 서서 팔 당기기·삼두 늘리기·무릎 당기기로 마무리하고, 짧더라도 운동 뒤 스트레칭을 습관으로 하자고 해요.', from: 'script' },
    ],
    cautionKo: '루틴을 시작하기 전에 의사와 상의하고, 따라 하는 건 각자 책임이라고 안내해요.',
    muscles: ['fullBody'],
    moment: 'after',
    chapters: [
      { sec: 14, labelKo: '네발 자세 — 캣카우·코브라' },
      { sec: 100, labelKo: '어깨 — 팔 넣어 비틀기' },
      { sec: 131, labelKo: '누워서 다리·몸통' },
      { sec: 250, labelKo: '앉아서 옆구리·고관절' },
      { sec: 378, labelKo: '런지 자세 허벅지 안쪽' },
      { sec: 422, labelKo: '서서 팔·다리 마무리' },
    ],
    source: {
      videoId: 'zDcOqeLGymE',
      title: '8분 루틴 꼭 해주세요! 운동 후 전신 스트레칭  - 8분 쿨다운 스트레칭',
      channel: '빅씨스 Bigsis',
      channelUrl: 'https://www.youtube.com/@BIGSIS',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
  },
  {
    id: 'tip-foam-roller-full',
    topicId: 'recovery',
    titleKo: '폼롤러로 하체·상체 풀기',
    pointsKo: [
      { text: '하체는 엉덩이 → 햄스트링 → 다리 안·바깥 → 허벅지 앞 → 종아리, 상체는 가슴 → 광배근 → 목 → 등 → 허리 순으로 풀어요.', from: 'script' },
      { text: '한쪽씩 굴리며 굳은 곳을 찾되, 다리 바깥·안쪽처럼 아픈 곳은 말랑한 폼롤러로 살살 자주 하라고 해요.', from: 'script' },
      { text: '팔·반대쪽 다리로 체중 일부를 받쳐 강도를 조절하고, 풀 다리는 힘을 빼 와이퍼처럼 흔들라고 해요.', from: 'script' },
      { text: '허리를 풀 때는 어깨와 발바닥을 바닥에 대 체중을 나눠 허리뼈에 부담이 덜 가게 한다고 해요.', from: 'script' },
      { text: '근육을 먼저 풀어 준 다음 강화 운동을 이어 가길 권해요.', from: 'desc' },
    ],
    cautionKo: '허리 수술을 받았거나 무릎이 아프다면 따라 하기 전에 전문가와 먼저 상의하세요.',
    muscles: ['fullBody'],
    moment: 'after',
    chapters: [
      { sec: 11, labelKo: '엉덩이' },
      { sec: 135, labelKo: '햄스트링' },
      { sec: 257, labelKo: '다리 바깥·안쪽' },
      { sec: 494, labelKo: '허벅지 앞·정강이·종아리' },
      { sec: 834, labelKo: '상체 — 가슴·광배근' },
      { sec: 1194, labelKo: '목·등·허리' },
    ],
    source: {
      videoId: 'plrLB3EnO1g',
      title: '폼롤러 스트레칭, 운동(하체+상체=전신)',
      channel: '물리치료사.PT재석',
      channelUrl: 'https://www.youtube.com/@PTjaeseok',
      verifiedAt: '2026-11-09',
    },
    scriptCheckedAt: '2026-11-10',
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
