// 네비게이션 파라미터 계약 (모든 피처 화면이 준수). 비직렬화 값(함수 등)은 params에 넣지 않는다.
// 운동 선택은 utils/picker.ts 콜백 레지스트리 사용.
import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  WorkoutTab: undefined; // 루틴 목록 + 세션 시작 (routines 피처)
  FeedTab: undefined; // 소셜 피드 (social 피처, SRS-007)
  HistoryTab: undefined; // 완료 세션 히스토리 (analytics 피처)
  StatsTab: undefined; // 분석 대시보드 (analytics 피처)
  ProfileTab: undefined; // 프로필·설정 (profile 피처)
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
  Conversation: { conversationId: string; title?: string }; // SRS-017 DM 쓰레드
  Comments: { postId: string }; // SRS-007 댓글
  UserProfile: { userId: string }; // SRS-008 공개 프로필
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
