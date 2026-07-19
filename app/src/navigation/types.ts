// 네비게이션 파라미터 계약 (모든 피처 화면이 준수). 비직렬화 값(함수 등)은 params에 넣지 않는다.
// 운동 선택은 utils/picker.ts 콜백 레지스트리 사용.
import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  WorkoutTab: undefined; // 루틴 목록 + 세션 시작 (routines 피처)
  FeedTab: undefined; // 소셜 피드 (social 피처, SRS-007)
  HistoryTab: undefined; // 완료 세션 히스토리 (analytics 피처)
  CalendarTab: undefined; // 운동 캘린더 — 월별 지속성·루틴 (SRS-011 책임감 루프)
  StatsTab: undefined; // 분석 대시보드 (analytics 피처)
  ProfileTab: undefined; // 프로필·설정 (profile 피처)
  FeedbackTab: undefined; // 개발 피드백 → PLM 아이디어보드 (coworker/admin 전용, SRS-006)
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  ExerciseList: { mode?: 'browse' | 'pick' } | undefined; // SRS-001
  ExerciseDetail: { exerciseId: string }; // SRS-001
  ExerciseForm: { exerciseId?: string } | undefined; // SRS-001 커스텀 등록/수정
  RoutineEditor: { routineId?: string } | undefined; // SRS-002 (없으면 신규)
  ProgramGenerator: undefined; // SRS-009 규칙기반 프로그램 생성
  ActiveWorkout: { workoutId: string }; // SRS-003/004
  WorkoutSummary: { workoutId: string }; // SRS-004
  WorkoutDetail: { workoutId: string }; // SRS-005 히스토리 상세
  Auth: undefined; // SRS-006 로그인/가입 스텁
  Discover: undefined; // SRS-018 사람 찾기·팔로우
  Conversations: undefined; // SRS-017 DM 대화 목록
  Conversation: { conversationId: string; title?: string; isGroup?: boolean }; // SRS-017 DM 쓰레드
  NewGroup: undefined; // SRS-017 그룹 만들기
  Comments: { postId: string }; // SRS-007 댓글
  UserProfile: { userId: string }; // SRS-008 공개 프로필
  Notifications: undefined; // SRS-020 알림 센터
  ModerationQueue: undefined; // SRS-020 모더레이션 큐(모더레이터)
  Explore: undefined; // SRS-018 발견(인기·트렌딩·추천)
  Hashtag: { tag: string }; // SRS-018 해시태그별 포스트
  BlockedUsers: undefined; // SRS-018 차단 목록 관리
  FollowList: { userId: string; mode: 'followers' | 'following' }; // SRS-018 팔로워/팔로잉 목록
  Bookmarks: undefined; // SRS-007 저장한 게시물
  NearbyGyms: undefined; // SRS-035 위치 기반 주변 헬스장 발견·추천
};

// 화면 컴포넌트 타입 헬퍼
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

// 탭 화면의 navigation은 부모 스택 라우트(ActiveWorkout 등)로도 이동할 수 있어야 하므로 합성 타입.
export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
