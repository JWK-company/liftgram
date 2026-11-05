// 통계 이름표(SPEC-033). 앱 문구에서 옮겼다. 서버 이벤트 이름이 늘면 units.test.ts 가 잡는다.
export const EVENT_LABELS: Record<string, string> = {
  app_open: "앱 열기",
  workout_start: "빈 운동 시작",
  workout_start_routine: "루틴으로 운동 시작",
  workout_finish: "운동 완료",
  routine_create: "루틴 만들기",
  routine_edit: "루틴 고치기",
  routine_import: "루틴 가져오기",
  exercise_search: "종목 검색",
  exercise_finder: "종목 찾기",
  rest_timer: "휴식 타이머",
  feed_tab_following: "팔로잉 탭",
  feed_tab_recommended: "추천 탭",
  gym_search: "헬스장 찾기",
  data_import: "기록 가져오기",
  data_export: "기록 내보내기",
  feedback_send: "의견 보내기",
  ad_click: "광고 누름",
  screen_home: "홈",
  screen_workout: "운동",
  screen_routines: "루틴",
  screen_exercises: "종목",
  screen_history: "기록",
  screen_stats: "통계",
  screen_calendar: "달력",
  screen_feed: "피드",
  screen_profile: "프로필",
  screen_messages: "DM",
  screen_notifications: "알림",
  screen_coaching: "코칭",
  screen_gyms: "헬스장",
  screen_program: "프로그램",
  screen_explore: "둘러보기",
  screen_account: "계정",
  screen_gear: "장비",
  screen_other: "기타",
};

export const PLATFORM_LABELS: Record<string, string> = {
  web: "웹",
  android: "안드로이드",
  ios: "iOS",
  unknown: "모름",
};

export const PROVIDER_LABELS: Record<string, string> = {
  email: "이메일",
  google: "구글",
  kakao: "카카오",
  naver: "네이버",
  apple: "애플",
};

export const CONTENT_LABELS: Record<string, string> = {
  post: "글",
  comment: "댓글",
  like: "좋아요",
  follow: "팔로우",
  story: "스토리",
  message: "DM",
  gear_click: "장비 링크 클릭",
};

/** 이름표가 없으면 서버 이름을 그대로 보인다. 숫자가 사라지는 것보다 낫다. */
export function labelOf(labels: Record<string, string>, name: string): string {
  return Object.hasOwn(labels, name) ? labels[name] : name;
}
