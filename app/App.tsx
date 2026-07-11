import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme, useNavigationContainerRef, type Theme, type LinkingOptions } from '@react-navigation/native';
import { colors } from './src/theme';
import { RootNavigator } from './src/navigation/RootNavigator';
import type { RootStackParamList } from './src/navigation/types';
import { UserProvider } from './src/state/userContext';
import { SessionProvider } from './src/state/sessionContext';
import { seedExercisesIfNeeded } from './src/data/seedRunner';
import { backfillVariantKeysV6, consolidateExercisesV8 } from './src/data/workoutRepository';
import { AppText, AlertHost, ConfigBanner, GlobalWorkoutBar } from './src/components';
import { OnboardingOverlay } from './src/features/onboarding/OnboardingOverlay';
import { installWebAlert } from './src/utils/alert';
import { LanguageSync } from './src/i18n/LanguageSync';
import { t } from './src/i18n';
import { serverApi, warmupServer } from './src/sync/serverApi';
import { scheduleSync } from './src/sync/syncEngine';
import { registerPushToken } from './src/push/push';
import { initPwa } from './src/push/pwa';

// 웹에서 RN Alert.alert(no-op)를 테마 모달 호스트로 라우팅(확인/취소 콜백 정상화).
installWebAlert();

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    primary: colors.primary,
    border: colors.border,
  },
};

// 웹/PWA 히스토리 통합 — 화면마다 URL을 부여해 window.history에 엔트리가 쌓이게 한다.
// 이게 없으면 웹에선 화면 전환 시 URL이 안 바뀌어 히스토리가 비고, standalone PWA에서
// 하드웨어/제스처 뒤로가기가 앱 내부 이동이 아니라 창(앱) 종료로 이어진다.
const linking: LinkingOptions<RootStackParamList> = {
  // 웹에선 window.location + config.screens가 히스토리를 담당(prefixes는 네이티브 딥링크용).
  prefixes: ['liftgram://', 'https://liftgram.app'],
  config: {
    screens: {
      Tabs: {
        screens: {
          WorkoutTab: 'workout',
          FeedTab: 'feed',
          HistoryTab: 'history',
          StatsTab: 'stats',
          ProfileTab: 'profile',
          FeedbackTab: 'feedback',
        },
      },
      ExerciseList: 'exercises',
      ExerciseDetail: 'exercise/:exerciseId',
      ExerciseForm: 'exercise-form',
      RoutineEditor: 'routine',
      ProgramGenerator: 'program-generator',
      ActiveWorkout: 'active/:workoutId',
      WorkoutSummary: 'summary/:workoutId',
      WorkoutDetail: 'workout-detail/:workoutId',
      Auth: 'auth',
      Discover: 'discover',
      Conversations: 'messages',
      Conversation: 'messages/:conversationId',
      NewGroup: 'new-group',
      Comments: 'post/:postId/comments',
      UserProfile: 'user/:userId',
      Notifications: 'notifications',
      ModerationQueue: 'moderation',
      Explore: 'explore',
      Hashtag: 'hashtag/:tag',
      BlockedUsers: 'blocked',
      FollowList: 'follow/:userId/:mode',
      Bookmarks: 'bookmarks',
    },
  },
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await seedExercisesIfNeeded();
        await backfillVariantKeysV6(); // v6 무손실 변형 백필(멱등) — 레거시 machine_variant→variant_key. @plm SRS-028
        await consolidateExercisesV8(); // #13 종목 통합(멱등) — 인클라인 프레스 등 기구 변형으로 흡수.
      } catch (e) {
        setError(String(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // PWA(웹) 부트스트랩 + 이미 로그인된 상태면 푸시 토큰 갱신(네이티브·graceful).
  useEffect(() => {
    initPwa();
    // 무료티어 콜드스타트 대비 — 슬립 상태의 서버를 부팅 시 미리 깨운다(비차단·graceful).
    void warmupServer();
    serverApi
      .isLoggedIn()
      .then((yes) => {
        if (yes) {
          void registerPushToken();
          scheduleSync(); // 부팅 동기 — 영속 토큰으로 '이미 로그인된' 세션 재오픈 시에도 동기
        }
      })
      .catch(() => {});
  }, []);

  // 지속 동기(SRS-006) — 로그인 이후 생성/변경분이 다른 기기로 전파되도록. 기존엔 로그인 '순간'
  // 에만 동기돼, 재오픈된 세션에선 트리거가 없어 루틴·운동기록이 교차 반영되지 않았다.
  // (1) 포그라운드 복귀 시, (2) 실행 중 주기(2분). scheduleSync가 로그인 가드·단일비행·graceful 처리.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') scheduleSync();
    });
    const iv = setInterval(() => scheduleSync(), 120_000);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, []);

  const navRef = useNavigationContainerRef<RootStackParamList>();
  const [routeName, setRouteName] = useState<string | undefined>(undefined);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <UserProvider>
        <LanguageSync />
        {/* 배포 오설정(SERVER_URL=localhost) 경고 배너 — 정상 배포 시 null(레이아웃 영향 0). */}
        <ConfigBanner />
        <View style={{ flex: 1 }}>
          <SessionProvider>
            <NavigationContainer
              ref={navRef}
              theme={navTheme}
              linking={linking}
              onStateChange={() => setRouteName(navRef.getCurrentRoute()?.name)}
            >
              {error ? (
                <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                  <AppText variant="heading" center>
                    {t('app.initError')}
                  </AppText>
                  <AppText variant="caption" color="textMuted" center style={{ marginTop: 8 }}>
                    {error}
                  </AppText>
                </View>
              ) : (
                <RootNavigator />
              )}
            </NavigationContainer>
            <GlobalWorkoutBar navRef={navRef} routeName={routeName} />
          </SessionProvider>
        </View>
        {/* AlertHost·OnboardingOverlay는 useT()→useUser()에 의존 → 반드시 UserProvider 안에 마운트. */}
        <AlertHost />
        <OnboardingOverlay />
        </UserProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
